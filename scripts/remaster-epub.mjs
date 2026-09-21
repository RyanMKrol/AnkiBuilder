#!/usr/bin/env node
// Turns a book the pipeline cannot read into one it can.
//
// The pipeline reads EPUBs whose content is text in XHTML and whose table of contents names the
// lessons. Some books are neither: a PDF run through Calibre's "PDF Reflow" becomes an EPUB of
// page images with a one-entry TOC, which parses without error and then builds nothing useful.
// This script rebuilds such a book as a normal EPUB, one step at a time, so each paid step can be
// checked before the next one runs. See docs/designs/image-epub-remaster.md.
//
//   node scripts/remaster-epub.mjs check      <book.epub>
//   node scripts/remaster-epub.mjs ocr        <book.epub>
//   node scripts/remaster-epub.mjs outline    <book.epub>
//   node scripts/remaster-epub.mjs transcribe <book.epub> --entry <n> [--pages a-b] [--concurrency 4]
//   node scripts/remaster-epub.mjs crosscheck <book.epub> [--entry <n>]
//   node scripts/remaster-epub.mjs build      <book.epub> --out <remastered.epub> [--entry <n> ...]
//                                             [--allow-missing]
//   node scripts/remaster-epub.mjs verify     <book.epub> --book <remastered.epub> [--entry <n> ...]
//
// `check` is free and read-only. `ocr` is free (Apple Vision, local). `outline` is one text-only
// model call. `transcribe` is one vision call per page and is the only step that costs real
// money at scale, so it only ever runs on the pages you name.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { hashEpubFile } from "../src/corpus/epubLibrary.js";
import { getBookTitle } from "../src/corpus/epubArchive.js";
import { assessEpubEligibility, formatEligibility } from "../src/corpus/epubEligibility.js";
import { remasterRoot, remasterPaths, pageFileStem } from "../src/remaster/workspace.js";
import { extractPageImages } from "../src/remaster/sourcePages.js";
import { ensureOcrBinary, ocrPages, loadPageOcr } from "../src/remaster/visionOcr.js";
import { renderOutlinePrompt, parseOutline, formatOutline } from "../src/remaster/outline.js";
import {
  renderPagePrompt,
  parsePageReply,
  serializeTranscript,
} from "../src/remaster/pageTranscribe.js";
import { crossCheckPage } from "../src/remaster/ocrCrossCheck.js";
import { buildRemasteredEpub } from "../src/remaster/epubWriter.js";
import { transcribeWithRetries } from "../src/remaster/transcribeRetry.js";
import { verifyRemasteredEpub, formatVerification } from "../src/remaster/verifyRemaster.js";
import { runOutlineClaude, runTranscribeClaude } from "../src/remaster/remasterRunners.js";
import { writeFileAtomic } from "../src/util/atomicWrite.js";

const [command, target, ...rest] = process.argv.slice(2);
const REMASTER_MODIFIED = "2000-01-01T00:00:00Z";

function option(name) {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : undefined;
}

function optionAll(name) {
  return rest.flatMap((arg, index) => (arg === `--${name}` ? [rest[index + 1]] : []));
}

function usage() {
  console.error(
    "usage: node scripts/remaster-epub.mjs <check|ocr|outline|transcribe|crosscheck|build|verify> <book.epub> [options]",
  );
  process.exit(2);
}

if (!command || !target) usage();
const epubPath = resolve(target);
if (!existsSync(epubPath)) {
  console.error(`no such file: ${epubPath}`);
  process.exit(2);
}

const log = (line) => console.log(line);

async function workspace() {
  const hash = hashEpubFile(epubPath);
  const paths = remasterPaths(remasterRoot(hash));
  const pages = extractPageImages(epubPath, paths.images);
  return { hash, paths, pages };
}

const commands = {
  async check() {
    const verdict = assessEpubEligibility(epubPath);
    for (const line of formatEligibility(verdict)) log(line);
  },

  async ocr() {
    const { paths, pages } = await workspace();
    log(`${pages.length} page image(s) in ${paths.images}`);
    const binaryPath = ensureOcrBinary(paths.ocrBinary);
    const concurrency = Number(option("concurrency") ?? 4);
    const result = await ocrPages(pages, {
      binaryPath,
      ocrDir: paths.ocr,
      stem: pageFileStem,
      concurrency,
      log,
    });
    log(`OCR: ${result.ocred} page(s) read, ${result.skipped} already done -> ${paths.ocr}`);
  },
};

function loadOutline(paths) {
  if (!existsSync(paths.outline)) {
    console.error(`no outline yet (${paths.outline}); run the outline step first`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(paths.outline, "utf-8"));
}

function selectedEntries(outline) {
  const wanted = optionAll("entry").map(Number);
  if (!wanted.length) return outline.entries;
  const entries = outline.entries.filter((entry) => wanted.includes(entry.number));
  if (entries.length !== wanted.length) {
    console.error(`no such outline entry among: ${wanted.join(", ")}`);
    process.exit(2);
  }
  return entries;
}

function pageRange(entry) {
  const pages = option("pages");
  let first = entry.firstPage;
  let last = entry.lastPage;
  if (pages) {
    [first, last] = pages.split("-").map(Number);
    last ??= first;
  }
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

function tryParse(raw, number) {
  try {
    return parsePageReply(raw, { pageNumber: number });
  } catch {
    return null;
  }
}

function transcriptPath(paths, number) {
  return join(paths.transcripts, `${pageFileStem(number)}.xhtml`);
}

function loadTranscript(paths, number) {
  const path = transcriptPath(paths, number);
  if (!existsSync(path)) return null;
  return parsePageReply(readFileSync(path, "utf-8"), { pageNumber: number });
}

function runCrossCheck(paths, number, body) {
  const ocr = loadPageOcr(paths.ocr, pageFileStem, number);
  if (!ocr) return null;
  const result = { page: number, ...crossCheckPage({ body, ocr }) };
  mkdirSync(paths.checks, { recursive: true });
  writeFileAtomic(
    join(paths.checks, `${pageFileStem(number)}.json`),
    `${JSON.stringify(result, null, 1)}\n`,
  );
  return result;
}

function describeCheck(check) {
  if (!check) return "no OCR to check against";
  const parts = [
    `${check.disagreeingChars}/${check.ocrJapaneseChars} JA chars differ`,
    `${check.disagreeingWords} words differ`,
  ];
  if (check.onlyInOcr) parts.push(`OCR only: ${check.onlyInOcr}`);
  if (check.onlyInTranscript) parts.push(`transcript only: ${check.onlyInTranscript}`);
  return `${check.flagged ? "FLAG " : ""}${parts.join("; ")}`;
}

function flaggedPages(paths, entries) {
  const flagged = [];
  for (const entry of entries) {
    for (let number = entry.firstPage; number <= entry.lastPage; number++) {
      const path = join(paths.checks, `${pageFileStem(number)}.json`);
      if (existsSync(path) && JSON.parse(readFileSync(path, "utf-8")).flagged) flagged.push(number);
    }
  }
  return flagged;
}

function reportVerification(builtPath, paths, entries, outline) {
  const bookPages = outline.entries.at(-1).lastPage;
  const result = verifyRemasteredEpub(builtPath, { expected: entries, bookPages });
  for (const line of formatVerification(result, { flaggedPages: flaggedPages(paths, entries) })) {
    log(line);
  }
  return result.problems.length === 0;
}

Object.assign(commands, {
  async outline() {
    const { paths, pages } = await workspace();
    const ocrByPage = new Map();
    for (const page of pages) {
      const ocr = loadPageOcr(paths.ocr, pageFileStem, page.number);
      if (!ocr) {
        console.error(`page ${page.number} has no OCR yet; run the ocr step first`);
        process.exit(1);
      }
      ocrByPage.set(page.number, ocr);
    }
    const prompt = renderOutlinePrompt({
      bookTitle: getBookTitle(epubPath),
      pageCount: pages.length,
      ocrByPage,
    });
    log(`outline: one text-only model call over ${pages.length} pages of OCR margins`);
    const raw = runOutlineClaude(prompt);
    mkdirSync(paths.root, { recursive: true });
    writeFileAtomic(join(paths.root, "outline.raw.txt"), raw);
    const outline = parseOutline(raw, { pageCount: pages.length });
    writeFileAtomic(paths.outline, `${JSON.stringify(outline, null, 2)}\n`);
    for (const line of formatOutline(outline)) log(line);
    log(
      `\nwritten to ${paths.outline}. Read it before transcribing: every deck name comes from it.`,
    );
  },

  async transcribe() {
    const { paths, pages } = await workspace();
    const outline = loadOutline(paths);
    const [entry, ...more] = selectedEntries(outline);
    if (!entry || more.length || !option("entry")) {
      console.error("transcribe takes exactly one --entry <n> (and optionally --pages a-b)");
      process.exit(2);
    }
    const force = rest.includes("--force");
    const numbers = pageRange(entry).filter(
      (number) => force || !existsSync(transcriptPath(paths, number)),
    );
    const byNumber = new Map(pages.map((page) => [page.number, page]));
    const title = getBookTitle(epubPath);
    const concurrency = Number(option("concurrency") ?? 4);
    mkdirSync(paths.transcripts, { recursive: true });
    log(`transcribe "${entry.label}": ${numbers.length} page(s) to do, ${concurrency} at a time`);

    const queue = [...numbers];
    const failures = [];
    const worker = async () => {
      while (queue.length) {
        const number = queue.shift();
        const prompt = renderPagePrompt({
          imagePath: byNumber.get(number).localPath,
          bookTitle: title,
          pageNumber: number,
          pageCount: pages.length,
          entryLabel: entry.label,
        });
        const started = Date.now();
        const rawPath = join(paths.transcripts, `${pageFileStem(number)}.raw.txt`);
        let page;
        let attempts = 0;
        // A reply already paid for is read again before paying for another: a parser fix
        // (a self-correcting reply with two <page> elements) recovers it for nothing.
        const saved = !force && existsSync(rawPath) ? readFileSync(rawPath, "utf-8") : null;
        const reparsed = saved && tryParse(saved, number);
        if (reparsed && !reparsed.problems.length) {
          page = reparsed;
        } else {
          // Quota refusals propagate out of here and end the run: see transcribeRetry.js.
          const result = await transcribeWithRetries({
            pageNumber: number,
            prompt,
            run: runTranscribeClaude,
          });
          // Every rejected reply is kept under its attempt number, so a refusal leaves a record.
          for (const failure of result.failures) {
            if (failure.raw === null) continue;
            writeFileAtomic(
              join(paths.transcripts, `${pageFileStem(number)}.attempt-${failure.attempt}.txt`),
              failure.raw,
            );
          }
          attempts = result.attempts;
          if (!result.page) {
            const reasons = result.failures.map((f) => `#${f.attempt}: ${f.reason}`).join(" / ");
            failures.push(`page ${number}: failed ${result.attempts} attempt(s): ${reasons}`);
            log(`  page ${number}: FAILED after ${result.attempts} attempt(s)`);
            continue;
          }
          writeFileAtomic(rawPath, result.raw);
          page = result.page;
        }
        const seconds = Math.round((Date.now() - started) / 1000);
        const retried = attempts > 1 ? ` (attempt ${attempts})` : "";
        writeFileAtomic(transcriptPath(paths, number), serializeTranscript(page));
        const check = runCrossCheck(paths, number, page.body);
        log(
          `  page ${number} (p.${page.printed || "-"}) ${seconds}s${retried}: ${describeCheck(check)}`,
        );
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    } catch (error) {
      if (!error.quotaExhausted) throw error;
      // Pages finished before the refusal are saved; re-running picks up the rest.
      log(`\nSTOPPED: ${error.message.split("\n")[0]}`);
      log("Transcripts already written are kept. Re-run the same command once the limit resets.");
      process.exitCode = 1;
      return;
    }
    if (failures.length) {
      log(`\n${failures.length} page(s) not transcribed:`);
      for (const failure of failures) log(`  ${failure}`);
      process.exitCode = 1;
    }
  },

  async crosscheck() {
    const { paths } = await workspace();
    const outline = loadOutline(paths);
    let flagged = 0;
    let checked = 0;
    for (const entry of selectedEntries(outline)) {
      for (const number of pageRange(entry)) {
        const page = loadTranscript(paths, number);
        if (!page) continue;
        const check = runCrossCheck(paths, number, page.body);
        checked++;
        if (check?.flagged) flagged++;
        log(`page ${number} (p.${page.printed || "-"}): ${describeCheck(check)}`);
      }
    }
    log(`\n${checked} page(s) checked, ${flagged} flagged`);
  },

  async build() {
    const out = option("out");
    if (!out) {
      console.error("build needs --out <remastered.epub>");
      process.exit(2);
    }
    const { hash, paths } = await workspace();
    const outline = loadOutline(paths);
    const allowMissing = rest.includes("--allow-missing");
    const entries = [];
    for (const entry of selectedEntries(outline)) {
      const numbers = pageRange(entry);
      const transcripts = numbers.map((number) => loadTranscript(paths, number));
      const missing = numbers.filter((_, i) => !transcripts[i]);
      if (missing.length && allowMissing) {
        // A visible hole, never a silent one: the placeholder is text the extraction model reads,
        // and it says a page is missing rather than letting the lesson look complete.
        transcripts.forEach((transcript, i) => {
          if (transcript) return;
          transcripts[i] = {
            number: numbers[i],
            printed: "",
            body: `<p class="missing-page">[Page ${numbers[i]} of the source was not transcribed. Its content is missing from this lesson.]</p>`,
          };
        });
        log(
          `  "${entry.label}": ${missing.length} page(s) left as placeholders: ${missing.join(", ")}`,
        );
      } else if (missing.length) {
        const message = `"${entry.label}" is missing ${missing.length} page transcript(s): ${missing.join(", ")}`;
        // Named or not, an incomplete lesson stops the build. Skipping it quietly when no
        // --entry was given produced a "whole book" with a lesson missing and no word about it.
        console.error(message);
        console.error(
          "transcribe the missing pages, build only the lessons you want with --entry, or pass " +
            "--allow-missing to put placeholders in",
        );
        process.exit(1);
      }
      // The outline's offset is measured over the whole book's margins; the model's own reading of
      // one page's number is not (it put page 51 at printed 51, not 42). Use the offset when the
      // book has a constant one.
      const offset = outline.printedPageOffset;
      const pagesOut = transcripts.map((page) =>
        Number.isInteger(offset) && page.number > offset
          ? { ...page, printed: String(page.number - offset) }
          : page,
      );
      entries.push({ ...entry, pages: pagesOut });
    }
    if (!entries.length) {
      console.error("no outline entry is fully transcribed yet; nothing to build");
      process.exit(1);
    }
    const bytes = buildRemasteredEpub(entries, {
      title: `${getBookTitle(epubPath)} (remastered)`,
      language: option("lang") ?? "ja",
      sourceHash: hash,
      // Fixed, not the clock. The library identifies a book by the hash of its bytes, so the
      // same transcripts must always give the same file; a timestamp here made every rebuild a
      // "new book" with an empty dedup library.
      modified: REMASTER_MODIFIED,
    });
    writeFileSync(resolve(out), bytes);
    log(`wrote ${resolve(out)}: ${entries.length} entr(ies)`);
    for (const entry of entries) {
      log(`  ${entry.label} (pages ${entry.firstPage}-${entry.lastPage})`);
    }
    // The build checks its own output end to end, every time: the file it just wrote, read back.
    const ok = reportVerification(resolve(out), paths, entries, outline);
    if (!ok) process.exitCode = 1;
    log(`next: node scripts/remaster-epub.mjs check ${out}`);
  },

  // Reads a built EPUB back against the outline. With no --entry it expects the WHOLE book, which
  // is the check to run before onboarding; --entry narrows it to the lessons named.
  async verify() {
    const built = option("book");
    if (!built || !existsSync(resolve(built))) {
      console.error("verify needs --book <remastered.epub>");
      process.exit(2);
    }
    const { paths } = await workspace();
    const outline = loadOutline(paths);
    const ok = reportVerification(resolve(built), paths, selectedEntries(outline), outline);
    if (!ok) process.exitCode = 1;
  },
});

const handler = commands[command];
if (!handler) usage();
await handler({ option, optionAll });

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
import { runOutlineClaude, runTranscribeClaude } from "../src/remaster/remasterRunners.js";
import { writeFileAtomic } from "../src/util/atomicWrite.js";

const [command, target, ...rest] = process.argv.slice(2);

function option(name) {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : undefined;
}

function optionAll(name) {
  return rest.flatMap((arg, index) => (arg === `--${name}` ? [rest[index + 1]] : []));
}

function usage() {
  console.error(
    "usage: node scripts/remaster-epub.mjs <check|ocr|outline|transcribe|crosscheck|build> <book.epub> [options]",
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
        let page;
        try {
          const raw = await runTranscribeClaude(prompt);
          writeFileAtomic(join(paths.transcripts, `${pageFileStem(number)}.raw.txt`), raw);
          page = parsePageReply(raw, { pageNumber: number });
        } catch (error) {
          failures.push(`page ${number}: ${error.message}`);
          log(`  page ${number}: FAILED ${error.message.split("\n")[0]}`);
          continue;
        }
        const seconds = Math.round((Date.now() - started) / 1000);
        if (page.problems.length) {
          // Kept as .raw.txt only: a malformed page must not reach the book.
          failures.push(`page ${number}: ${page.problems.join("; ")}`);
          log(`  page ${number}: MALFORMED (${page.problems.join("; ")}) ${seconds}s`);
          continue;
        }
        writeFileAtomic(transcriptPath(paths, number), serializeTranscript(page));
        const check = runCrossCheck(paths, number, page.body);
        log(`  page ${number} (p.${page.printed || "-"}) ${seconds}s: ${describeCheck(check)}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
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
    const explicit = optionAll("entry").length > 0;
    const entries = [];
    for (const entry of selectedEntries(outline)) {
      const numbers = pageRange(entry);
      const transcripts = numbers.map((number) => loadTranscript(paths, number));
      const missing = numbers.filter((_, i) => !transcripts[i]);
      if (missing.length) {
        const message = `"${entry.label}" is missing ${missing.length} page transcript(s): ${missing.join(", ")}`;
        if (explicit) {
          console.error(message);
          process.exit(1);
        }
        continue;
      }
      entries.push({ ...entry, pages: transcripts });
    }
    if (!entries.length) {
      console.error("no outline entry is fully transcribed yet; nothing to build");
      process.exit(1);
    }
    const bytes = buildRemasteredEpub(entries, {
      title: `${getBookTitle(epubPath)} (remastered)`,
      language: option("lang") ?? "ja",
      sourceHash: hash,
      modified: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    });
    writeFileSync(resolve(out), bytes);
    log(`wrote ${resolve(out)}: ${entries.length} entr(ies)`);
    for (const entry of entries) {
      log(`  ${entry.label} (pages ${entry.firstPage}-${entry.lastPage})`);
    }
    log(`next: node scripts/remaster-epub.mjs check ${out}`);
  },
});

const handler = commands[command];
if (!handler) usage();
await handler({ option, optionAll });

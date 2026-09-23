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
//   node scripts/remaster-epub.mjs select     <book.epub>   (an agent recommends which units to convert)
//   node scripts/remaster-epub.mjs decide     <book.epub> [--accept-recommendations]
//                                             [--include <entry> ...] [--exclude <entry> ...]
//   node scripts/remaster-epub.mjs transcribe <book.epub> [--chapter <n>] [--pages a-b]
//                                             [--concurrency 4] [--reading b]
//   node scripts/remaster-epub.mjs crosscheck <book.epub> [--chapter <n>]
//   node scripts/remaster-epub.mjs audit      <book.epub> [--chapter <n>]   (judge the flagged pages)
//   node scripts/remaster-epub.mjs settle     <book.epub> [--chapter <n>]   (after readings a and b)
//   node scripts/remaster-epub.mjs build      <book.epub> --out <converted.epub> [--chapter <n> ...]
//                                             [--allow-missing]
//   node scripts/remaster-epub.mjs verify     <book.epub> --book <converted.epub> [--chapter <n> ...]
//
// transcribe, settle and build work on every chosen chapter unless --chapter (or --entry, an
// outline number) names some. Every step after `outline` takes --purpose speaking-listening (the
// default), reading-writing or everything (src/remaster/purpose.js). The purpose picks which units are
// converted and names the result; page transcripts are shared, so a second purpose only pays for
// the pages the first did not cover.
//
// `settle` exits 1 when it STOPPED (a usage limit: re-run it), and 3 when it finished with pages
// that need a person (an unsettled page builds from reading A, so the next stage can go ahead).
//
// `check` is free and read-only. `ocr` is free (Apple Vision, local). `outline` is one text-only
// model call. `transcribe` is one vision call per page and is the only step that costs real
// money at scale, so it only ever runs on the pages you name.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { hashEpubFile } from "../src/corpus/epubLibrary.js";
import { assessEpubEligibility, formatEligibility } from "../src/corpus/epubEligibility.js";
import {
  remasterRoot,
  remasterPaths,
  readingPaths,
  pageFileStem,
} from "../src/remaster/workspace.js";
import { extractSourcePages } from "../src/remaster/sourceBook.js";
import { ensureOcrBinary, ocrPages, loadPageOcr } from "../src/remaster/visionOcr.js";
import {
  renderOutlinePrompt,
  parseOutline,
  formatOutline,
  numberChapters,
} from "../src/remaster/outline.js";
import {
  candidateUnits,
  renderSelectPrompt,
  parseSelection,
  applyDecisions,
  undecided,
  includedEntries,
  formatSelection,
} from "../src/remaster/selection.js";
import { resolvePurpose, DEFAULT_PURPOSE } from "../src/remaster/purpose.js";
import {
  renderPagePrompt,
  parsePageReply,
  serializeTranscript,
} from "../src/remaster/pageTranscribe.js";
import { crossCheckPage } from "../src/remaster/ocrCrossCheck.js";
import { buildRemasteredEpub } from "../src/remaster/epubWriter.js";
import { transcribeWithRetries } from "../src/remaster/transcribeRetry.js";
import {
  settlePage,
  renderSettlePrompt,
  settleQueue,
  settleExitCode,
} from "../src/remaster/settle.js";
import { renderAuditPrompt, parseAudit, applyCorrections } from "../src/remaster/auditFlags.js";
import { attachFigureImages, sipsCropper, imageSize } from "../src/remaster/figureCrops.js";
import { verifyRemasteredEpub, formatVerification } from "../src/remaster/verifyRemaster.js";
import {
  runOutlineClaude,
  runTranscribeClaude,
  runSettleClaude,
  runSelectClaude,
  runAuditClaude,
  remasterPinning,
} from "../src/remaster/remasterRunners.js";
import { appendJournal, loggedRunner } from "../src/remaster/journal.js";
import { createHash } from "crypto";
import { writeFileAtomic } from "../src/util/atomicWrite.js";

const [command, target, ...rest] = process.argv.slice(2);
const REMASTER_MODIFIED = "2000-01-01T00:00:00Z";
const READING = rest.includes("--reading") ? rest[rest.indexOf("--reading") + 1] : "a";
// What this conversion is for (purpose.js). It decides which selection is used, and so which
// chapters exist; every page transcript is shared across purposes.
let PURPOSE;
try {
  PURPOSE = resolvePurpose(
    rest.includes("--purpose") ? rest[rest.indexOf("--purpose") + 1] : DEFAULT_PURPOSE,
  );
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function option(name) {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : undefined;
}

function optionAll(name) {
  return rest.flatMap((arg, index) => (arg === `--${name}` ? [rest[index + 1]] : []));
}

function usage() {
  console.error(
    "usage: node scripts/remaster-epub.mjs <check|ocr|outline|select|decide|transcribe|crosscheck|settle|audit|build|verify> <book.epub> [options]",
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
  // --reading b (c, ...) points transcribe and crosscheck at an independent second run.
  const paths = readingPaths(remasterPaths(remasterRoot(hash), { purpose: PURPOSE.name }), READING);
  // An EPUB of page pictures and a PDF converge here: both become a numbered list of page images.
  const source = extractSourcePages(epubPath, {
    imagesDir: paths.images,
    binDir: join(paths.root, "..", "bin"),
  });
  return { hash, paths, pages: source.pages, source, title: source.title };
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
  // Numbered on every load, from the entries' kinds and the owner's selection, so the numbers are
  // always the ones the current decisions imply (numberChapters is deterministic in both).
  const outline = JSON.parse(readFileSync(paths.outline, "utf-8"));
  return numberChapters(outline, includedEntries(loadSelection(paths)));
}

/** Said wherever a purpose nothing builds decks from is used, so a conversion never implies one. */
function warnWithoutDeckPipeline() {
  if (PURPOSE.hasDeckPipeline) return;
  log(
    `note: no deck pipeline makes ${PURPOSE.title} cards yet. This conversion works, but nothing ` +
      `will build decks from it until one exists.`,
  );
}

function loadSelection(paths) {
  return existsSync(paths.selection) ? JSON.parse(readFileSync(paths.selection, "utf-8")) : null;
}

/**
 * Transcribing and building wait for the owner's selection: nothing is paid for or built from a
 * unit nobody has decided on. Exits with what is missing.
 */
function requireDecidedSelection(paths) {
  const selection = loadSelection(paths);
  if (!selection) {
    console.error(
      "no chapter selection yet: run `select`, then `decide`, so the owner chooses which study " +
        "units become chapters before anything is transcribed",
    );
    process.exit(1);
  }
  const open = undecided(selection);
  if (open.length) {
    console.error(`${open.length} study unit(s) still undecided (see \`select\`):`);
    for (const unit of open)
      console.error(`  [${unit.entry}] ${unit.recommendation}: ${unit.label}`);
    process.exit(1);
  }
  return selection;
}

/** Only chapters are transcribed, settled or built: a unit left out has nothing to spend on. */
function requireChapters(entries) {
  const outside = entries.filter((entry) => entry.chapter === null);
  if (outside.length) {
    console.error(
      "not a chapter of the converted book (front or back matter, or not selected): " +
        outside.map((e) => `[${e.number}] ${e.label}`).join(", "),
    );
    process.exit(2);
  }
  return entries;
}

/**
 * The outline entries named by --entry <outline number> and/or --chapter <chapter number>, or every
 * entry when neither is given. --chapter is the number an operator sees everywhere else (the label,
 * the deck, --lesson in assemble); --entry reaches front and back matter too.
 */
function selectedEntries(outline) {
  const byEntry = optionAll("entry").map(Number);
  const byChapter = optionAll("chapter").map(Number);
  if (!byEntry.length && !byChapter.length) return outline.entries;
  const entries = outline.entries.filter(
    (entry) => byEntry.includes(entry.number) || byChapter.includes(entry.chapter),
  );
  if (entries.length !== byEntry.length + byChapter.length) {
    console.error(
      `no such outline entry or chapter among: ` +
        [...byEntry.map((n) => `entry ${n}`), ...byChapter.map((n) => `chapter ${n}`)].join(", "),
    );
    process.exit(2);
  }
  return entries;
}

/** A chapter as the converted book carries it: numbered and labelled by numberChapters. */
function asChapter(entry) {
  return { ...entry, number: entry.chapter, label: entry.chapterLabel };
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

function loadPageFile(dir, number) {
  const path = join(dir, `${pageFileStem(number)}.xhtml`);
  return existsSync(path)
    ? parsePageReply(readFileSync(path, "utf-8"), { pageNumber: number })
    : null;
}

function metaPath(dir, number) {
  return join(dir, `${pageFileStem(number)}.meta.json`);
}

function readMeta(dir, number) {
  const path = metaPath(dir, number);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

function checkSummary(check) {
  if (!check) return null;
  return {
    flagged: check.flagged,
    disagreeingChars: check.disagreeingChars,
    disagreeingWords: check.disagreeingWords,
    missingLines: check.missingLines.map((l) => l.text),
    numberingGaps: check.numberingGaps,
  };
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

function loadCheck(paths, number) {
  const path = join(paths.checks, `${pageFileStem(number)}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

function loadAudit(paths, number) {
  const path = join(paths.audits, `${pageFileStem(number)}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

function readSettleRecord(paths, number) {
  const path = join(paths.settled, `${pageFileStem(number)}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/**
 * Flagged pages nobody has resolved: still flagged by the cross-check, and either never audited or
 * audited without an answer. A page an auditor confirmed or corrected is not something to read
 * again (audits/, `audit`).
 */
function flaggedPages(paths, entries) {
  const flagged = [];
  for (const entry of entries) {
    for (let number = entry.firstPage; number <= entry.lastPage; number++) {
      if (!loadCheck(paths, number)?.flagged) continue;
      const outcome = loadAudit(paths, number)?.outcome;
      if (outcome === "correct" || outcome === "corrected") continue;
      flagged.push(number);
    }
  }
  return flagged;
}

function reportVerification(builtPath, paths, entries, outline) {
  // "The whole book" is every chapter: front and back matter are left out of it on purpose.
  const bookPages = outline.entries
    .filter((entry) => entry.chapter !== null)
    .reduce((sum, entry) => sum + entry.lastPage - entry.firstPage + 1, 0);
  const result = verifyRemasteredEpub(builtPath, { expected: entries, bookPages });
  appendJournal(paths.root, {
    step: "verify",
    book: builtPath,
    ok: result.problems.length === 0,
    problems: result.problems,
    notes: result.notes,
    flaggedPages: flaggedPages(paths, entries),
  });
  for (const line of formatVerification(result, { flaggedPages: flaggedPages(paths, entries) })) {
    log(line);
  }
  return result.problems.length === 0;
}

Object.assign(commands, {
  async outline() {
    const { paths, pages, title } = await workspace();
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
      bookTitle: title,
      pageCount: pages.length,
      ocrByPage,
    });
    log(`outline: one text-only model call over ${pages.length} pages of OCR margins`);
    const outlinePin = remasterPinning("OUTLINE");
    const logged = loggedRunner(paths.root, async (text) => runOutlineClaude(text), {
      role: "outline",
      ...outlinePin,
      context: () => ({ pages: pages.length }),
    });
    const raw = await logged.run(prompt);
    appendJournal(paths.root, {
      step: "outline",
      event: "reply",
      ...outlinePin,
      agentLog: logged.lastLog(),
    });
    mkdirSync(paths.root, { recursive: true });
    writeFileAtomic(join(paths.root, "outline.raw.txt"), raw);
    const outline = parseOutline(raw, { pageCount: pages.length });
    writeFileAtomic(paths.outline, `${JSON.stringify(outline, null, 2)}\n`);
    appendJournal(paths.root, {
      step: "outline",
      event: "accepted",
      entries: outline.entries.map((e) => `${e.firstPage}-${e.lastPage} ${e.label}`),
    });
    for (const line of formatOutline(outline)) log(line);
    log(
      `\nwritten to ${paths.outline}. Read it before transcribing: every deck name comes from it.`,
    );
  },

  // One Opus call: which study units are worth converting, with a reason for each (selection.js).
  // Writes the recommendations with every decision open; `decide` records the owner's choices.
  async select() {
    const { paths, pages, title } = await workspace();
    const outline = JSON.parse(readFileSync(paths.outline, "utf-8"));
    const ocrByPage = new Map(
      pages.map((page) => [page.number, loadPageOcr(paths.ocr, pageFileStem, page.number)]),
    );
    const pin = remasterPinning("SELECT");
    const logged = loggedRunner(paths.root, async (text) => runSelectClaude(text), {
      role: `select-${PURPOSE.name}`,
      ...pin,
      context: () => ({ purpose: PURPOSE.name, units: candidateUnits(outline).length }),
    });
    log(
      `select for ${PURPOSE.title}: one call (${pin.model} ${pin.effort}) over ` +
        `${candidateUnits(outline).length} study units`,
    );
    warnWithoutDeckPipeline();
    const raw = await logged.run(
      renderSelectPrompt({
        bookTitle: title,
        outline,
        ocrByPage,
        purpose: PURPOSE,
      }),
    );
    const selection = parseSelection(raw, { outline, purpose: PURPOSE });
    writeFileAtomic(paths.selection, `${JSON.stringify(selection, null, 2)}\n`);
    appendJournal(paths.root, {
      step: "select",
      purpose: PURPOSE.name,
      ...pin,
      agentLog: logged.lastLog(),
      recommendations: selection.units.map((u) => `${u.entry} ${u.recommendation} ${u.category}`),
    });
    for (const line of formatSelection(selection)) log(line);
    log(
      `\nwritten to ${paths.selection}. Nothing is transcribed until every unit is decided: ` +
        `decide --accept-recommendations [--include <entry> ...] [--exclude <entry> ...]`,
    );
  },

  // The owner's decisions, recorded beside the agent's recommendations.
  async decide() {
    const { paths } = await workspace();
    const selection = loadSelection(paths);
    if (!selection) {
      console.error("no selection yet: run `select` first");
      process.exit(1);
    }
    const decided = applyDecisions(selection, {
      acceptRecommendations: rest.includes("--accept-recommendations"),
      include: optionAll("include").map(Number),
      exclude: optionAll("exclude").map(Number),
    });
    writeFileAtomic(paths.selection, `${JSON.stringify(decided, null, 2)}\n`);
    appendJournal(paths.root, {
      step: "decide",
      decisions: decided.units
        .filter((u) => u.decision !== selection.units.find((s) => s.entry === u.entry).decision)
        .map((u) => ({
          entry: u.entry,
          label: u.label,
          recommendation: u.recommendation,
          decision: u.decision,
        })),
    });
    for (const line of formatSelection(decided)) log(line);
    const open = undecided(decided);
    log(
      open.length
        ? `\n${open.length} unit(s) still undecided: ${open.map((u) => u.entry).join(", ")}`
        : "\nevery unit decided. The chapters are now:",
    );
    if (!open.length) {
      for (const line of formatOutline(loadOutline(paths), includedEntries(decided))) log(line);
    }
  },

  async transcribe() {
    const { paths, pages, title } = await workspace();
    requireDecidedSelection(paths);
    const outline = loadOutline(paths);
    // Every chapter by default (the whole-book run), or the ones named by --chapter / --entry.
    const named = optionAll("entry").length || optionAll("chapter").length;
    const chapters = named
      ? requireChapters(selectedEntries(outline))
      : outline.entries.filter((e) => e.chapter !== null);
    if (option("pages") && chapters.length !== 1) {
      console.error("--pages narrows one chapter; name exactly one with --chapter or --entry");
      process.exit(2);
    }
    const force = rest.includes("--force");
    const labelOf = new Map();
    for (const chapter of chapters) {
      for (const number of pageRange(chapter)) labelOf.set(number, chapter.label);
    }
    const numbers = [...labelOf.keys()].filter(
      (number) => force || !existsSync(transcriptPath(paths, number)),
    );
    const entry = {
      label: chapters.length === 1 ? chapters[0].label : `${chapters.length} chapters`,
    };
    const byNumber = new Map(pages.map((page) => [page.number, page]));

    const concurrency = Number(option("concurrency") ?? 4);
    mkdirSync(paths.transcripts, { recursive: true });
    const pin = remasterPinning("TRANSCRIBE");
    log(
      `transcribe "${entry.label}" (reading ${READING}, ${pin.model} ${pin.effort}): ` +
        `${numbers.length} page(s) to do, ${concurrency} at a time`,
    );
    appendJournal(paths.root, {
      step: "transcribe",
      event: "start",
      reading: READING,
      entry: entry.label,
      pages: numbers,
      ...pin,
    });

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
          entryLabel: labelOf.get(number),
        });
        const started = Date.now();
        const rawPath = join(paths.transcripts, `${pageFileStem(number)}.raw.txt`);
        let page;
        let attempts = 0;
        // A reply already paid for is read again before paying for another: a parser fix
        // (a self-correcting reply with two <page> elements, a <ruby> with no reading) recovers
        // it for nothing. The accepted reply is tried first, then each rejected attempt, newest
        // first, since a rejection that only the parser objected to is still a transcript.
        const savedReplies = force
          ? []
          : [rawPath, 3, 2, 1]
              .map((p) =>
                typeof p === "string"
                  ? p
                  : join(paths.transcripts, `${pageFileStem(number)}.attempt-${p}.txt`),
              )
              .filter((p) => existsSync(p))
              .map((p) => readFileSync(p, "utf-8"));
        const reparsed = savedReplies
          .map((reply) => tryParse(reply, number))
          .find((parsed) => parsed && !parsed.problems.length);
        if (reparsed) {
          page = reparsed;
          if (!existsSync(metaPath(paths.transcripts, number))) {
            // Recovered from a reply saved by an earlier run of this same pin: record it, marked
            // as recovered, so the page does not show as "not recorded".
            writeFileAtomic(
              metaPath(paths.transcripts, number),
              `${JSON.stringify(
                {
                  page: number,
                  reading: READING,
                  ...pin,
                  promptSha256: sha256(prompt),
                  recoveredFromSavedReply: true,
                  at: new Date().toISOString(),
                },
                null,
                1,
              )}\n`,
            );
          }
        } else {
          // Every call goes to agent-logs/, reply and all, before anything judges it.
          let calls = 0;
          const logged = loggedRunner(paths.root, runTranscribeClaude, {
            role: `transcribe-${READING}`,
            ...pin,
            context: () => ({ page: number, reading: READING, attempt: ++calls }),
          });
          const callLogs = [];
          const run = async (text) => {
            try {
              return await logged.run(text);
            } finally {
              callLogs.push(logged.lastLog());
            }
          };
          // Quota refusals propagate out of here and end the run: see transcribeRetry.js.
          const result = await transcribeWithRetries({ pageNumber: number, prompt, run });
          for (const failure of result.failures) {
            appendJournal(paths.root, {
              step: "transcribe",
              event: "attempt-rejected",
              page: number,
              reading: READING,
              attempt: failure.attempt,
              reason: failure.reason,
              agentLog: callLogs[failure.attempt - 1] ?? null,
            });
          }
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
            appendJournal(paths.root, {
              step: "transcribe",
              event: "failed",
              page: number,
              reading: READING,
              attempts: result.attempts,
            });
            failures.push(`page ${number}: failed ${result.attempts} attempt(s): ${reasons}`);
            log(`  page ${number}: FAILED after ${result.attempts} attempt(s)`);
            continue;
          }
          writeFileAtomic(rawPath, result.raw);
          page = result.page;
          // Which model wrote this page, recorded beside it: a pin changed half way through a book
          // then shows up as pages that differ, not as nothing at all.
          writeFileAtomic(
            metaPath(paths.transcripts, number),
            `${JSON.stringify(
              {
                page: number,
                reading: READING,
                ...pin,
                promptSha256: sha256(prompt),
                attempts: result.attempts,
                agentLog: callLogs.at(-1),
                at: new Date().toISOString(),
              },
              null,
              1,
            )}\n`,
          );
        }
        const seconds = Math.round((Date.now() - started) / 1000);
        const retried = attempts > 1 ? ` (attempt ${attempts})` : "";
        writeFileAtomic(transcriptPath(paths, number), serializeTranscript(page));
        const check = runCrossCheck(paths, number, page.body);
        appendJournal(paths.root, {
          step: "transcribe",
          event: "transcribed",
          page: number,
          reading: READING,
          attempts,
          reused: attempts === 0,
          agentLog: readMeta(paths.transcripts, number)?.agentLog ?? null,
          crosscheck: checkSummary(check),
        });
        log(
          `  page ${number} (p.${page.printed || "-"}) ${seconds}s${retried}: ${describeCheck(check)}`,
        );
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    } catch (error) {
      if (!error.quotaExhausted) throw error;
      appendJournal(paths.root, {
        step: "transcribe",
        event: "stopped",
        reason: error.message.split("\n")[0],
      });
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
        // The page the BUILD would use: settled where two readings were reconciled, else the single
        // reading. Checking reading A instead described a text the book does not contain, so a
        // settled page's flags said nothing about what shipped.
        const page = loadPageFile(paths.settled, number) ?? loadTranscript(paths, number);
        if (!page) continue;
        const check = runCrossCheck(paths, number, page.body);
        appendJournal(paths.root, {
          step: "crosscheck",
          page: number,
          reading: READING,
          ...checkSummary(check),
        });
        checked++;
        if (check?.flagged) flagged++;
        log(`page ${number} (p.${page.printed || "-"}): ${describeCheck(check)}`);
      }
    }
    log(`\n${checked} page(s) checked, ${flagged} flagged`);
  },

  // Every page the cross-check flagged, judged against its image by the AUDIT pin (Opus). One call
  // per flagged page, about the flagged spans only; corrections are exact swaps and are applied
  // only if each occurs once and the whole audit changes little (auditFlags.js).
  async audit() {
    const { paths, pages, title } = await workspace();
    requireDecidedSelection(paths);
    const outline = loadOutline(paths);
    const named = optionAll("entry").length || optionAll("chapter").length;
    const chapters = named
      ? requireChapters(selectedEntries(outline))
      : outline.entries.filter((e) => e.chapter !== null);
    const byNumber = new Map(pages.map((page) => [page.number, page]));
    const force = rest.includes("--force");
    const pin = remasterPinning("AUDIT");
    mkdirSync(paths.audits, { recursive: true });

    // A page is worth a call when its check flagged it and nobody has judged it yet. The page the
    // build would use is the one audited: settled where there is one, else the single reading.
    const queue = [];
    for (const chapter of chapters) {
      for (const number of pageRange(chapter)) {
        const check = loadCheck(paths, number);
        if (!check?.flagged) continue;
        if (!force && existsSync(join(paths.audits, `${pageFileStem(number)}.json`))) continue;
        const page = loadPageFile(paths.settled, number) ?? loadTranscript(paths, number);
        if (page) queue.push({ number, page, check });
      }
    }
    log(`audit: ${queue.length} flagged page(s) to judge (${pin.model} ${pin.effort})`);
    appendJournal(paths.root, {
      step: "audit",
      event: "start",
      pages: queue.map((q) => q.number),
      ...pin,
    });

    const tally = { correct: 0, corrected: 0, rejected: 0, unclear: 0, failed: 0 };
    const worker = async () => {
      while (queue.length) {
        const { number, page, check } = queue.shift();
        const logged = loggedRunner(paths.root, runAuditClaude, {
          role: "audit",
          ...pin,
          context: () => ({ page: number }),
        });
        let audit;
        try {
          const raw = await logged.run(
            renderAuditPrompt({
              imagePath: byNumber.get(number).localPath,
              bookTitle: title,
              pageNumber: number,
              transcript: serializeTranscript(page),
              check,
            }),
          );
          audit = parseAudit(raw);
        } catch (error) {
          if (error.quotaExhausted) throw error;
          tally.failed++;
          log(`  page ${number}: FAILED ${error.message.split("\n")[0]}`);
          continue;
        }

        let applied = 0;
        let problems = [];
        if (audit.verdict === "transcript-wrong" && audit.corrections.length) {
          const result = applyCorrections(page.body, audit.corrections);
          problems = result.problems;
          if (!problems.length) {
            applied = result.applied;
            const target = existsSync(join(paths.settled, `${pageFileStem(number)}.xhtml`))
              ? join(paths.settled, `${pageFileStem(number)}.xhtml`)
              : transcriptPath(paths, number);
            writeFileAtomic(target, serializeTranscript({ ...page, body: result.body }));
            // The check is re-run on the corrected page, so its flag reflects the page as it now is.
            runCrossCheck(paths, number, result.body);
          }
        }
        const outcome = problems.length
          ? "rejected"
          : audit.verdict === "transcript-correct"
            ? "correct"
            : audit.verdict === "unclear"
              ? "unclear"
              : applied
                ? "corrected"
                : "unclear";
        tally[outcome]++;
        const record = {
          page: number,
          outcome,
          verdict: audit.verdict,
          reason: audit.reason,
          corrections: audit.corrections,
          applied,
          problems,
          ...pin,
          agentLog: logged.lastLog(),
          at: new Date().toISOString(),
        };
        writeFileAtomic(
          join(paths.audits, `${pageFileStem(number)}.json`),
          `${JSON.stringify(record, null, 1)}\n`,
        );
        appendJournal(paths.root, { step: "audit", ...record });
        log(
          `  page ${number}: ${outcome}${applied ? ` (${applied} correction(s))` : ""} — ${audit.reason}` +
            (problems.length ? ` REJECTED: ${problems.join("; ")}` : ""),
        );
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(Number(option("concurrency") ?? 4), queue.length) }, worker),
      );
    } catch (error) {
      if (!error.quotaExhausted) throw error;
      log(`\nSTOPPED: ${error.message.split("\n")[0]}`);
      log("Audited pages are kept. Re-run the same command once the limit resets.");
      process.exitCode = 1;
      return;
    }
    log(
      `\n${tally.correct} transcript(s) confirmed, ${tally.corrected} corrected, ` +
        `${tally.unclear} unclear, ${tally.rejected} correction(s) rejected, ${tally.failed} failed`,
    );
    if (tally.unclear || tally.rejected || tally.failed) {
      log("Pages left unresolved are the ones to read against the image yourself.");
      process.exitCode = 1;
    }
  },

  async build() {
    const out = option("out");
    if (!out) {
      console.error("build needs --out <remastered.epub>");
      process.exit(2);
    }
    const { hash, paths, pages, title } = await workspace();
    const outline = loadOutline(paths);
    const allowMissing = rest.includes("--allow-missing");
    const byNumber = new Map(pages.map((page) => [page.number, page]));
    const entries = [];
    const sources = { settled: 0, transcript: 0 };
    // Only chapters go into the converted book (numberChapters, outline.js). Naming a front- or
    // back-matter entry explicitly is refused rather than quietly dropped.
    requireDecidedSelection(paths);
    const named = optionAll("entry").length || optionAll("chapter").length;
    const selected = named
      ? requireChapters(selectedEntries(outline))
      : outline.entries.filter((e) => e.chapter !== null);
    for (const entry of selected.map(asChapter)) {
      const numbers = pageRange(entry);
      // A settled page (two readings, reconciled) wins over a single reading.
      const transcripts = numbers.map((number) => {
        const settled = loadPageFile(paths.settled, number);
        if (settled) sources.settled++;
        const page = settled ?? loadTranscript(paths, number);
        if (page && !settled) sources.transcript++;
        return page;
      });
      const missing = numbers.filter((_, i) => !transcripts[i]);
      if (missing.length && allowMissing) {
        // A visible hole, never a silent one: the placeholder is text the extraction model reads,
        // and it says a page is missing rather than letting the lesson look complete.
        transcripts.forEach((transcript, i) => {
          if (transcript) return;
          // The whole page image goes in with it, so the pipeline's image passes can still read
          // the page even though no transcript of it exists.
          transcripts[i] = {
            number: numbers[i],
            printed: "",
            body:
              `<p class="missing-page">[Page ${numbers[i]} of the source was not transcribed. ` +
              `Its text is missing from this lesson; the page image follows.]</p>` +
              `<figure class="page-image"><img src="images/${pageFileStem(numbers[i])}.jpg" ` +
              `alt="Page ${numbers[i]} of the source"/></figure>`,
            images: [
              {
                name: `images/${pageFileStem(numbers[i])}.jpg`,
                path: byNumber.get(numbers[i]).localPath,
              },
            ],
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
      const images = [];
      let unboxed = 0;
      const pagesOut = transcripts.map((page) => {
        const printed =
          Number.isInteger(offset) && page.number > offset
            ? String(page.number - offset)
            : page.printed;
        images.push(...(page.images ?? []));
        const pageImage = byNumber.get(page.number).localPath;
        const figures = attachFigureImages(page.body, {
          pageNumber: page.number,
          stem: pageFileStem,
          cropsDir: paths.crops,
          pageSize: page.body.includes("data-box=") ? imageSize(pageImage) : null,
          crop: sipsCropper(pageImage),
        });
        images.push(...figures.images);
        unboxed += figures.skipped;
        return { ...page, printed, body: figures.body };
      });
      if (unboxed && !rest.includes("--quiet")) {
        log(
          `  "${entry.label}": ${unboxed} figure(s) have no position, so no image (captions kept)`,
        );
      }
      entries.push({
        ...entry,
        pages: pagesOut,
        images: images.map((image) => ({ name: image.name, data: readFileSync(image.path) })),
      });
    }
    if (!entries.length) {
      console.error("no outline entry is fully transcribed yet; nothing to build");
      process.exit(1);
    }
    warnWithoutDeckPipeline();
    const bytes = buildRemasteredEpub(entries, {
      // The purpose is in the title, so two conversions of one book are two distinct collections
      // by name as well as by bytes (DECISIONS.md, "A conversion has a purpose…").
      title: `${title} (${PURPOSE.title})`,
      language: option("lang") ?? "ja",
      sourceHash: hash,
      purpose: PURPOSE.name,
      // Fixed, not the clock. The library identifies a book by the hash of its bytes, so the
      // same transcripts must always give the same file; a timestamp here made every rebuild a
      // "new book" with an empty dedup library.
      modified: REMASTER_MODIFIED,
    });
    writeFileSync(resolve(out), bytes);
    log(
      `wrote ${resolve(out)}: ${entries.length} entr(ies), ${sources.settled} settled page(s), ` +
        `${sources.transcript} single-reading page(s), ` +
        `${entries.reduce((n, e) => n + e.images.length, 0)} image(s)`,
    );
    for (const entry of entries) {
      log(`  ${entry.label} (pages ${entry.firstPage}-${entry.lastPage})`);
    }
    // Which models wrote the pages in this book, counted. A lesson built from two different pins is
    // reported, because a pin changed part way through a book is otherwise invisible.
    const models = {};
    for (const entry of entries) {
      for (const page of entry.pages) {
        const record = readSettleRecord(paths, page.number);
        const writers = record
          ? [record.readings?.a, record.readings?.b].filter(Boolean)
          : [readMeta(paths.transcripts, page.number)].filter(Boolean);
        const key = writers.length
          ? [...new Set(writers.map((w) => `${w.model} ${w.effort}`))].join(" + ")
          : "not recorded (transcribed before provenance existed)";
        models[key] = (models[key] ?? 0) + 1;
      }
    }
    for (const [key, count] of Object.entries(models)) log(`  pages written by ${key}: ${count}`);
    appendJournal(paths.root, {
      step: "build",
      out: resolve(out),
      entries: entries.map((e) => e.label),
      sources,
      models,
      images: entries.reduce((n, e) => n + e.images.length, 0),
    });
    // The build checks its own output end to end, every time: the file it just wrote, read back.
    const ok = reportVerification(resolve(out), paths, entries, outline);
    if (!ok) process.exitCode = 1;
    log(`next: node scripts/remaster-epub.mjs check ${out}`);
  },

  // Two readings (transcripts/ and transcripts-b/) into one settled page each. Pages that agree
  // keep reading B as is; pages that disagree go to the SETTLE pin (Opus) with the image, and its
  // answer is rejected if it adds or drops content neither reading supports (settle.js).
  async settle() {
    const { paths, pages, title } = await workspace();
    const b = readingPaths(paths, "b");
    requireDecidedSelection(paths);
    const outline = loadOutline(paths);
    const named = optionAll("entry").length || optionAll("chapter").length;
    const chapters = named
      ? requireChapters(selectedEntries(outline))
      : outline.entries.filter((e) => e.chapter !== null);
    const byNumber = new Map(pages.map((page) => [page.number, page]));

    const force = rest.includes("--force");
    mkdirSync(paths.settled, { recursive: true });
    const tally = { agreed: 0, settled: 0, unsettled: 0, skipped: 0 };
    const settlePin = remasterPinning("SETTLE");
    appendJournal(paths.root, {
      step: "settle",
      event: "start",
      chapters: chapters.map((c) => c.label),
      ...settlePin,
    });
    const { queue, alreadyUnsettled } = settleQueue(
      chapters.flatMap((chapter) => pageRange(chapter)),
      paths.settled,
      pageFileStem,
      { force },
    );
    tally.unsettled += alreadyUnsettled.length;
    for (const n of alreadyUnsettled) {
      log(`  page ${n}: unsettled in an earlier run (the build uses reading A); --force to retry`);
    }
    const worker = async () => {
      while (queue.length) {
        const number = queue.shift();
        const readingA = loadTranscript(paths, number);
        const readingB = loadPageFile(b.transcripts, number);
        if (!readingA || !readingB) {
          tally.skipped++;
          log(`  page ${number}: needs both readings (a: ${!!readingA}, b: ${!!readingB})`);
          continue;
        }
        let calls = 0;
        const logged = loggedRunner(paths.root, runSettleClaude, {
          role: "settle",
          ...settlePin,
          context: () => ({ page: number, attempt: ++calls }),
        });
        const result = await settlePage({
          pageNumber: number,
          readingA,
          readingB,
          run: logged.run,
          prompt: (differences) =>
            renderSettlePrompt({
              imagePath: byNumber.get(number).localPath,
              bookTitle: title,
              pageNumber: number,
              readingA: serializeTranscript(readingA),
              readingB: serializeTranscript(readingB),
              differences,
            }),
        });
        tally[result.source]++;
        const record = {
          page: number,
          source: result.source,
          differences: result.differences,
          problems: result.problems,
          // Who wrote what: the two readings' models, and the adjudicator's when it was asked.
          readings: {
            a: readMeta(paths.transcripts, number),
            b: readMeta(b.transcripts, number),
          },
          adjudicator:
            result.source === "agreed" ? null : { ...settlePin, agentLog: logged.lastLog() },
        };
        appendJournal(paths.root, {
          step: "settle",
          page: number,
          source: result.source,
          differences: result.differences.map((d) => ({ stream: d.stream, a: d.a, b: d.b })),
          problems: result.problems,
          agentLog: result.source === "agreed" ? null : logged.lastLog(),
        });
        writeFileAtomic(
          join(paths.settled, `${pageFileStem(number)}.json`),
          `${JSON.stringify(record, null, 1)}\n`,
        );
        if (result.page) {
          writeFileAtomic(
            join(paths.settled, `${pageFileStem(number)}.xhtml`),
            serializeTranscript(result.page),
          );
        }
        const detail = result.differences.length
          ? `: ${result.differences.map((d) => `[A:${d.a}|B:${d.b}]`).join(" ")}`
          : "";
        const why = result.problems.length ? ` REJECTED: ${result.problems.join("; ")}` : "";
        log(`  page ${number}: ${result.source}${detail}${why}`);
      }
    };
    // The same clean stop as transcribe: a usage-limit refusal ends the run with a message and a
    // non-zero exit, not a stack trace. Settled pages are on disk; re-running resumes from them.
    let stopped = null;
    try {
      await Promise.all(
        Array.from({ length: Math.min(Number(option("concurrency") ?? 4), queue.length) }, worker),
      );
    } catch (error) {
      if (!error.quotaExhausted) throw error;
      stopped = error.message.split("\n")[0];
      appendJournal(paths.root, { step: "settle", event: "stopped", reason: stopped });
    }
    log(
      `\n${tally.agreed} agreed, ${tally.settled} settled by the adjudicator, ` +
        `${tally.unsettled} unsettled, ${tally.skipped} missing a reading`,
    );
    if (stopped) {
      log(`STOPPED: ${stopped}`);
      log("Settled pages are kept. Re-run the same command once the limit resets.");
    }
    // Two outcomes, two exit codes, so an unattended chain can tell them apart (settleExitCode).
    process.exitCode = settleExitCode({ stopped, ...tally }) || process.exitCode;
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
    const chapters = selectedEntries(outline)
      .filter((entry) => entry.chapter !== null)
      .map(asChapter);
    const ok = reportVerification(resolve(built), paths, chapters, outline);
    if (!ok) process.exitCode = 1;
  },
});

const handler = commands[command];
if (!handler) usage();
await handler({ option, optionAll });

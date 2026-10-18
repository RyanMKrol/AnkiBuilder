#!/usr/bin/env node
// Scans a READING collection for the words the widened card rules 1 would card (owner ruling,
// 2026-10-18, DECISIONS.md "A reading deck cards vocabulary from anywhere in the chapter").
//
//   node scripts/reading-vocab-scan.mjs <collectionDir> [--dry] [--date YYYY-MM-DD]
//
// A collection built before the ruling carded only the vocabulary lists. This runs the reading
// chapter reader, with the current prompt, over every chapter of the book (ONE model call per
// chapter) and writes one line per candidate word to `qa/<slug>/<date>/vocab-scan.jsonl`: the
// chapter, where the word appeared, whether the book glossed it, whether a later chapter's list
// introduces it ("skip, carded there"), and whether a card already exists. The owner reads it and
// approves which words become cards; those go through the additions gates like any new card.
//
// READ-ONLY: nothing under output/ is written, and nothing under .anki-builder/ except the free
// chapter cache a real run extracts when a chapter is missing from it (a dry run extracts nothing).
// Each chapter's reply is saved beside the report as soon as it returns (`vocab-scan/<n>.json`), so a
// usage-limit stop costs only the chapter that was running: re-run the same command.
//
// `--dry` prints the plan (every chapter, and whether it would be a paid call or reuse a saved
// reply) and spends nothing. `--date` names the QA run folder; it defaults to today.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  chapterCachePath,
  chapterRangeCachePath,
  libraryEpubPath,
  loadBookHints,
  resolveLabelDecoding,
} from "../src/corpus/epubLibrary.js";
import { extractChapterToFile, extractChapterRangeToFile } from "../src/corpus/epubArchive.js";
import { listLessons } from "../src/corpus/epubLessons.js";
import { parseHeadings } from "../src/corpus/chapterOutline.js";
import { READING } from "../src/model/deckKind.js";
import { readChapterForReading } from "../src/reading/readingAgents.js";
import { laterVocabulary } from "../src/reading/laterVocabulary.js";
import { cardedForms, scanRows, summarizeRows } from "../src/reading/vocabScan.js";
import { withRunLogDir } from "../src/agents/runLog.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? null : argv[at + 1];
};
const dry = argv.includes("--dry");
const date = flag("date") ?? new Date().toISOString().slice(0, 10);
const collectionArg = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--date");

function usage(message) {
  if (message) console.error(message);
  console.error("usage: reading-vocab-scan.mjs <collectionDir> [--dry] [--date YYYY-MM-DD]");
  process.exit(1);
}

if (!collectionArg) usage();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) usage(`--date must be YYYY-MM-DD, not ${date}`);
const collectionDir = resolve(collectionArg);
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};
const book = readJson(join(collectionDir, "book.json"));
if (!book) usage(`no book.json in ${collectionDir}`);
if (book.deckKind !== READING) {
  usage(`${collectionDir} is not a reading collection (deckKind ${book.deckKind ?? "none"})`);
}
const { epubHash, targetLanguage, slug } = book;
const epubPath = [join(collectionDir, "book.epub"), libraryEpubPath(epubHash)].find(existsSync);
if (!epubPath) usage(`no copy of the book for ${slug}: neither book.epub nor the library's`);

const lessons = listLessons(epubPath, { labelDecoding: resolveLabelDecoding(epubPath) });
const cachePathFor = (lesson) =>
  lesson.lastChapterNumber > lesson.firstChapterNumber
    ? chapterRangeCachePath(epubHash, lesson.firstChapterNumber, lesson.lastChapterNumber)
    : chapterCachePath(epubHash, lesson.firstChapterNumber);
const unitByNumber = new Map();
for (const name of readdirSync(collectionDir)) {
  const meta = readJson(join(collectionDir, name, "corpus.json"))?.meta;
  if (/^chapter-\d+$/.test(name) && typeof meta?.chapterNumber === "number") {
    unitByNumber.set(meta.chapterNumber, join(collectionDir, name));
  }
}

const outDir = join(REPO, "qa", slug, date);
const replyPath = (lesson) => join(outDir, "vocab-scan", `${lesson.firstChapterNumber}.json`);

console.log(`collection: ${collectionDir}`);
console.log(`report:     ${join(outDir, "vocab-scan.jsonl")}`);
console.log(`\n${lessons.length} chapter(s):`);
let calls = 0;
for (const lesson of lessons) {
  const saved = existsSync(replyPath(lesson));
  const cached = existsSync(cachePathFor(lesson));
  if (!saved) calls++;
  console.log(
    `  ${lesson.label}: ${saved ? "reply saved, reused" : "1 paid call (readingChapterReader)"}` +
      (cached ? "" : ", chapter not in the cache yet (extracted free on the real run)"),
  );
}
console.log(`\n${calls} paid call(s), one per chapter not yet scanned.`);
if (dry) {
  console.log("Dry run: nothing was called and nothing was written.");
  process.exit(0);
}

mkdirSync(join(outDir, "vocab-scan"), { recursive: true });
const chapterFile = (lesson) => {
  const path = cachePathFor(lesson);
  if (!existsSync(path)) {
    if (lesson.lastChapterNumber > lesson.firstChapterNumber) {
      extractChapterRangeToFile(
        epubPath,
        lesson.firstChapterNumber,
        lesson.lastChapterNumber,
        path,
      );
    } else extractChapterToFile(epubPath, lesson.firstChapterNumber, path);
  }
  return path;
};

const hints = loadBookHints(epubHash);
const carded = cardedForms(collectionDir, targetLanguage);
const rows = [];
const failed = [];
for (const [at, lesson] of lessons.entries()) {
  let reply = readJson(replyPath(lesson));
  if (!reply) {
    const chapterFilePath = chapterFile(lesson);
    console.log(`\n${lesson.label}: calling readingChapterReader`);
    try {
      reply = withRunLogDir(join(outDir, "vocab-scan", "agent-logs"), () =>
        readChapterForReading({
          chapterFilePath,
          sections: parseHeadings(readFileSync(chapterFilePath, "utf-8")),
          targetLanguage,
          meta: { hints },
        }),
      );
    } catch (error) {
      failed.push(lesson.label);
      console.error(`  failed: ${String(error.message).split("\n")[0]}`);
      continue;
    }
    writeFileSync(replyPath(lesson), `${JSON.stringify(reply, null, 2)}\n`);
  }
  const later = lessons.slice(at + 1).map((l) => ({
    label: l.label,
    chapterFilePath: chapterFile(l),
    unitDir: unitByNumber.get(l.firstChapterNumber) ?? null,
  }));
  rows.push(
    ...scanRows({
      chapterLabel: lesson.label,
      chapterNumber: lesson.firstChapterNumber,
      items: reply.items,
      laterTaught: laterVocabulary(later, {
        targetLanguage,
        vocabularyTableClass: hints.vocabularyTableClass ?? null,
      }),
      carded,
      targetLanguage,
    }),
  );
}

writeFileSync(
  join(outDir, "vocab-scan.jsonl"),
  rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
);
const counts = summarizeRows(rows);
console.log(
  `\n${rows.length} word(s) written to ${join(outDir, "vocab-scan.jsonl")}: ` +
    Object.entries(counts)
      .map(([decision, n]) => `${n} ${decision}`)
      .join(", "),
);
if (failed.length) {
  console.error(
    `${failed.length} chapter(s) failed and are not in the report; re-run to retry them: ` +
      failed.join(", "),
  );
  process.exit(2);
}

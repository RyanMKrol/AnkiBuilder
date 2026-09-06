#!/usr/bin/env node
// Dumps EVERY table in a chapter, so an agent decides which are vocabulary and no script does.
//
// Usage:
//   node scripts/chapter-tables.mjs <runDir>              a built unit (reads its epubHash + chapter)
//   node scripts/chapter-tables.mjs <epubHash> <n>        a chapter of a book in the local library
//   --rows N     cells to print per table (default 12; --rows 0 prints the summary only)
//
// WHY EVERY TABLE. The previous approach found vocabulary blocks by matching
// `<table class="voca">`, which is one publisher's markup. On chapter file 15 of the only book in
// the library that selector sees 6 tables and misses 3: the numbers chart (`class="tab1 FS-95"`,
// holding `0 ゼロ／れい` and `4 よん／し`, whose alternate readings are the target of no card in the
// whole deck), the です/でした paradigm, and a model-sentence pair. On a different publisher it
// would match nothing at all and report zero misses, which reads exactly like a fully carded
// chapter. So this prints all of them and judges none of them.
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  chapterCachePath,
  chapterRangeCachePath,
  loadBookHints,
} from "../src/corpus/epubLibrary.js";
import { parseTables, annotateWithHints, describeTables } from "../src/corpus/chapterTables.js";

const argv = process.argv.slice(2);
const args = argv.filter((a) => !a.startsWith("--"));
const rowsFlag = argv.indexOf("--rows");
const maxCells = rowsFlag === -1 ? 12 : Number(argv[rowsFlag + 1] ?? 12);

if (args.length === 0) {
  console.error("usage: chapter-tables.mjs <runDir> | <epubHash> <chapterNumber> [--rows N]");
  process.exit(1);
}

let epubHash;
let chapterNumber;
let lastChapterNumber;

if (args.length === 1) {
  const cardsPath = join(resolve(args[0]), "cards.json");
  if (!existsSync(cardsPath)) {
    console.error(`no cards.json at ${cardsPath}`);
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(cardsPath, "utf-8")).meta || {};
  ({ epubHash, chapterNumber, lastChapterNumber } = meta);
  if (!epubHash || typeof chapterNumber !== "number") {
    console.error(
      `${cardsPath} has no epubHash/chapterNumber — an extras unit or a non-EPUB source has no chapter of its own`,
    );
    process.exit(1);
  }
} else {
  [epubHash, chapterNumber] = [args[0], Number(args[1])];
}

const chapterPath =
  typeof lastChapterNumber === "number" && lastChapterNumber > chapterNumber
    ? chapterRangeCachePath(epubHash, chapterNumber, lastChapterNumber)
    : chapterCachePath(epubHash, chapterNumber);

if (!existsSync(chapterPath)) {
  console.error(
    `${chapterPath} is not cached — assemble this chapter first (the extraction writes it, with its images)`,
  );
  process.exit(1);
}

const hints = loadBookHints(epubHash);
const tables = annotateWithHints(parseTables(readFileSync(chapterPath, "utf-8")), {
  vocabularyTableClass: hints.vocabularyTableClass ?? null,
});

console.log(`chapter file: ${chapterPath}`);
console.log(
  hints.vocabularyTableClass
    ? `book hint: vocabulary tables usually carry class "${hints.vocabularyTableClass}" (an annotation, never a filter)\n`
    : `book hint: none recorded for vocabulary tables\n`,
);
console.log(describeTables(tables));

if (maxCells > 0) {
  for (const table of tables) {
    const shown = table.cellText.slice(0, maxCells);
    if (!shown.length) continue;
    console.log(
      `\n[${table.index}] ${table.className ? `class="${table.className}"` : "(no class)"}`,
    );
    console.log(`    ${shown.join(" | ")}`);
    if (table.cellText.length > shown.length) {
      console.log(`    … ${table.cellText.length - shown.length} more cell(s); --rows 0 to hide`);
    }
  }
}

console.log(
  `\n${tables.length} table(s). Which are vocabulary is a judgement, and this script does not make it.`,
);

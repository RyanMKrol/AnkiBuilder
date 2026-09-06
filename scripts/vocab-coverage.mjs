#!/usr/bin/env node
// Report the chapter's VOCABULARY headwords that no card teaches.
//
// SKILL.md Step 2 says to diff the chapter's vocabulary entries against the built cards, and that
// "the check is a script, not a read-through". This is that script. The extraction can drop a whole
// vocabulary block silently — most often the last one before a section boundary — and nothing
// downstream notices, because a chapter that is short a few words looks exactly like a chapter that
// had fewer words.
//
// Read-only. It proposes; a human disposes. Expect a couple of false positives and check each one:
// every report carries the nearest card target, which is usually the whole explanation.
//
// Usage:
//   node scripts/vocab-coverage.mjs <chapterFile> <unitDir>
//   node scripts/vocab-coverage.mjs <chapterFile> <unitDir> --no-sub-rows
//
// <chapterFile> is the cached chapter XHTML (.anki-builder/epubs/<hash>/chapters/<n>.xhtml — the
// same file the extraction model read). <unitDir> is the unit folder holding cards.json.
//
// Exit 0 when every headword is covered, 1 when any is not — so it can gate a build step later.
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { parseVocabularyEntries, findUncoveredVocab } from "../src/cards/vocabCoverage.js";
import { loadBookHints } from "../src/corpus/epubLibrary.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [chapterFile, unitDir] = args.filter((a) => !a.startsWith("--"));

if (!chapterFile || !unitDir) {
  console.error("usage: node scripts/vocab-coverage.mjs <chapterFile> <unitDir> [--no-sub-rows]");
  process.exit(1);
}

const chapterPath = resolve(chapterFile);
const cardsPath = join(resolve(unitDir), "cards.json");
for (const path of [chapterPath, cardsPath]) {
  if (!existsSync(path)) {
    console.error(`no such file: ${path}`);
    process.exit(1);
  }
}

// An excluded card still means the word IS in the unit; whether it ships is a separate decision, and
// treating an exclusion as a coverage gap would send a reviewer to re-add what they just dropped.
const cardsFile = JSON.parse(readFileSync(cardsPath, "utf-8"));
const cards = cardsFile.items ?? [];

// The selector is the BOOK's. Without one, this script cannot tell which tables are vocabulary, and
// it exits 2 rather than printing a clean "0 uncovered" that means nothing.
const hints = loadBookHints(cardsFile.meta?.epubHash);
const entries = parseVocabularyEntries(readFileSync(chapterPath, "utf-8"), {
  tableClass: hints.vocabularyTableClass,
  subRowClass: hints.vocabularySubRowClass,
});
if (entries === null) {
  console.error(
    `this book records no hints.vocabularyTableClass, so which of its tables are vocabulary is ` +
      `unknown. Nothing was checked — that is not the same as nothing being missing.`,
  );
  process.exit(2);
}

const misses = findUncoveredVocab(entries, cards, {
  includeSubRows: !flags.has("--no-sub-rows"),
});

if (entries.length === 0) {
  console.log(`no <table class="voca"> vocabulary rows found in ${chapterPath}`);
  console.log("(that is itself worth a look — this book puts every new term in one)");
  process.exit(0);
}

console.log(`${entries.length} vocabulary headword(s) in the chapter, ${cards.length} card(s)\n`);

for (const miss of misses) {
  const sub = miss.sub ? " [sub-row]" : "";
  console.log(`MISSING  ${miss.target}${sub}  — ${miss.english || "(no gloss)"}`);
  if (miss.nearest) console.log(`         nearest card target: ${miss.nearest}`);
}

console.log(
  misses.length
    ? `\n${misses.length} headword(s) appear in no card target. Check each one by hand: a word ` +
        `printed with optional parts, or a near-match above, is usually already taught. A real miss ` +
        `has no neighbour at all, and its block-mates are usually missing too.`
    : "\nevery vocabulary headword appears in some card's target",
);
process.exit(misses.length ? 1 : 0);

#!/usr/bin/env node
// The structural evidence for a book's `hints`, counted and never concluded.
//
// Usage:
//   node scripts/epub-hints.mjs <path/to/book.epub> [--sample N]
//   node scripts/epub-hints.mjs <epubHash>            a book already in the library
//
// Free and read-only: it opens the archive, samples spine files spread across the book, and prints
// frequency tables for the four things a hint is about. It writes nothing and spends nothing.
//
// It does not tell you which class means vocabulary. That is the point: `class="voca"` lived in
// `vocabCoverage` for months and, on any other book, returned an empty list that read as "zero
// uncovered headwords" and printed clean. See .claude/skills/onboard-epub/SKILL.md for what to do
// with the output.
import { existsSync } from "fs";
import { resolve } from "path";
import { listChapters, listExternalChapters } from "../src/corpus/epubArchive.js";
import { gatherHintEvidence, describeHintEvidence } from "../src/corpus/bookHintEvidence.js";
import { libraryEpubPath, loadBookMeta } from "../src/corpus/epubLibrary.js";
import { bookHints } from "../src/corpus/bookConfig.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const sampleAt = argv.indexOf("--sample");
const sampleSize = sampleAt === -1 ? undefined : Number(argv[sampleAt + 1]);

if (positional.length < 1) {
  console.error("usage: epub-hints.mjs <path/to/book.epub | epubHash> [--sample N]");
  process.exit(1);
}

const arg = positional[0];
let epubPath = resolve(arg);
let meta = null;
if (!existsSync(epubPath)) {
  // Not a path, so treat it as a library hash.
  epubPath = libraryEpubPath(arg);
  meta = loadBookMeta(arg);
  if (!epubPath || !existsSync(epubPath)) {
    console.error(`no EPUB at "${arg}", and no book with that hash in the library`);
    process.exit(2);
  }
}

const { chapters } = listChapters(epubPath);
let labels = [];
try {
  labels = listExternalChapters(epubPath, { log: () => {} }).map((c) => c.label);
} catch {
  // A book with no navigation document has no labels to count, which is itself worth printing.
}

const evidence = gatherHintEvidence(epubPath, {
  labels,
  spineCount: chapters.length,
  ...(Number.isFinite(sampleSize) ? { sampleSize } : {}),
});

console.log(`book: ${epubPath}`);
if (meta) {
  const hints = bookHints(meta);
  const keys = Object.keys(hints);
  console.log(`already recorded: ${keys.length ? keys.join(", ") : "no hints yet"}`);
}
console.log();
console.log(describeHintEvidence(evidence));

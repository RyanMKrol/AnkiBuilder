#!/usr/bin/env node
// The chapter's own structure, as a CHECKLIST you have to account for.
//
//   node scripts/chapter-outline.mjs <runDir>            # or: <epubHash> <chapterNumber>
//   node scripts/chapter-outline.mjs <runDir> --text     # …and the full text, in labelled sections
//
// WHY THIS EXISTS. Twice now a lesson has shipped missing material because the chapter was read as a
// stream and the reading stopped early. On Lesson 15 it was images: four charts were named, two were
// opened, the sweep was called complete, and the two unread ones held the chapter's main grammar
// table. On Lesson 16 it was text: the chapter is 942 lines, the reading stopped at 780, and
// EXERCISES VI and VII — two whole exercises, one of which is the only place the chapter uses half of
// its station-exit vocabulary — were never seen.
//
// Both have the same shape: enumerate, process a PREFIX, conclude. Nothing was ever wrong with any
// single step; what was missing is an account of whether the material was covered at all. Reading
// "carefully" does not fix that, because the failure is invisible from inside — a chapter you stopped
// reading looks exactly like a chapter that ended.
//
// So this prints what there IS, up front and in full: every section the book itself declares, every
// numbered block inside it, and the sizes. A missing EXERCISES VII is then a gap in a numbered run
// you can see, not an absence you would have to have noticed.
//
// It is deliberately structural and says nothing about what belongs on a card. Which sections carry
// teachable content is a judgement, and this exists so that judgement is made about ALL of them.

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { chapterCachePath, chapterRangeCachePath } from "../src/corpus/epubLibrary.js";
import { chapterOutline, plainText } from "../src/corpus/chapterOutline.js";

const args = process.argv.slice(2);
const wantText = args.includes("--text");
const positional = args.filter((a) => !a.startsWith("--"));

if (positional.length === 0) {
  console.error(
    "usage: node scripts/chapter-outline.mjs <runDir> [--text]\n" +
      "       node scripts/chapter-outline.mjs <epubHash> <chapterNumber> [--text]",
  );
  process.exit(2);
}

/** The cached chapter file this unit was actually built from — the same bytes the model read. */
function resolveChapterFile([first, second]) {
  if (second !== undefined) return chapterCachePath(first, Number(second));
  const runDir = resolve(first);
  const cardsPath = join(runDir, "cards.json");
  const corpusPath = join(runDir, "corpus.json");
  const src = existsSync(cardsPath) ? cardsPath : corpusPath;
  if (!existsSync(src)) {
    console.error(`no cards.json or corpus.json in ${runDir}`);
    process.exit(2);
  }
  const meta = JSON.parse(readFileSync(src, "utf-8")).meta || {};
  if (!meta.epubHash || meta.chapterNumber == null) {
    console.error(
      `${runDir} has no epubHash/chapterNumber — an extras unit carries neither by design, so pass the BASE unit`,
    );
    process.exit(2);
  }
  return typeof meta.lastChapterNumber === "number" && meta.lastChapterNumber > meta.chapterNumber
    ? chapterRangeCachePath(meta.epubHash, meta.chapterNumber, meta.lastChapterNumber)
    : chapterCachePath(meta.epubHash, meta.chapterNumber);
}

const chapterFile = resolveChapterFile(positional);
if (!existsSync(chapterFile)) {
  console.error(
    `chapter not cached at ${chapterFile} — it is a free re-inflate of the EPUB, so run an assemble for this book first`,
  );
  process.exit(2);
}
const raw = readFileSync(chapterFile, "utf-8");

const { chars, sections, groups } = chapterOutline(raw);

console.log(`chapter file: ${chapterFile}`);
const blockCount = groups.reduce((n, g) => n + g.numerals.length, 0);
console.log(
  `${chars} chars of text, ${sections.length} section(s), ${blockCount} numbered block(s)\n`,
);

for (const s of sections) {
  const blocks = s.blocks.length ? `   [${s.blocks.join(" ")}]` : "";
  console.log(
    `  ${"  ".repeat(s.level - 1)}${s.title}`.padEnd(46) +
      `${String(s.chars).padStart(6)} chars${blocks}`,
  );
}

// The checklist proper. A numbered run with a hole in it is the one thing that makes "I stopped
// reading" visible from the outside.
for (const g of groups) {
  console.log(`\n${g.kind}: ${g.numerals.length} block(s) — ${g.numerals.join(", ")}`);
  if (g.missing.length)
    console.log(`  ⚠ the numbering has a HOLE at ${g.missing.join(", ")} — go and find it`);
  console.log(`  ACCOUNT FOR EVERY ONE. Say what each teaches, or why it produced no card.`);
}

console.log(
  `\nEvery section above is yours to judge. A section you did not read is indistinguishable from a\n` +
    `section with nothing in it — which is how EXERCISES VI and VII were missed on Lesson 16.`,
);

if (wantText) {
  console.log(`\n${"=".repeat(72)}\nFULL TEXT, by section\n${"=".repeat(72)}`);
  for (const s of sections) {
    console.log(`\n── ${s.title} ${"─".repeat(Math.max(0, 66 - s.title.length))}`);
    console.log(plainText(raw.slice(s.at, s.end)));
  }
}

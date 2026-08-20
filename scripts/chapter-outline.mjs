#!/usr/bin/env node
// The WHOLE chapter, start to end, with an end marker you can check you reached.
//
//   node scripts/chapter-outline.mjs <runDir>              # the whole chapter
//   node scripts/chapter-outline.mjs <hash> <chapterNum>
//   node scripts/chapter-outline.mjs <runDir> --summary    # structure only, no text
//
// WHY THIS EXISTS. Three lesson-level misses in two chapters, all the same shape: enumerate the
// material, process a PREFIX of it, conclude. Lesson 15 named four charts, opened two, and reported
// the sweep complete — the unread two held the chapter's main grammar table. Lesson 16 was read to
// line 780 of 942, so two whole exercises were never seen, one of them the only place the chapter
// used half its own vocabulary.
//
// The failure is invisible from the inside: a chapter you stopped reading looks exactly like a
// chapter that ended, and a `sed -n '600,780p'` window never says the file kept going.
//
// ── What this leans on, and what it does NOT ──────────────────────────────────────────────────────
//
// The guarantee is the FILE BOUNDS, and those are universal. `extractChapterToFile` already writes
// exactly one lesson's content — one spine file, or the concatenated range for a lesson that spans
// several — so "where the chapter starts and ends" is a solved problem before this script runs.
// Emitting all of it and stamping the end is the whole mechanism, and it works for any EPUB: a
// textbook, a novel, a book in any language.
//
// The structure summary on top (headings, and the book's own numbered runs) is a BONUS that depends
// on the publisher's conventions, and it is reported as such. On this textbook the numbered runs are
// the sharpest signal there is — `EXERCISES: 8 block(s) — I … VIII` makes stopping at V impossible to
// miss. On the same book's front matter, and on any book that numbers nothing, it is empty. That
// emptiness must never read as "nothing to read here", which is why the text is the default output
// and the summary is only ever an annotation on it.

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { chapterCachePath, chapterRangeCachePath } from "../src/corpus/epubLibrary.js";
import { chapterOutline, plainText } from "../src/corpus/chapterOutline.js";

const args = process.argv.slice(2);
const summaryOnly = args.includes("--summary");
const positional = args.filter((a) => !a.startsWith("--"));

if (positional.length === 0) {
  console.error(
    "usage: node scripts/chapter-outline.mjs <runDir> [--summary]\n" +
      "       node scripts/chapter-outline.mjs <epubHash> <chapterNumber> [--summary]",
  );
  process.exit(2);
}

/** The cached chapter file this unit was built from — the same bytes the extraction model read. */
function resolveChapterFile([first, second]) {
  if (second !== undefined) return chapterCachePath(first, Number(second));
  const runDir = resolve(first);
  const src = ["cards.json", "corpus.json"].map((f) => join(runDir, f)).find((f) => existsSync(f));
  if (!src) {
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
const { chars, sections, groups, images } = chapterOutline(raw);

console.log(`chapter file: ${chapterFile}`);
console.log(
  `${chars} chars of text · ${sections.length} heading(s) · ${images} image(s) referenced`,
);

// A chapter whose content is mostly PICTURES is a real shape, not an empty chapter — this book's
// kana tables are 47 chars of text and dozens of images. Saying so stops "there is nothing here".
// Low in ABSOLUTE terms, or low relative to the image count. A kana table is 47 characters and one
// figure — a ratio test alone passes it, and that chapter is entirely picture.
if (images > 0 && chars < Math.max(200, 25 * images)) {
  console.log(
    `  ⚠ very little text for ${images} image(s) — this chapter's content is probably IN the images.\n` +
      `    Run: node scripts/chapter-images.mjs ${positional.join(" ")}`,
  );
}

if (sections.length > 0) {
  console.log();
  for (const s of sections) {
    const blocks = s.blocks.length ? `   [${s.blocks.join(" ")}]` : "";
    console.log(
      `  ${"  ".repeat(s.level - 1)}${s.title}`.padEnd(46) +
        `${String(s.chars).padStart(6)} chars${blocks}`,
    );
  }
}

for (const g of groups) {
  console.log(`\n${g.kind}: ${g.numerals.length} block(s) — ${g.numerals.join(", ")}`);
  if (g.missing.length)
    console.log(`  ⚠ the numbering has a HOLE at ${g.missing.join(", ")} — go and find it`);
  console.log(`  Account for every one: what it teaches, or why it produced no card.`);
}

if (groups.length === 0) {
  console.log(
    `\nThis book does not number its blocks the way the parser recognises, so there is no numbered\n` +
      `checklist for it — that is a property of the BOOK, not a sign the chapter is thin. Your\n` +
      `completeness guarantee is the file itself: read to the END OF CHAPTER line below.`,
  );
}

if (summaryOnly) process.exit(0);

// The text, in full, always. This is the point of the script — not a mode of it.
console.log(`\n${"=".repeat(72)}`);
if (sections.length > 0) {
  for (const s of sections) {
    console.log(`\n── ${s.title} ${"─".repeat(Math.max(0, 66 - s.title.length))}`);
    console.log(plainText(raw.slice(s.at, s.end)));
  }
} else {
  // No headings is not a problem: the bounds are the file, and the file is what gets printed.
  console.log(plainText(raw));
}
console.log(
  `\n${"=".repeat(72)}\nEND OF CHAPTER — ${chars} chars, ${sections.length} heading(s), ${images} image(s).\n` +
    `If you did not see this line, you have not read the chapter.`,
);

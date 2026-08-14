#!/usr/bin/env node
// Lists a chapter's images from the artifacts the build already produced, so the required image
// sweep (SKILL.md Step 2) starts from the cache rather than from the .epub archive.
//
// Usage:
//   node scripts/chapter-images.mjs <runDir>              a built unit (reads its epubHash + chapter)
//   node scripts/chapter-images.mjs <epubHash> <n>        a chapter of a book in the local library
//
// Prints each referenced image's resolved path on disk (open them with the Read tool — it renders
// images) and, where the book's cached conventions.md names one, what it says about it. It never
// judges: load-bearing vs decoration is a call made by POSITION in the chapter, which needs the
// chapter and the picture in front of you.
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import {
  chapterCachePath,
  chapterRangeCachePath,
  loadBookConventions,
} from "../src/corpus/epubLibrary.js";
import { resolveChapterImages, conventionsNotesFor } from "../src/corpus/chapterImages.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (args.length === 0) {
  console.error("usage: chapter-images.mjs <runDir> | <epubHash> <chapterNumber>");
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

const images = resolveChapterImages(chapterPath, readFileSync(chapterPath, "utf-8"));
const { named, chapterLines } = conventionsNotesFor(loadBookConventions(epubHash), {
  chapterNumber,
  images,
});

console.log(`chapter file: ${chapterPath}`);
console.log(`${images.length} image(s) referenced\n`);

for (const image of images) {
  const size = image.bytes === null ? "MISSING" : `${Math.round(image.bytes / 1024)} KB`;
  console.log(`${image.exists ? " " : "!"} ${image.path}  (${size})`);
  for (const line of named.get(image.src) ?? []) {
    console.log(`    conventions.md: ${line.trim()}`);
  }
}

const unnamed = images.filter((i) => !named.has(i.src));
if (unnamed.length > 0) {
  console.log(
    `\n${unnamed.length} of ${images.length} are not named in conventions.md — that is not a verdict, ` +
      `just an absence. Judge each by POSITION: a figure under a heading whose text then runs out, or ` +
      `referenced by prose with no visible referent, is load-bearing.`,
  );
}

if (chapterLines.length > 0) {
  console.log(`\nconventions.md on this chapter:`);
  for (const line of chapterLines) console.log(`  ${line.trim()}`);
}

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join } from "path";
import { libraryHome } from "../model/index.js";

// Same sha256 + hex + 16-char-truncation convention as src/audio/index.js's
// hashTerm, applied to file bytes rather than a term string.
export function hashEpubFile(epubPath) {
  const bytes = readFileSync(epubPath);
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function bookDir(epubHash, { libraryHomeDir } = {}) {
  return join(libraryHomeDir || libraryHome(), "epubs", epubHash);
}

/**
 * Copies epubPath into the library under its content hash, if not already
 * present — idempotent, same "don't regenerate what's already there"
 * philosophy as the audio cache. Returns { epubHash }.
 */
export function registerEpub(epubPath, { libraryHomeDir } = {}) {
  const epubHash = hashEpubFile(epubPath);
  const dir = bookDir(epubHash, { libraryHomeDir });
  mkdirSync(dir, { recursive: true });

  const dest = join(dir, "book.epub");
  if (!existsSync(dest)) {
    copyFileSync(epubPath, dest);
  }

  return { epubHash };
}

/**
 * The cache file path a given (epubHash, chapterNumber) pair's raw content
 * should be extracted to — shared by the "current chapter" extraction in
 * assemble and the "later chapter" reads in the forward dedup pass.
 */
export function chapterCachePath(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "chapters", `${chapterNumber}.xhtml`);
}

function corpusPath(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "corpora", `${chapterNumber}.json`);
}

/**
 * Saves a human-reviewed corpus into the registry under (epubHash,
 * chapterNumber) — idempotent overwrite, so re-reviewing a chapter replaces
 * its entry rather than accumulating stale ones. Returns the path written.
 */
export function saveChapterCorpus(epubHash, chapterNumber, corpus, { libraryHomeDir } = {}) {
  const dest = corpusPath(epubHash, chapterNumber, { libraryHomeDir });
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, JSON.stringify(corpus, null, 2));
  return dest;
}

/**
 * Loads items from every previously-saved chapter STRICTLY BEFORE
 * chapterNumber, for the given book — the backward dedup pass's input.
 * Each item is tagged with `__chapterNumber` (which stored chapter it came
 * from) so a drop can name the specific chapter, not just "some earlier
 * one". Returns [] if the book has no saved chapters yet (e.g. chapter 1).
 */
export function loadPriorChapterItems(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  const dir = join(bookDir(epubHash, { libraryHomeDir }), "corpora");
  if (!existsSync(dir)) {
    return [];
  }

  const items = [];
  for (const filename of readdirSync(dir)) {
    const match = filename.match(/^(\d+)\.json$/);
    if (!match) {
      continue;
    }

    const storedChapterNumber = Number(match[1]);
    if (storedChapterNumber >= chapterNumber) {
      continue;
    }

    const stored = JSON.parse(readFileSync(join(dir, filename), "utf-8"));
    for (const item of stored.items) {
      items.push({ ...item, __chapterNumber: storedChapterNumber });
    }
  }

  return items;
}

function conventionsPath(epubHash, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "conventions.md");
}

/**
 * Loads the book-wide conventions doc for a book, if the whole-book
 * analysis pass has already run for it. Returns null if nothing's cached
 * yet (e.g. the first assemble for this book hasn't happened).
 */
export function loadBookConventions(epubHash, { libraryHomeDir } = {}) {
  const path = conventionsPath(epubHash, { libraryHomeDir });
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/**
 * Saves the book-wide conventions doc for a book — idempotent overwrite,
 * same as saveChapterCorpus. Returns the path written.
 */
export function saveBookConventions(epubHash, markdown, { libraryHomeDir } = {}) {
  const dest = conventionsPath(epubHash, { libraryHomeDir });
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, markdown);
  return dest;
}

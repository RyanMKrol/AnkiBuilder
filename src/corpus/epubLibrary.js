import { createHash } from "crypto";
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { writeFileAtomic, copyFileAtomic } from "../util/atomicWrite.js";
import { join } from "path";
import { libraryHome } from "../model/index.js";
import { getBookTitle } from "./epubArchive.js";
import { writeArtifactMeta } from "./artifactMeta.js";

// Same sha256 + hex + 16-char-truncation convention as src/audio/index.js's
// hashTerm, applied to file bytes rather than a term string.
export function hashEpubFile(epubPath) {
  const bytes = readFileSync(epubPath);
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function bookDir(epubHash, { libraryHomeDir } = {}) {
  return join(libraryHomeDir || libraryHome(), "epubs", epubHash);
}

function bookMetaPath(epubHash, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "book.json");
}

/**
 * The book's durable metadata — `{ title, slug }`. `title` comes from the EPUB's own
 * `<dc:title>` (or `null`); `slug` starts `null` and is filled in later, once an
 * output root is resolved (a slug is only meaningful relative to a specific output
 * tree's existing folder names — see `resolveBookSlug` in `src/cli/outputPaths.js`).
 * Returns `null` if this book hasn't been registered yet.
 */
export function loadBookMeta(epubHash, { libraryHomeDir } = {}) {
  const path = bookMetaPath(epubHash, { libraryHomeDir });
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/**
 * Persists the output-root-specific slug chosen for a book, preserving its
 * already-stored title. Idempotent overwrite, same as saveChapterCorpus.
 */
export function saveBookSlug(epubHash, slug, { libraryHomeDir } = {}) {
  const path = bookMetaPath(epubHash, { libraryHomeDir });
  const meta = loadBookMeta(epubHash, { libraryHomeDir }) || { title: null, slug: null };
  writeFileAtomic(path, JSON.stringify({ ...meta, slug }, null, 2));
}

/**
 * Copies epubPath into the library under its content hash, if not already
 * present — idempotent, same "don't regenerate what's already there"
 * philosophy as the audio cache. Also writes a one-time `book.json` (title
 * from the EPUB's own `<dc:title>`, slug left `null` until first resolved
 * against an output root). Returns { epubHash }.
 */
export function registerEpub(epubPath, { libraryHomeDir } = {}) {
  const epubHash = hashEpubFile(epubPath);
  const dir = bookDir(epubHash, { libraryHomeDir });
  mkdirSync(dir, { recursive: true });

  const dest = join(dir, "book.epub");
  if (!existsSync(dest)) {
    copyFileAtomic(epubPath, dest);
  }

  const metaPath = bookMetaPath(epubHash, { libraryHomeDir });
  if (!existsSync(metaPath)) {
    writeFileAtomic(
      metaPath,
      JSON.stringify({ title: getBookTitle(epubPath), slug: null }, null, 2),
    );
  }

  return { epubHash };
}

/**
 * The path of the book's own EPUB copy inside the local library
 * (`.anki-builder/epubs/<epubHash>/book.epub`, written by registerEpub). Used as the
 * backfill source when re-building a chapter of a book that was worked on before the
 * output tree kept its own copy — see resolveBookEpubPath in outputPaths.js.
 */
export function libraryEpubPath(epubHash, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "book.epub");
}

/**
 * The cache file path a given (epubHash, chapterNumber) pair's raw content
 * should be extracted to — shared by the "current chapter" extraction in
 * assemble and the "later chapter" reads in the forward flag pass.
 */
export function chapterCachePath(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "chapters", `${chapterNumber}.xhtml`);
}

/**
 * The cache file path for a multi-spine-file lesson RANGE's concatenated content
 * (extractChapterRangeToFile). Deliberately distinct from chapterCachePath's single-file
 * `<n>.xhtml` names (uses `<first>-<last>.xhtml`) so a range extraction never clobbers the
 * per-spine-file caches the book-conventions and forward-flag passes rely on.
 */
export function chapterRangeCachePath(epubHash, firstNumber, lastNumber, { libraryHomeDir } = {}) {
  return join(
    bookDir(epubHash, { libraryHomeDir }),
    "chapters",
    `${firstNumber}-${lastNumber}.xhtml`,
  );
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
  writeFileAtomic(dest, JSON.stringify(corpus, null, 2));
  return dest;
}

/**
 * Removes a chapter's saved (reviewed) corpus from the dedup library — the write-side of the
 * dashboard's Unreview: the library holds only SIGNED-OFF chapters, and a lesson whose sign-off
 * was withdrawn must stop feeding later chapters' backward dedup. Idempotent; missing entry is a
 * no-op. Returns true when an entry was actually removed.
 */
export function removeChapterCorpus(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  const path = corpusPath(epubHash, chapterNumber, { libraryHomeDir });
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

/**
 * Loads items from every previously-saved chapter STRICTLY BEFORE
 * chapterNumber, for the given book — the backward dedup pass's input.
 * Each item is tagged with `__chapterNumber` (which stored chapter it came
 * from) and `__chapterLabel` (that chapter's own human-readable title, e.g.
 * "Lesson 2: Possession" — from the stored corpus's `meta.chapterLabel`,
 * falling back to plain `chapter ${storedChapterNumber}` wording for a
 * corpus saved before that field existed) so a drop can name the specific
 * chapter the way a person reading the book would recognize it, not just
 * "some earlier one" or an internal spine index. Returns [] if the book has
 * no saved chapters yet (e.g. chapter 1).
 */
export function loadPriorChapterItems(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  const dir = join(bookDir(epubHash, { libraryHomeDir }), "corpora");
  if (!existsSync(dir)) {
    return [];
  }

  // Numeric order, not readdir's lexicographic order (which puts "10.json" before "2.json"),
  // so when a term appears in several earlier chapters the flag names the earliest one.
  const chapterFiles = readdirSync(dir)
    .map((filename) => ({ filename, match: filename.match(/^(\d+)\.json$/) }))
    .filter((f) => f.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));

  const items = [];
  for (const { filename, match } of chapterFiles) {
    const storedChapterNumber = Number(match[1]);
    if (storedChapterNumber >= chapterNumber) {
      continue;
    }

    const stored = JSON.parse(readFileSync(join(dir, filename), "utf-8"));
    const chapterLabel = stored.meta?.chapterLabel || `chapter ${storedChapterNumber}`;
    for (const item of stored.items) {
      items.push({ ...item, __chapterNumber: storedChapterNumber, __chapterLabel: chapterLabel });
    }
  }

  return items;
}

/**
 * Where a book's cached conventions doc lives. Exported so a caller can ask
 * `promptDriftWarning` (src/corpus/artifactMeta.js) about it without re-deriving the path.
 */
export function bookConventionsPath(epubHash, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "conventions.md");
}

/**
 * Loads the book-wide conventions doc for a book, if the whole-book
 * analysis pass has already run for it. Returns null if nothing's cached
 * yet (e.g. the first assemble for this book hasn't happened).
 */
export function loadBookConventions(epubHash, { libraryHomeDir } = {}) {
  const path = bookConventionsPath(epubHash, { libraryHomeDir });
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

/**
 * Saves the book-wide conventions doc for a book — idempotent overwrite,
 * same as saveChapterCorpus. Returns the path written.
 *
 * `meta` is the provenance record (buildArtifactMeta): which prompt, model and effort produced
 * this doc, and when. It is written to a `<artifact>.meta.json` sibling so a later assemble can
 * say that the cached doc predates the current prompt, which is exactly the drift that cost this
 * project a chapter's worth of cards.
 */
export function saveBookConventions(epubHash, markdown, { libraryHomeDir, meta } = {}) {
  const dest = bookConventionsPath(epubHash, { libraryHomeDir });
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileAtomic(dest, markdown);
  if (meta) writeArtifactMeta(dest, meta);
  return dest;
}

/** Where a book's cached taught-content index lives. Exported for the same reason as above. */
export function taughtIndexPath(epubHash, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), "taught-index.json");
}

/**
 * Loads the once-per-book taught-content index (chapter → what it introduces),
 * if the index pass has already run for this book. Returns null when nothing's
 * cached yet. Keyed by content hash like everything else in the library, so a
 * changed EPUB naturally re-indexes.
 */
export function loadTaughtIndex(epubHash, { libraryHomeDir } = {}) {
  const path = taughtIndexPath(epubHash, { libraryHomeDir });
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/**
 * Saves the taught-content index — idempotent overwrite. Returns the path written.
 * `meta` is the same provenance record as saveBookConventions takes.
 */
export function saveTaughtIndex(epubHash, index, { libraryHomeDir, meta } = {}) {
  const dest = taughtIndexPath(epubHash, { libraryHomeDir });
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileAtomic(dest, JSON.stringify(index, null, 2));
  if (meta) writeArtifactMeta(dest, meta);
  return dest;
}

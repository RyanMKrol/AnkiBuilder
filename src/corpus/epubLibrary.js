import { createHash } from "crypto";
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { writeFileAtomic, copyFileAtomic } from "../util/atomicWrite.js";
import { join, sep } from "path";
import { libraryHome } from "../model/index.js";
import { getBookTitle, LABEL_DECODING_CURRENT } from "./epubArchive.js";
import { writeArtifactMeta } from "./artifactMeta.js";
import { bookInvariants, bookHints, assertConfigSeparation } from "./bookConfig.js";

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
    // The label-decoding version is stamped ONCE, here, and never changed for a book that
    // already has a marker — see resolveLabelDecoding.
    writeFileAtomic(
      metaPath,
      JSON.stringify(
        {
          title: getBookTitle(epubPath),
          slug: null,
          // Split by what code may do with it — see src/corpus/bookConfig.js. A book registered
          // before this split keeps its flat shape and is never rewritten, because a pinned config
          // a delivered deck depends on is not migrated as a side effect of a refactor.
          invariants: { labelDecoding: LABEL_DECODING_CURRENT },
          hints: {},
        },
        null,
        2,
      ),
    );
  }

  return { epubHash };
}

/**
 * Which label-decoding version applies to this book — the gate that keeps a better decoder
 * away from a book whose decks already exist.
 *
 * A chapter label flows through `unitDeckSegments` into a live Anki deck name, and a deck
 * rename in Anki is not a rename: it is a new deck, and the existing notes stay in the old one
 * with all their scheduling. So the rule is not "use the best decoder", it is:
 *
 *   - a book with NO marker yet (never registered) is new: current version.
 *   - a book whose marker carries a version: that version, forever.
 *   - a book registered BEFORE this existed (a marker with no version): v1, frozen.
 *
 * Migrating an already-delivered book is a deliberate, previewed, one-time re-file — never a
 * side effect of a decoder improvement.
 */
export function resolveLabelDecoding(epubPath, { libraryHomeDir } = {}) {
  const meta = loadBookMeta(hashEpubFile(epubPath), { libraryHomeDir });
  if (!meta) return LABEL_DECODING_CURRENT;
  return bookInvariants(meta).labelDecoding ?? 1;
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
 * The extraction cache's format version. Bump it whenever chapter extraction or image
 * resolution changes, so the next build re-derives instead of re-reading files produced by
 * the old code — a cached chapter file is treated as a COMPLETE extraction forever, which is
 * what makes every parser fix inert for a book that has already been read once.
 *
 * v1 was the flat `<book>/chapters/<n>.xhtml` + `<book>/images/...` layout. v2 moves the whole
 * extraction unit under one versioned root so a bump invalidates chapters and their images
 * together; the old directories are simply orphaned, and `epub cache --clear` removes them.
 *
 * Only the FREE zip-inflate cache lives here. The paid artifacts (corpora, conventions.md,
 * taught-index.json) are not versioned by this and are never invalidated behind your back.
 */
export const CACHE_VERSION = 2;

/**
 * The root of one book's versioned extraction cache. Chapter files sit one level inside it,
 * so an image's own `../images/foo.png` still resolves within this root — which is also the
 * containment boundary extractChapterToFile enforces.
 */
export function bookCacheRoot(epubHash, { libraryHomeDir } = {}) {
  return join(bookDir(epubHash, { libraryHomeDir }), `cache-v${CACHE_VERSION}`);
}

/**
 * The cache file path a given (epubHash, chapterNumber) pair's raw content
 * should be extracted to — shared by the "current chapter" extraction in
 * assemble and the "later chapter" reads in the forward flag pass.
 */
export function chapterCachePath(epubHash, chapterNumber, { libraryHomeDir } = {}) {
  return join(bookCacheRoot(epubHash, { libraryHomeDir }), "chapters", `${chapterNumber}.xhtml`);
}

/**
 * The cache file path for a multi-spine-file lesson RANGE's concatenated content
 * (extractChapterRangeToFile). Deliberately distinct from chapterCachePath's single-file
 * `<n>.xhtml` names (uses `<first>-<last>.xhtml`) so a range extraction never clobbers the
 * per-spine-file caches the book-conventions and forward-flag passes rely on.
 */
export function chapterRangeCachePath(epubHash, firstNumber, lastNumber, { libraryHomeDir } = {}) {
  return join(
    bookCacheRoot(epubHash, { libraryHomeDir }),
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

// The three caches a book accumulates, and which of them cost money to rebuild. The
// distinction is the whole point of both functions below: chapters are a free zip inflate,
// conventions.md and taught-index.json are outputs of paid whole-book LLM passes, and
// corpora/ is the human-reviewed dedup registry that is not a cache at all.
const CACHE_KINDS = {
  chapters: { label: "chapters", paid: false },
  conventions: { label: "conventions.md", paid: true },
  "taught-index": { label: "taught-index.json", paid: true },
};

function newestMtime(dir) {
  let newest = null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const stamp = entry.isDirectory() ? newestMtime(path) : statSync(path).mtime.toISOString();
    if (stamp && (!newest || stamp > newest)) newest = stamp;
  }
  return newest;
}

function countFiles(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    count += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return count;
}

/**
 * What is cached for a book right now, and when it was generated — the provenance half of the
 * shape report. Every parser and prompt fix is inert for a book whose artifacts already exist,
 * so "this conventions.md was written in July" is the fact that explains a build behaving like
 * an older version of this tool.
 *
 * Note honestly: nothing records WHICH prompt version produced the paid artifacts, so the
 * timestamp is the only provenance there is.
 */
export function describeBookCache(epubHash, { libraryHomeDir } = {}) {
  const dir = bookDir(epubHash, { libraryHomeDir });
  if (!existsSync(dir)) {
    return { registered: false, cacheVersion: CACHE_VERSION, epubHash };
  }

  const cacheRoot = bookCacheRoot(epubHash, { libraryHomeDir });
  const corpora = join(dir, "corpora");
  const describeFile = (path) =>
    existsSync(path)
      ? { present: true, generatedAt: statSync(path).mtime.toISOString() }
      : { present: false };

  // Any cache-v* directory that is not the current one is output of an older extractor, kept
  // only so nothing is deleted behind your back.
  const staleRoots = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^cache-v\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => name !== `cache-v${CACHE_VERSION}`);
  if (existsSync(join(dir, "chapters"))) staleRoots.push("chapters (pre-versioning)");

  return {
    registered: true,
    epubHash,
    dir,
    cacheVersion: CACHE_VERSION,
    chapters: existsSync(cacheRoot)
      ? { present: true, files: countFiles(cacheRoot), generatedAt: newestMtime(cacheRoot) }
      : { present: false, files: 0, generatedAt: null },
    conventions: describeFile(join(dir, "conventions.md")),
    taughtIndex: describeFile(join(dir, "taught-index.json")),
    reviewedCorpora: existsSync(corpora) ? countFiles(corpora) : 0,
    staleRoots,
  };
}

/**
 * Deletes a book's rebuildable caches. `kinds` is any of "chapters", "conventions",
 * "taught-index"; the default is chapters alone, because that is the only one that costs
 * nothing to rebuild — the other two are outputs of paid whole-book passes and must be asked
 * for by name.
 *
 * `corpora/` is NEVER touched, whatever is passed. It is the human-reviewed dedup registry:
 * signed-off chapters that cannot be regenerated by any amount of compute, sitting one
 * directory away from everything here. That adjacency is exactly why the only recourse today
 * is an improvised `rm -rf`, and why this function refuses rather than trusting the caller.
 *
 * Returns the list of removed paths (and, when `dryRun`, the list it would remove).
 */
export function clearBookCache(
  epubHash,
  { kinds = ["chapters"], dryRun = false, libraryHomeDir } = {},
) {
  const dir = bookDir(epubHash, { libraryHomeDir });
  if (!existsSync(dir)) {
    throw new Error(`no book registered under hash "${epubHash}" (looked in ${dir})`);
  }

  const unknown = kinds.filter((kind) => !(kind in CACHE_KINDS));
  if (unknown.length) {
    throw new Error(
      `unknown cache kind(s): ${unknown.join(", ")} — valid kinds are ${Object.keys(CACHE_KINDS).join(", ")}`,
    );
  }

  const targets = [];
  if (kinds.includes("chapters")) {
    // Every cache-v* root plus the pre-versioning flat layout: all of it is a free re-inflate.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/^cache-v\d+$/.test(entry.name) || entry.name === "chapters" || entry.name === "images") {
        targets.push(join(dir, entry.name));
      }
    }
  }
  if (kinds.includes("conventions")) targets.push(join(dir, "conventions.md"));
  if (kinds.includes("taught-index")) targets.push(join(dir, "taught-index.json"));

  const corpora = join(dir, "corpora");
  for (const target of targets) {
    // Belt and braces: the paths above are constructed, not user-supplied, but this is the one
    // directory whose loss is unrecoverable, so the refusal is checked at the point of deletion
    // rather than assumed from how the list was built.
    if (target === corpora || target.startsWith(corpora + sep)) {
      throw new Error(
        `refusing to delete ${target}: corpora/ holds human-reviewed chapters and is never a cache`,
      );
    }
  }

  const removed = targets.filter((target) => existsSync(target));
  if (!dryRun) {
    for (const target of removed) rmSync(target, { recursive: true, force: true });
  }
  return removed;
}

/**
 * A book's hints, for a PROMPT. Never branch on one of these — see src/corpus/bookConfig.js for
 * why the two sections of book.json are not interchangeable.
 */
export function loadBookHints(epubHash, { libraryHomeDir } = {}) {
  const meta = loadBookMeta(epubHash, { libraryHomeDir });
  if (!meta) return {};
  assertConfigSeparation(meta, { path: bookMetaPath(epubHash, { libraryHomeDir }) });
  return bookHints(meta);
}

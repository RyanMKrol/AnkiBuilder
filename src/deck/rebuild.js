import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { buildDeck as defaultBuildDeck, buildBookDeck as defaultBuildBookDeck } from "./index.js";

// Deck (re)build assembly, shared by the CLI (`deck --book-dir` / `deck --run`) and the dashboard's
// automatic rebuilds (Mark done / Reopen, and an audio or exclude edit on an already-done lesson), so
// a rebuild triggered from the browser is byte-identical to the CLI's. The build functions in
// ./index.js own the media-key integer constraint; this module only assembles their inputs from a
// book/course dir or a single run dir.

const BOOK_UNIT_DIR_PATTERN = /^(?:chapter|lesson)-(\d+)$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * The FINISHED (human-marked `done`) units under a book/course dir, ordered by folder seq — the exact
 * set of chapters/lessons that ship in the merged `.apkg`. Each entry is
 * `{ name: chapterLabel, cards, audioDir, dir }`. Shared by `rebuildBookDir` (the .apkg path) and the
 * AnkiConnect deliverer (`src/anki/deliver.js`), so both push the identical content. A lesson still in
 * progress — no cards.json, or not marked done — is excluded. Throws when the dir has no unit folders.
 */
export function selectDoneChapterDecks(bookDir) {
  const chapterDirs = readdirSync(bookDir)
    .map((name) => name.match(BOOK_UNIT_DIR_PATTERN))
    .filter(Boolean)
    .map((m) => ({ seq: Number(m[1]), dir: join(bookDir, m[0]) }))
    .sort((a, b) => a.seq - b.seq);

  if (chapterDirs.length === 0) {
    throw new Error(`no chapter-*/ or lesson-*/ directories found under ${bookDir}`);
  }

  const chapterDecks = [];
  let epubHash = null;
  for (const { dir } of chapterDirs) {
    const cardsPath = join(dir, "cards.json");
    if (!existsSync(cardsPath)) continue;
    // An unreadable cards.json must never take down the whole rebuild: the likeliest cause is
    // a lesson being written right now by a concurrent stage, and such a lesson is by
    // definition not `done`, so it wasn't going into the package anyway.
    let cards;
    try {
      cards = readJson(cardsPath);
    } catch {
      continue;
    }
    if (cards.meta?.done !== true) continue;
    epubHash = epubHash || cards.meta?.epubHash;
    const audioDir = join(dir, "audio");
    chapterDecks.push({
      name: cards.meta?.chapterLabel || `Chapter ${chapterDecks.length + 1}`,
      cards,
      audioDir: existsSync(audioDir) ? audioDir : null,
      dir,
    });
  }
  return { chapterDecks, epubHash };
}

/**
 * The Anki parent-deck name a book/course maps to — `bookMeta.title || .name`, with the same fallbacks
 * `rebuildBookDir` bakes into the package. Shared so the deliverer targets the exact deck the `.apkg`
 * import created.
 */
export function resolveBookName(
  bookDir,
  epubHash,
  { loadBookMeta, loadCourseMeta, bookNameFallback = null } = {},
) {
  const bookMeta = epubHash ? loadBookMeta?.(epubHash) : loadCourseMeta?.(bookDir);
  return bookMeta?.title || bookMeta?.name || bookNameFallback || "AnkiBuilder Book Deck";
}

/**
 * Merges the book's done lessons into `<bookDir>/deck.apkg`.
 *
 * ⚠️ **The body of this function must never `await`.** Two rebuilds can be REQUESTED concurrently in
 * the dashboard — `handleLessonDone` awaits `rebuildGroupQuiet`, and that await is a yield point, so a
 * second POST can be dispatched while the first is pending. What stops them interleaving is that
 * everything below is synchronous: the done-set read (`readdirSync`/`readFileSync`), the package build
 * (`buildBookDeck` is a plain function, `buildZip` is sync) and the publish (`writeFileAtomic` +
 * rename) all complete in ONE event-loop turn. Node cannot schedule the second rebuild between the
 * read and the write, so the later rebuild always sees every `done` flag written before it started.
 *
 * This used to be guaranteed by a per-book lock file instead. The lock was removed along with the rest
 * of the multi-process support, which makes the no-yield property load-bearing rather than incidental:
 * making `buildBookDeck` async would silently reintroduce the lost update (a rebuild publishing a
 * done-set that is missing a lesson finished while it ran). Declared `async` only so callers are
 * unchanged. See the regression test in test/deck/rebuild.test.js.
 *
 * Cross-process (the dashboard rebuilding while `deck --book-dir` runs in a terminal) is no longer
 * defended: worst case the `.apkg` briefly misses a just-finished lesson. It is never corrupt — the
 * atomic rename in ./index.js is what guarantees that — and the next rebuild picks the lesson up.
 */
export async function rebuildBookDir(
  bookDir,
  {
    buildBookDeck = defaultBuildBookDeck,
    loadBookMeta,
    loadCourseMeta,
    bookNameFallback = null,
    now = Date.now,
  } = {},
) {
  const outPath = join(bookDir, "deck.apkg");
  const { chapterDecks, epubHash } = selectDoneChapterDecks(bookDir);

  if (chapterDecks.length === 0) {
    throw new Error(
      `no finished lessons to build under ${bookDir} — mark a lesson "done" in the dashboard first`,
    );
  }

  const bookName = resolveBookName(bookDir, epubHash, {
    loadBookMeta,
    loadCourseMeta,
    bookNameFallback,
  });
  return buildBookDeck(chapterDecks, { outPath, bookName, now: now() });
}

/**
 * Rebuilds a single run directory's `<runDir>/deck.apkg` (template / one-off). Mirrors the CLI's
 * `deck --run` build branch, but ALWAYS rebuilds (no resumable "already exists → reuse" guard, which
 * stays in the CLI wrapper) — the dashboard rebuild must reflect the latest edits.
 */
export function rebuildRunDir(runDir, { buildDeck = defaultBuildDeck, deckName = null } = {}) {
  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) {
    throw new Error(`cards.json not found at ${cardsPath} — run "translate"/"audio" first`);
  }
  const cards = readJson(cardsPath);
  const audioDir = join(runDir, "audio");
  return buildDeck(cards, {
    outPath: join(runDir, "deck.apkg"),
    audioDir: existsSync(audioDir) ? audioDir : null,
    deckName,
  });
}

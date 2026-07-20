import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { buildDeck as defaultBuildDeck, buildBookDeck as defaultBuildBookDeck } from "./index.js";

// Deck (re)build assembly, shared by the CLI (`deck --book-dir` / `deck --run`) and the dashboard
// server's "Rebuild deck" action, so a rebuild triggered from the browser is byte-identical to the
// CLI's. The build functions in ./index.js own the media-key integer constraint; this module only
// assembles their inputs from a book/course dir or a single run dir.

const BOOK_UNIT_DIR_PATTERN = /^(?:chapter|lesson)-(\d+)$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Merges every built chapter/lesson under `bookDir` into one `<bookDir>/deck.apkg`. Units are ordered
 * by FOLDER SEQ (chapter-0, chapter-1, …) — the deck build's canonical order, independent of the
 * dashboard's chapterNumber display order. Throws the same messages the CLI does when the dir has no
 * units or a unit lacks cards.json.
 */
export function rebuildBookDir(
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
    if (!existsSync(cardsPath)) {
      throw new Error(
        `cards.json not found in ${dir} — run "translate"/"audio" for that chapter first`,
      );
    }
    const cards = readJson(cardsPath);
    epubHash = epubHash || cards.meta?.epubHash;
    const audioDir = join(dir, "audio");
    chapterDecks.push({
      name: cards.meta?.chapterLabel || `Chapter ${chapterDecks.length + 1}`,
      cards,
      audioDir: existsSync(audioDir) ? audioDir : null,
    });
  }

  const bookMeta = epubHash ? loadBookMeta?.(epubHash) : loadCourseMeta?.(bookDir);
  const bookName = bookMeta?.title || bookMeta?.name || bookNameFallback || "AnkiBuilder Book Deck";
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

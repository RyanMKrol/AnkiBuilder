import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Buffer } from "buffer";
import { buildCollection, buildMultiDeckCollection } from "./collection.js";
import { buildZip } from "./zip.js";

// Resolves each card's `audio` filename against `audioDir` into an embeddable zip
// media entry, or drops it (audio: undefined) when missing/unresolvable — shared by
// buildDeck (one chapter) and buildBookDeck (many chapters merged into one package).
// `keyPrefix` keeps media keys unique when several chapters' media maps are merged
// into one zip (`"0-0"`, `"0-1"`, `"1-0"`, ...) — plain `""` for the single-chapter
// case reproduces today's plain numeric keys ("0", "1", ...) exactly.
function resolveChapterAudio(cards, audioDir, keyPrefix, media, mediaEntries) {
  let mediaIndex = 0;
  const items = cards.items.map((item) => {
    if (!item.audio) {
      return { ...item, audio: undefined };
    }
    const audioPath = audioDir ? join(audioDir, item.audio) : null;
    if (!audioPath || !existsSync(audioPath)) {
      return { ...item, audio: undefined };
    }

    const key = `${keyPrefix}${mediaIndex}`;
    media[key] = item.audio;
    mediaEntries.push({ name: key, data: readFileSync(audioPath) });
    mediaIndex++;

    return item;
  });

  return { ...cards, items };
}

/**
 * Builds a `.apkg` (a zip of collection.anki2 + media) from cards.json.
 * Each card becomes one note with two generated cards (Recognition,
 * Production). When `audioDir` is given and a card's `audio` filename
 * exists inside it, the audio is embedded and referenced via [sound:...];
 * otherwise the card is built without audio.
 */
export function buildDeck(
  cards,
  { outPath, audioDir = null, deckName = null, now = Date.now() } = {},
) {
  if (!outPath) {
    throw new Error("outPath is required");
  }

  const media = {};
  const mediaEntries = [];
  const resolvedCards = resolveChapterAudio(cards, audioDir, "", media, mediaEntries);

  const collectionBytes = buildCollection(resolvedCards, {
    deckName: deckName || resolvedCards.meta?.targetLanguage || "AnkiBuilder Deck",
    now,
  });

  const zipEntries = [
    { name: "collection.anki2", data: collectionBytes },
    { name: "media", data: Buffer.from(JSON.stringify(media), "utf-8") },
    ...mediaEntries,
  ];

  const zipBytes = buildZip(zipEntries);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, zipBytes);

  return { outPath, noteCount: resolvedCards.items.length, mediaCount: mediaEntries.length };
}

/**
 * Builds a single `.apkg` merging several chapters' cards into one collection, each
 * chapter as its own real Anki sub-deck nested under a parent deck named for the
 * book. `chapterDecks`: `[{ name: chapterLabel, cards, audioDir }]`, in the desired
 * sub-deck order (typically a book's `chapter-<seq>` folder order).
 */
export function buildBookDeck(chapterDecks, { outPath, bookName, now = Date.now() } = {}) {
  if (!outPath) {
    throw new Error("outPath is required");
  }

  const media = {};
  const mediaEntries = [];

  const resolvedChapterDecks = chapterDecks.map((chapter, index) => ({
    name: chapter.name,
    cards: resolveChapterAudio(chapter.cards, chapter.audioDir, `${index}-`, media, mediaEntries),
  }));

  const collectionBytes = buildMultiDeckCollection(resolvedChapterDecks, { bookName, now });

  const zipEntries = [
    { name: "collection.anki2", data: collectionBytes },
    { name: "media", data: Buffer.from(JSON.stringify(media), "utf-8") },
    ...mediaEntries,
  ];

  const zipBytes = buildZip(zipEntries);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, zipBytes);

  const noteCount = resolvedChapterDecks.reduce(
    (sum, chapter) => sum + chapter.cards.items.length,
    0,
  );

  return {
    outPath,
    noteCount,
    chapterCount: resolvedChapterDecks.length,
    mediaCount: mediaEntries.length,
  };
}

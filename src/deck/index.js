import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Buffer } from "buffer";
import { buildCollection, buildMultiDeckCollection } from "./collection.js";
import { buildZip } from "./zip.js";
import { getLanguageFont, readFontBytes } from "./fontLibrary.js";
import { resolveIso639Code } from "../model/iso639.js";

// Embeds the deck's per-language font file (if the language has one configured — see fontLibrary.js)
// into the media, under its `_`-prefixed name, matching the `@font-face` the collection's CSS
// references. Added once per deck (not per chapter); the collection builder wires up the CSS.
function embedLanguageFont(targetLanguage, media, mediaEntries, counter, getFont, readFont) {
  const descriptor = getFont(resolveIso639Code(targetLanguage));
  if (!descriptor || Object.values(media).includes(descriptor.mediaName)) {
    return;
  }
  const key = String(counter.next);
  counter.next++;
  media[key] = descriptor.mediaName;
  mediaEntries.push({ name: key, data: readFont(descriptor) });
}

// Resolves each card's `audio` filename against `audioDir` into an embeddable zip
// media entry, or drops it (audio: undefined) when missing/unresolvable — shared by
// buildDeck (one chapter) and buildBookDeck (many chapters merged into one package).
//
// Media manifest keys MUST be plain sequential non-negative integers ("0", "1", "2",
// ...), matching the zip entry filename for that media file exactly — this is a real
// constraint of Anki's own .apkg format, not a stylistic choice. An earlier version of
// this function used a `${chapterIndex}-${mediaIndex}` scheme (e.g. "0-0", "1-3") to
// keep keys unique across merged chapters, which LOOKS like a reasonable unique key
// but silently produces an .apkg Anki's importer rejects outright with "A number was
// invalid or out of range" — confirmed by bisecting a real import against the actual
// Anki backend (see .harness/custom/docs/LIMITATIONS.md). `counter` is a single shared
// mutable `{ next }` object threaded across every chapter's call in buildBookDeck, so
// numbering stays globally sequential with no resets and no prefixes.
function resolveChapterAudio(cards, audioDir, media, mediaEntries, counter) {
  // Cards marked excluded in the dashboard translate review are dropped from the built deck.
  const items = cards.items
    .filter((item) => !item.excluded)
    .map((item) => {
      if (!item.audio) {
        return { ...item, audio: undefined };
      }
      const audioPath = audioDir ? join(audioDir, item.audio) : null;
      if (!audioPath || !existsSync(audioPath)) {
        return { ...item, audio: undefined };
      }

      const key = String(counter.next);
      counter.next++;
      media[key] = item.audio;
      mediaEntries.push({ name: key, data: readFileSync(audioPath) });

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
  {
    outPath,
    audioDir = null,
    deckName = null,
    now = Date.now(),
    getFont = getLanguageFont,
    readFont = readFontBytes,
  } = {},
) {
  if (!outPath) {
    throw new Error("outPath is required");
  }

  const media = {};
  const mediaEntries = [];
  const counter = { next: 0 };
  const resolvedCards = resolveChapterAudio(cards, audioDir, media, mediaEntries, counter);
  embedLanguageFont(cards.meta?.targetLanguage, media, mediaEntries, counter, getFont, readFont);

  const collectionBytes = buildCollection(resolvedCards, {
    deckName: deckName || resolvedCards.meta?.targetLanguage || "AnkiBuilder Deck",
    now,
    getFont,
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
export function buildBookDeck(
  chapterDecks,
  { outPath, bookName, now = Date.now(), getFont = getLanguageFont, readFont = readFontBytes } = {},
) {
  if (!outPath) {
    throw new Error("outPath is required");
  }

  const media = {};
  const mediaEntries = [];
  const counter = { next: 0 };

  const resolvedChapterDecks = chapterDecks.map((chapter) => ({
    name: chapter.name,
    cards: resolveChapterAudio(chapter.cards, chapter.audioDir, media, mediaEntries, counter),
  }));
  embedLanguageFont(
    chapterDecks[0]?.cards?.meta?.targetLanguage,
    media,
    mediaEntries,
    counter,
    getFont,
    readFont,
  );

  const collectionBytes = buildMultiDeckCollection(resolvedChapterDecks, {
    bookName,
    now,
    getFont,
  });

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

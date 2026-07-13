import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Buffer } from "buffer";
import { buildCollection } from "./collection.js";
import { buildZip } from "./zip.js";

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
  let mediaIndex = 0;
  const mediaEntries = [];

  const resolvedCards = {
    ...cards,
    items: cards.items.map((item) => {
      if (!item.audio) {
        return { ...item, audio: undefined };
      }
      const audioPath = audioDir ? join(audioDir, item.audio) : null;
      if (!audioPath || !existsSync(audioPath)) {
        return { ...item, audio: undefined };
      }

      const key = String(mediaIndex);
      media[key] = item.audio;
      mediaEntries.push({ name: key, data: readFileSync(audioPath) });
      mediaIndex++;

      return item;
    }),
  };

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

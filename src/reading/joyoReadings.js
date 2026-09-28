// The official school reading list (常用漢字表): the reference every Japanese kanji card is completed
// to, whichever book it comes from (owner decisions, 2026-09-28). A book teaches a kanji's readings as
// it needs them (Genki gives 明 only めい and あか), so on its own a kanji card showed a subset; with this
// every card shows the readings a Japanese reader is expected to know, the book's own first. The data
// is src/reading/data/joyo-readings.json, built by scripts/build-joyo-readings.mjs; data/NOTICE.md has
// the source and licence. Special and narrow-use readings (bracketed in the official table) are left
// out unless a kanji has no other (岡, 埼: prefecture names).

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

let cached = null;
function table() {
  if (!cached) {
    const path = join(dirname(fileURLToPath(import.meta.url)), "data", "joyo-readings.json");
    cached = JSON.parse(readFileSync(path, "utf-8")).kanji;
  }
  return cached;
}

/** A kanji's official readings, `{ on, kun }` in hiragana, or null for a kanji not on the list. */
export function officialReadings(kanji) {
  const entry = table()[kanji];
  return entry ? { on: [...entry.on], kun: [...entry.kun] } : null;
}

const union = (first = [], then = []) => [...new Set([...first, ...then])];

/**
 * A kanji's readings completed to the official list: `base` (the book's, or a reviewed generated
 * card's) first, then every official reading it lacks. Null when there is neither.
 */
export function completeKanjiReadings(base, kanji) {
  const official = officialReadings(kanji);
  if (!base && !official) return null;
  return {
    on: union(base?.on, official?.on),
    kun: union(base?.kun, official?.kun),
  };
}

/** The one reading of a kanji that has exactly one, in kana, or null. */
export function soleKanjiReading(readings) {
  const all = [...(readings?.on ?? []), ...(readings?.kun ?? [])];
  return all.length === 1 ? all[0] : null;
}

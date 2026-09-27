// The Japanese reading plugin's kanji dictionary (owner decisions, 2026-09-28): a kanji a word uses
// before the book teaches it gets a card whose meaning and readings come from here, then a model
// for a kanji this lacks, then a review agent per chapter (src/reading/characterGaps.js).
//
// The data is KANJIDIC2's graded kanji (the jōyō and jinmeiyō sets), compacted by
// scripts/build-kanji-dictionary.mjs into data/kanjidic2-compact.json; data/NOTICE.md has the
// licence (CC BY-SA 4.0, EDRDG). Readings come back in the same shape the book's kanji tables give
// (src/reading/kanjiReadings.js): hiragana, Chinese-derived (`on`) then native (`kun`), each kun
// reading cut to the part the kanji itself is read as (き.く is き), as the book prints them.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

let cached = null;
function dictionary() {
  if (!cached) {
    const path = join(dirname(fileURLToPath(import.meta.url)), "data", "kanjidic2-compact.json");
    cached = JSON.parse(readFileSync(path, "utf-8"));
  }
  return cached;
}

/** The dictionary's own name and edition, for a card's provenance note. */
export const kanjiDictionarySource = () => dictionary().source;

const toHiragana = (text) =>
  String(text).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const unique = (list) => [...new Set(list.filter(Boolean))];

/**
 * A kanji's meaning and readings, or null when the dictionary does not have it. `english` is the
 * first three meanings, sentence-cased ("Hear; ask; listen").
 */
export function lookupKanji(character) {
  const entry = dictionary().kanji[character];
  if (!entry) return null;
  const meanings = entry.m.slice(0, 3);
  const english = meanings.length
    ? meanings.map((m, i) => (i === 0 ? m.charAt(0).toUpperCase() + m.slice(1) : m)).join("; ")
    : null;
  return {
    english,
    readings: {
      on: unique(entry.on.map((r) => toHiragana(r.replace(/-/g, "")))),
      kun: unique(entry.kun.map((r) => r.replace(/-/g, "").split(".")[0])),
    },
  };
}

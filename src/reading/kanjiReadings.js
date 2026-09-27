// The readings shown on a single-kanji reading card (owner decision, 2026-09-27).
//
// A kanji has no one authoritative reading: which applies depends on the word it is in (聞 is き in
// 聞く, ぶん in 新聞). That is why a kanji card has no audio. But a kanji card with no readings at all
// told the learner nothing about how the kanji sounds, so the card's romaji line carries every
// reading the book lists for it: `bun / ki`, the Chinese-derived readings, then the native ones.
//
// The readings come from the book's own kanji table, parsed here in code, never from a model: a
// converted Genki chapter prints each entry as `075 聞 (to listen) ▶ぶん ▷き` (or with the readings
// before the meaning, `001 一 ▶ いち いっ ▷ひと (one)`), where ▶ marks the Chinese-derived readings
// and ▷ the native ones.

import kuroshiroModule from "kuroshiro";

const Kuroshiro = kuroshiroModule.default ?? kuroshiroModule;
const KANA_TOKEN = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const ENTRY = /(\d{3})\s*(\p{Script=Han})\s/gu;

const plainText = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/**
 * Every kanji-table entry in a chapter, as `Map<kanji, { on: string[], kun: string[] }>`. An entry
 * with no ▶ or ▷ marker (a kanji the chapter only mentions) is not included.
 */
export function parseKanjiReadings(html) {
  const text = plainText(html);
  const out = new Map();
  for (const m of text.matchAll(ENTRY)) {
    const kanji = m[2];
    // The meaning in brackets may come before or after the readings: drop it, then read marker
    // groups until the first word that is not bare kana (the entry's example words begin there).
    let rest = text.slice(m.index + m[0].length, m.index + m[0].length + 120);
    const meaning = rest.match(/\(([^)]*[A-Za-z][^)]*)\)/)?.[1]?.trim() ?? null;
    rest = rest.replace(/\([^)]*[A-Za-z][^)]*\)/, " ");
    const readings = { on: [], kun: [] };
    let group = null;
    let seenMarker = false;
    for (const token of rest
      .replace(/([▶▷])/g, " $1 ")
      .trim()
      .split(/\s+/)) {
      if (token === "▶" || token === "▷") {
        group = token === "▶" ? "on" : "kun";
        seenMarker = true;
      } else if (group && KANA_TOKEN.test(token)) {
        readings[group].push(token);
      } else if (seenMarker) {
        break;
      } else {
        break;
      }
    }
    if ((readings.on.length || readings.kun.length) && !out.has(kanji)) {
      // The book's meaning rides along (sentence-cased, "To listen"), for a card generated before
      // the book taught this kanji (src/reading/characterGaps.js). Enumerable only on purpose: the
      // readings line reads `on` and `kun` alone.
      out.set(kanji, {
        ...readings,
        meaning: meaning ? meaning.charAt(0).toUpperCase() + meaning.slice(1) : null,
      });
    }
  }
  return out;
}

/** One reading in the house romaji: long vowels with macrons (jō, shū), and a trailing small っ as
 * the kanji dictionaries write it (いっ is `it-`: the doubled sound depends on the word). */
export function readingRomaji(kana) {
  const trailingSokuon = /[っッ]$/u.test(kana);
  const body = trailingSokuon ? kana.slice(0, -1) : kana;
  let romaji = Kuroshiro.Util.kanaToRomaji(body, "hepburn")
    .replace(/ou/g, "ō")
    .replace(/oo/g, "ō")
    .replace(/uu/g, "ū");
  if (trailingSokuon) romaji += "t-";
  return romaji;
}

/** The romaji line for a kanji card: `ichi, it- / hito`; either side alone when the book lists one. */
export function kanjiReadingsLine({ on = [], kun = [] }) {
  const side = (list) => list.map(readingRomaji).join(", ");
  return [side(on), side(kun)].filter(Boolean).join(" / ");
}

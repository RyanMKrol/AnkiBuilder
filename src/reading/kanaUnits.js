// The kana deck of a Japanese reading collection (docs/designs/reading-decks/09-kana-deck.md).
//
// Reading kana is a finite skill: the sounds, their voiced forms, the small-kana combinations, small
// っ and ー. After a few hundred words every new kana-only card is the same drill again, so a reading
// collection cards its kana words ONCE, in one deck chosen from the whole book: first so that every
// sound the book uses is seen a few times, then up to a budget per script (owner decisions,
// 2026-09-24). Kanji is never limited; it lives in the chapter decks.
//
// A SOUND UNIT is what a reader has to recognise as one thing. A kana followed by a small ゃゅょ is
// one sound (にゃ, not に + ゃ), and so is a katakana followed by a small ァィゥェォ (ティ, ファ): the
// owner asked for the merging to be respected, because reading にゃ is a different skill from reading
// に. Small っ and ー are units of their own, since each changes how the word is read.

import { selectSoundDeck } from "./soundDeck.js";

const HIRAGANA = /\p{Script=Hiragana}/u;
const KATAKANA = /\p{Script=Katakana}/u;
const YOON = new Set([..."ゃゅょゎャュョヮ"]);
const SMALL_VOWEL = new Set([..."ぁぃぅぇぉァィゥェォ"]);
const JOINS_PREVIOUS = (c) => YOON.has(c) || SMALL_VOWEL.has(c);
const isKana = (c) => HIRAGANA.test(c) || KATAKANA.test(c) || c === "ー";

/**
 * The sound units of a kana string, in order: `がっこう` is `["が", "っ", "こ", "う"]`, `コーヒー`
 * is `["コ", "ー", "ヒ", "ー"]`, `ティー` is `["ティ", "ー"]`. Anything that is not kana (a kanji,
 * punctuation, a space) is skipped.
 */
export function kanaUnits(text) {
  const units = [];
  for (const c of [...String(text ?? "").normalize("NFC")]) {
    if (!isKana(c)) continue;
    const last = units.length - 1;
    if (JOINS_PREVIOUS(c) && last >= 0 && !JOINS_PREVIOUS(units[last].at(-1))) {
      units[last] += c;
    } else {
      units.push(c);
    }
  }
  return units;
}

/**
 * Which budget a kana word counts against: `katakana` if it has any katakana, else `hiragana`. A mixed
 * word (アジアけんきゅう) goes to katakana, the scarcer of the two in a beginners' book.
 */
export function kanaScript(text) {
  return [...String(text ?? "")].some((c) => KATAKANA.test(c) && c !== "ー")
    ? "katakana"
    : "hiragana";
}

/** The kana deck's choice: the generic selection (src/reading/soundDeck.js) with kana sound units. */
export function selectKanaDeck(pool, { budgets, minPerUnit }) {
  return selectSoundDeck(pool, { budgets, minPerUnit, units: kanaUnits, script: kanaScript });
}

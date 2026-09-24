import { resolveIso639Code } from "../model/iso639.js";
import { isReadingKind } from "../model/deckKind.js";

// Per-language behaviour of the READING deck (docs/designs/reading-decks/05-japanese-plugin.md),
// keyed by ISO 639-1 like every other language registry here (src/cards/inflectionSchemes.js is the
// pattern). A language with no entry returns `null`, which means word and phrase cards only, no
// character cards, and audio spoken from the target as written. Nothing is invented for it.
//
// Japanese declares four things, all owner decisions of 2026-09-23:
//   1. the card is the kanji spelling when the book prints one, and its kana becomes the reading;
//   2. a kanji the book teaches AS A CHARACTER is a card of its own, meaning only;
//   3. that card is silent: a kanji alone has no one pronunciation (日 is に in 日本, び in 日曜日,
//      ひ on its own), so any single audio would teach a reading that is wrong most of the time;
//   4. every kanji word carries its kana reading, copied from the book, which makes the romaji, is
//      what the audio review checks a clip against, and is never shown. The voice itself is given
//      the written form, except where that is ambiguous (src/reading/readingPhase.js,
//      spokenFromWrittenForm).

const HAN = /\p{Script=Han}/u;
const KANA_CHAR = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]$/u;
// A reading is kana, with the long-vowel mark and the separators a book prints between readings.
const KANA_READING = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・、 ]+$/u;

const chars = (text) => [...String(text ?? "").trim()];

const JAPANESE = Object.freeze({
  language: "Japanese",
  characterCards: true,
  /** A single kanji (or 々, which Genki teaches as a character). */
  isCharacterTarget: (target) => {
    const c = chars(target);
    return c.length === 1 && HAN.test(c[0]);
  },
  /** A single hiragana or katakana: a card only as a word, never as a letter (card rules 5). */
  isSingleLetter: (target) => {
    const c = chars(target);
    return c.length === 1 && KANA_CHAR.test(c[0]);
  },
  /** A word containing kanji needs its kana reading, or TTS may read it wrongly. */
  requiresReading: (target) => HAN.test(String(target ?? "")),
  isValidReading: (reading) => KANA_READING.test(String(reading ?? "").trim()),
  /**
   * Kana-only words are carded once per collection, in one kana deck chosen from the whole book
   * (src/reading/kanaUnits.js; owner decisions, 2026-09-24): first so every sound unit is in at
   * least `minPerUnit` words, then up to a budget per script. Chapters card only kanji. `label` is
   * the kana unit's chapter label, numbered 00 so its Anki deck sorts before every chapter.
   */
  kanaDeck: Object.freeze({
    budgets: Object.freeze({ hiragana: 150, katakana: 150 }),
    minPerUnit: 3,
    label: "Chapter 00: Kana",
  }),
  promptBlock: `## Japanese

- **Which form is the card.** When the book prints a word in kana AND in kanji (a vocabulary table
  with a kana column and a kanji column), \`target\` is the kanji spelling and \`reading\` is the
  kana: \`映画\` with reading \`えいが\`. A word the book prints only in kana is carded as printed,
  with no \`reading\`: \`スポーツ\`, \`おはようございます\`.
- **Every \`target\` containing a kanji carries \`reading\`**, in kana, COPIED from the book: the
  kana column of the vocabulary table, or the reading printed beside an example word. Never work a
  reading out yourself. A kanji's reading depends on the word it sits in, and a guessed reading is
  exactly the error this field exists to prevent. A kanji word the book prints with no reading
  anywhere in the chapter is left out.
- **Kanji cards.** A kanji the chapter teaches AS A CHARACTER (an entry in a kanji table, with its
  meaning and readings) is its own item: \`target\` is the single kanji, \`english\` is the meanings
  the book gives ("Day; sun"), and there is NO \`reading\`. That card has no audio, because a kanji
  alone has no one pronunciation. Only kanji the chapter teaches as characters: never a kanji just
  because it appears inside a word.
- **The example words a kanji table lists** are word items like any other, each with the reading
  the table prints.
- **A single kanji the book also teaches as a word in its own right** (日 read ひ, "day") is ONE
  item: the word, with its \`reading\`, and it has audio.
- **A single hiragana or katakana is a card only when the book teaches it as a word** with its own
  meaning (に "Two", ご "Five"), as \`kind: "word"\`. Never a kana taught as a letter of the syllabary.`,
});

const SCHEMES = Object.freeze({ ja: JAPANESE });

/** The reading scheme for a target language, or `null` for a language without one. */
export function readingScheme(targetLanguage) {
  return SCHEMES[resolveIso639Code(targetLanguage)] ?? null;
}

/** The language block a reading prompt carries (`{{READING_LANGUAGE_RULES}}`). */
export function readingLanguageBlock(targetLanguage) {
  const scheme = readingScheme(targetLanguage);
  if (scheme) return scheme.promptBlock;
  return [
    "## This language",
    "",
    "Card words and set phrases only. There are no character cards in this language's reading deck,",
    "and no separate reading: the audio is spoken from `target` as written.",
  ].join("\n");
}

const cardReading = (card) => card?.ttsText || card?.reading || "";

/**
 * Whether a card has no audio BY DESIGN: a reading card whose target is one character the scheme
 * cards as a character, carrying no reading. A single kanji that the book also teaches as a word
 * carries the word's reading, so it is a word card and is voiced.
 */
export function isSilentReadingCard(card, scheme) {
  if (!scheme?.characterCards) return false;
  return scheme.isCharacterTarget(card?.target) && !cardReading(card);
}

/**
 * The `isSilent` predicate for a collection (assertEveryCardHasAudio, the audio stage): nothing is
 * silent in a speaking collection, or in a reading collection whose language has no scheme.
 */
export function silentCardPredicate({ targetLanguage, deckKind }) {
  if (!isReadingKind(deckKind)) return () => false;
  const scheme = readingScheme(targetLanguage);
  if (!scheme) return () => false;
  return (card) => isSilentReadingCard(card, scheme);
}

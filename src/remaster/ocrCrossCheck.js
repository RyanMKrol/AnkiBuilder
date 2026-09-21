import { ocrLinesTopDown, marginLines } from "./visionOcr.js";

// Two independent readings of one page, compared character by character.
//
// Claude's transcript has the structure (ruby, tables, reading order) and Vision's OCR has
// reliable characters and no structure, so the comparison ignores order and layout entirely: it
// counts each Japanese character and each Latin word on both sides and reports what one reader
// saw that the other did not. A page where they agree is very unlikely to have a dropped line or
// an invented word. A page where they disagree gets a person's eyes, or a second transcription.
//
// Order-free counting is deliberate. OCR interleaves columns and detaches furigana from its word,
// so any order-sensitive diff would flag every page with a table on it.

// Glyphs the OCR confuses with each other, folded to one before counting, so a look-alike
// substitution (katakana ロ read as kanji 口, small ゃ read as や) is not reported as a
// disagreement about content. Each string is one class; its first character stands for all.
const LOOKALIKE_CLASSES = [
  // The long-vowel mark and the kanji for "one" are one stroke either way. Hyphens and dashes are
  // NOT in this class: folding them in counted "283-9547" and "Work—" as Japanese characters.
  "ー一",
  "ロ口",
  "エ工",
  "カ力",
  "タ夕",
  "ト卜",
  "ニ二",
  "ハ八",
  "へヘ",
  "べベ",
  "ぺペ",
  "りリ",
  "〜~～",
  "・･",
];
const SMALL_KANA = "ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ";
const LARGE_KANA = "あいうえおつやゆよわアイウエオツヤユヨワカケ";

const FOLD = new Map();
for (const group of LOOKALIKE_CLASSES) {
  for (const ch of group) FOLD.set(ch, group[0]);
}
for (let i = 0; i < SMALL_KANA.length; i++) FOLD.set(SMALL_KANA[i], LARGE_KANA[i]);

// Kana and kanji only. Punctuation is left out: Genki's vocabulary page has a dotted border the
// OCR reads as seventeen ・, and 〜 and ＊ carry no content either reader could get wrong.
const JAPANESE = /[\u3041-\u3096\u30a1-\u30fa\u30fc\u3400-\u4dbf\u4e00-\u9fff]/u;

function count(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Counts of folded Japanese characters and lower-cased Latin words in a piece of text. */
export function tally(text) {
  const japanese = new Map();
  const latin = new Map();
  for (const ch of text.normalize("NFKC")) {
    const folded = FOLD.get(ch) ?? ch;
    if (JAPANESE.test(folded) || folded === "ー") count(japanese, folded);
  }
  for (const word of text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[a-z]{2,}/g) ?? []) {
    count(latin, word);
  }
  return { japanese, latin };
}

function difference(a, b) {
  const out = [];
  for (const [key, n] of a) {
    const extra = n - (b.get(key) ?? 0);
    if (extra > 0) out.push([key, extra]);
  }
  return out.sort((x, y) => y[1] - x[1]);
}

function total(map) {
  let n = 0;
  for (const v of map.values()) n += v;
  return n;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * The transcript split into its printed-size text and its furigana. They are compared
 * differently: the OCR reads printed-size text reliably but misses much of the furigana (small
 * print), so furigana the OCR did not see is expected, while printed text it did not see is not.
 */
export function transcriptParts(body) {
  const readings = [...body.matchAll(/<rt>([\s\S]*?)<\/rt>/g)].map((m) => stripTags(m[1]));
  const withoutReadings = body.replace(/<rt>[\s\S]*?<\/rt>/g, " ");
  const captions = [...withoutReadings.matchAll(/<figcaption>([\s\S]*?)<\/figcaption>/g)];
  return {
    base: stripTags(withoutReadings.replace(/<figcaption>[\s\S]*?<\/figcaption>/g, " ")),
    readings: readings.join(" "),
    captions: captions.map((m) => stripTags(m[1])).join(" "),
  };
}

/**
 * OCR text minus the page's running header, page number and side tab, which the transcript
 * deliberately leaves out of its body.
 */
export function ocrBodyText(ocr) {
  const margins = new Set(marginLines(ocr));
  return ocrLinesTopDown(ocr)
    .filter((line) => !margins.has(line))
    .map((line) => line.text)
    .join("\n");
}

// A page is flagged when the readers disagree on more than FLAG_SHARE of what the OCR read AND on
// at least FLAG_ABSOLUTE characters (or words). Both conditions, because a sparse page can
// disagree on 30% by one misread name, and a dense page's noise alone reaches a dozen characters.
//
// Calibrated on Genki Lesson 1 (20 pages, 2026-09-21), where every page was also read by eye.
// The OCR is the weaker reader of the two on this book: it misreads katakana crowded by furigana
// (アメリカ as エイタ), splits letter-spaced headings, and turns subscripts into letters. So the
// bar is set to catch a dropped table row or sentence, not a single glyph.
const FLAG_SHARE = 0.1;
const FLAG_ABSOLUTE = 10;
// English words are noisier still: the OCR splits letter-spaced headings ("le dial" for "Lesson
// Dialogue") and misreads romanization ("mearli"), which put two correct pages at 16-18%.
const FLAG_WORD_SHARE = 0.25;

/**
 * Two directions, each against the right baseline:
 *
 *   onlyInOcr         the OCR saw it and the transcript has it nowhere, not even as furigana.
 *                     A dropped line or word looks like this.
 *   onlyInTranscript  printed-size transcript text the OCR never saw. An invented word looks
 *                     like this. Furigana is left out of this side on purpose (see
 *                     transcriptParts); how much of it the OCR missed is reported, not flagged.
 *                     So are illustration captions: "[Illustration: a clock showing half past
 *                     one]" is the model's description, not the book's text, and on a page of 22
 *                     clocks it outweighed everything else. They still count on the other side,
 *                     because words printed inside a picture are ones the OCR can read.
 */
export function crossCheckPage({ body, ocr }) {
  const parts = transcriptParts(body);
  const base = tally(parts.base);
  const withReadings = tally(`${parts.base} ${parts.readings} ${parts.captions}`);
  const vision = tally(ocrBodyText(ocr));
  const onlyInOcr = difference(vision.japanese, withReadings.japanese);
  const onlyInTranscript = difference(base.japanese, vision.japanese);
  const readingChars = total(tally(parts.readings).japanese);
  const wordsOnlyInOcr = difference(vision.latin, withReadings.latin);
  const wordsOnlyInTranscript = difference(base.latin, vision.latin);

  const ocrChars = total(vision.japanese);
  const disagreeing =
    onlyInOcr.reduce((s, [, n]) => s + n, 0) + onlyInTranscript.reduce((s, [, n]) => s + n, 0);
  const disagreeingWords =
    wordsOnlyInOcr.reduce((s, [, n]) => s + n, 0) +
    wordsOnlyInTranscript.reduce((s, [, n]) => s + n, 0);
  const share = ocrChars ? disagreeing / ocrChars : disagreeing ? 1 : 0;
  const ocrWords = total(vision.latin);
  const wordShare = ocrWords ? disagreeingWords / ocrWords : disagreeingWords ? 1 : 0;
  const flagged =
    (disagreeing >= FLAG_ABSOLUTE && share > FLAG_SHARE) ||
    (disagreeingWords >= FLAG_ABSOLUTE && wordShare > FLAG_WORD_SHARE);

  return {
    ocrJapaneseChars: ocrChars,
    transcriptJapaneseChars: total(base.japanese),
    furiganaChars: readingChars,
    disagreeingChars: disagreeing,
    disagreeingWords,
    share: Number(share.toFixed(4)),
    wordShare: Number(wordShare.toFixed(4)),
    flagged,
    onlyInOcr: onlyInOcr.map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(" "),
    onlyInTranscript: onlyInTranscript.map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(" "),
    wordsOnlyInOcr: wordsOnlyInOcr.map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(" "),
    wordsOnlyInTranscript: wordsOnlyInTranscript
      .map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
      .join(" "),
  };
}

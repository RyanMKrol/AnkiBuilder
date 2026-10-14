import { posix } from "path";

// Pictures of words inside running text.
//
// Some publishers' EPUBs print every kanji word that carries a reading as a small picture (the
// kanji with its furigana underneath) dropped into the middle of a line of kana. Japanese for Busy
// People Book 2 (4th edition, 2025) has about 2,800 distinct ones; the Revised 3rd edition has
// 1,794. Their alt text is blank or an internal id ("jap421"), so to every text reader, the deck
// pipeline included, the word is simply missing: 食べもの (tabemono, food) reads as "べもの".
//
// This finds them without opening a single image: an <img> inside a text block (a paragraph, a
// table cell, a list item, a heading) that is also Japanese, either because the block has Japanese
// text around the picture or because the picture sits inside a lang="ja" element. Decorative inline
// pictures (bullets, boxed numerals) match too; there are only a handful of distinct ones in an
// ordinary book, so the eligibility check counts DISTINCT images and the transcriber
// (src/glyphs/) asks the model whether each one is a word at all.

const BLOCK_PATTERN = /<(p|td|th|li|dt|dd|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
const IMG_PATTERN = /<img\b[^>]*>/gi;
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;
const JA_LANG = /\b(?:xml:)?lang\s*=\s*["']ja\b/i;

function attr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[1] ?? match[2]) : null;
}

function textOf(html) {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Every inline picture in Japanese text in one XHTML file, in document order: `{ tag, src,
 * archivePath, alt, index, blockStart, blockEnd }`, where `index` is the tag's offset in `content` and `tag` is the exact
 * `<img …>` text (so a caller can replace it). `chapterHref` resolves `src` to its path in the
 * archive. A picture whose alt already holds Japanese is skipped: its text is not lost.
 *
 * `anyText` widens it to a picture in ANY block that has text, Japanese or not. The 4th edition
 * prints a dialogue's speaker as a picture on a line of its own, `<p><img/> :</p>`, with nothing
 * Japanese around it. The eligibility check does not need those (the book's other pictures already
 * give it away), but the transcriber does, and it asks the model which pictures are words.
 */
export function findInlineGlyphImages(content, { chapterHref = "", anyText = false } = {}) {
  const found = [];
  const clean = content.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
  for (const block of clean.matchAll(BLOCK_PATTERN)) {
    const inner = block[2];
    if (!/<img\b/i.test(inner)) continue;
    const japanese = JAPANESE.test(textOf(inner)) || JA_LANG.test(block[0]);
    if (!japanese && !(anyText && textOf(inner).trim())) continue;
    const innerOffset = block.index + block[0].indexOf(inner);
    for (const img of inner.matchAll(IMG_PATTERN)) {
      const src = attr(img[0], "src");
      if (!src || /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith("data:")) continue;
      const alt = attr(img[0], "alt") ?? "";
      if (JAPANESE.test(alt)) continue;
      found.push({
        tag: img[0],
        src,
        archivePath: posix.normalize(posix.join(posix.dirname(chapterHref), src)),
        alt,
        index: innerOffset + img.index,
        // The text block the picture sits in, so a caller can quote its sentence and nothing else.
        blockStart: innerOffset,
        blockEnd: innerOffset + inner.length,
      });
    }
  }
  return found;
}

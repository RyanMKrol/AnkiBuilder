import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { readFileSync } from "fs";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url)); // src/deck/
const FONTS_DIR = resolve(join(MODULE_DIR, "..", "..", "assets", "fonts"));

// Per-language deck font — keyed by the same ISO 639-1 codes `resolveIso639Code`
// (src/model/iso639.js) resolves a cards.json's targetLanguage to. A language listed here has its
// font EMBEDDED into every deck built (or restyled) for it, and the card template renders the
// target text in that font, so it looks the same on every Anki client regardless of what's
// installed. A language absent from this map uses the client's own fonts, as before.
//
// Japanese: Klee One, a Kyōkashō (教科書体, "textbook") face — it keeps the hand-written stroke
// separations (き/さ/り detach, ふ stays apart) that Gothic screen fonts smooth over, so it's the
// right shape for a learner to read AND write. Covers kana and kanji. SIL Open Font License (see
// assets/fonts/KleeOne-OFL.txt), so it's free to ship inside a .apkg.
export const LANGUAGE_FONTS = {
  ja: {
    family: "Klee One",
    file: "KleeOne-Regular.woff2", // under assets/fonts/
    format: "woff2",
    // The name the font is stored under inside a deck's collection.media. The leading underscore
    // marks it as intentionally-kept so Anki's "Check Media" never purges it as unused.
    mediaName: "_KleeOne-Regular.woff2",
    // Scopes the font to the JAPANESE script only (CJK punctuation, hiragana, katakana + phonetic
    // extensions, kanji, and fullwidth/halfwidth forms). With this, a card can list the font first
    // yet it only renders Japanese text — Latin (English mnemonics, romaji, numbers) falls through
    // to the card's own font. Cross-device-safe: the browser applies the embedded font per-glyph
    // strictly within this range.
    unicodeRange: "U+3000-303F, U+3040-30FF, U+31F0-31FF, U+4E00-9FFF, U+FF00-FFEF",
  },
};

/**
 * Returns the font descriptor for `languageCode` (already resolved via resolveIso639Code), or
 * `undefined` if the language has no configured deck font.
 */
export function getLanguageFont(languageCode) {
  return LANGUAGE_FONTS[languageCode];
}

/** Absolute path to the bundled font file for a descriptor. */
export function fontAssetPath(descriptor) {
  return resolve(join(FONTS_DIR, descriptor.file));
}

/** Reads the bundled font file's bytes (for embedding into a deck's media). */
export function readFontBytes(descriptor, { readFile = readFileSync } = {}) {
  return readFile(fontAssetPath(descriptor));
}

/**
 * The `@font-face` rule that registers the font by its family name against the media file the deck
 * embeds it under. Prepend `descriptor.family` to a card's `font-family` to actually use it.
 */
export function fontFaceCss(descriptor) {
  const range = descriptor.unicodeRange ? ` unicode-range: ${descriptor.unicodeRange};` : "";
  return `@font-face { font-family: "${descriptor.family}"; src: url("${descriptor.mediaName}") format("${descriptor.format}");${range} font-display: swap; }`;
}

/**
 * The full CSS block that makes a card use the font for the target script: the (unicode-ranged)
 * `@font-face` plus a `.card` rule listing the font first, then the card's own Latin fallback.
 * Because the `@font-face` is scoped by `unicode-range`, the font only ever renders target-script
 * glyphs; Latin text falls through. Shared by the deck builder and `restyle-font`.
 *
 * The fallback is `arial` — the same stack `.card` already declares in BASE_CSS. It used to be
 * `"Helvetica Neue", Helvetica, Arial, sans-serif`, which meant registering a JAPANESE font also
 * silently changed the face of every Latin string on the card (the romaji, the English, the notes).
 * The font rule's job is the target script; changing the Latin stack was a side effect nobody asked
 * for.
 *
 * Kept on `.card` rather than narrowed to the prompt/answer elements, deliberately. The
 * `unicode-range` already scopes it per glyph, so `.card` costs nothing — and narrowing it would
 * strip the textbook face from the Japanese quoted inside a `note` or a `scene`, which is a
 * regression rather than a fix.
 */
export function languageFontCss(descriptor) {
  return fontFaceCss(descriptor) + `\n.card { font-family: "${descriptor.family}", arial; }`;
}

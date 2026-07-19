// Languages written WITHOUT spaces between words (keyed by ISO 639-1). For these, any spaces in a
// card's `target`/`reading` are editorial — e.g. the JBP kana textbook uses 分かち書き (word-separation)
// as a beginner aid — and are stripped from the STORED display text so the deck renders natural,
// space-free script. This governs the DISPLAYED Japanese (card face, reading, reviews); the audio
// stage strips spaces separately for TTS (see src/audio/ttsText.js).
const SPACE_FREE_LANGUAGES = new Set(["ja"]);

/**
 * Returns `text` with editorial whitespace removed when `languageCode` is a space-free script (e.g.
 * Japanese); otherwise returns `text` unchanged (Spanish, French, … — where spaces are real word
 * boundaries). Strips ASCII whitespace and the fullwidth space (U+3000).
 */
export function stripEditorialSpaces(text, languageCode) {
  if (typeof text !== "string" || !SPACE_FREE_LANGUAGES.has(languageCode)) {
    return text;
  }
  return text.replace(/[\s　]+/g, "");
}

export function isSpaceFreeLanguage(languageCode) {
  return SPACE_FREE_LANGUAGES.has(languageCode);
}

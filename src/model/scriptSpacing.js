// Display-text normalization for languages written WITHOUT spaces between words (keyed by ISO 639-1).
// For these (Japanese today), a card's stored `target`/`reading` is normalized so the deck renders
// natural script:
//   1. Editorial spaces are stripped — e.g. the JBP kana textbook uses 分かち書き (word-separation) as
//      a beginner aid, which isn't part of real written Japanese.
//   2. A trailing sentence-final 。 is stripped — a card never ends in a period by default. This is a
//      deliberate deck-style choice: the terminal 。 measurably changes ElevenLabs' prosody, so the
//      DEFAULT audio is generated from the dot-less text and the WITH-dot take is always produced as
//      the alt (src/audio/altAudio.js appends 。). A mid-string 。 (two sentences) is left intact.
// This governs the DISPLAYED Japanese (card face, reading, reviews); the audio stage also strips
// spaces for TTS separately (see src/audio/ttsText.js).
const SPACE_FREE_LANGUAGES = new Set(["ja"]);

/**
 * Returns `text` normalized for display when `languageCode` is a space-free script (Japanese) —
 * editorial whitespace removed and a trailing 。 stripped; otherwise `text` unchanged (Spanish,
 * French, … — where spaces are real word boundaries and terminal punctuation is kept).
 */
export function normalizeDisplayText(text, languageCode) {
  if (typeof text !== "string" || !SPACE_FREE_LANGUAGES.has(languageCode)) {
    return text;
  }
  return text.replace(/[\s\u3000]+/g, "").replace(/。+$/, "");
}

export function isSpaceFreeLanguage(languageCode) {
  return SPACE_FREE_LANGUAGES.has(languageCode);
}

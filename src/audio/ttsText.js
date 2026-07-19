// Per-language normalization of the text actually sent to TTS (the "spoken text"), keyed by ISO
// 639-1 code — mirrors voiceLibrary.js / altAudio.js.
//
// Japanese (and other space-free scripts) are written without spaces. Any spaces in a card's
// `target`/`reading` are editorial — we add them so a learner can parse the phrase — but ElevenLabs
// renders each space as an audible PAUSE, which shows up as odd gaps mid-clip (empirically confirmed:
// これは␣フランスの␣ワインです。 has a clear pause on each space, and the spaced clip is ~20-25%
// longer than the unspaced one). So for these languages we strip whitespace from the text before it
// reaches TTS, while `target`/`reading` keep their spaces for display.
export const TTS_TEXT_TRANSFORMS = {
  // Strip every run of whitespace — ASCII space, tab, newline, and the fullwidth space (U+3000).
  ja: (text) => text.replace(/[\s　]+/g, ""),
};

/**
 * Returns `text` normalized for TTS in `languageCode`, or `text` unchanged when the language has no
 * transform (the default — e.g. Spanish, where spaces are real word boundaries and must be kept).
 */
export function normalizeTtsText(text, languageCode) {
  const transform = TTS_TEXT_TRANSFORMS[languageCode];
  return transform ? transform(text) : text;
}

export function getTtsTextTransform(languageCode) {
  return TTS_TEXT_TRANSFORMS[languageCode];
}

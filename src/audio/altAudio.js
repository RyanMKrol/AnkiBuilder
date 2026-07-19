// Per-language "alt audio" transform — keyed by the same ISO 639-1 codes
// `resolveIso639Code` (src/model/iso639.js) resolves a cards.json's targetLanguage to.
//
// A language listed here gets TWO recordings per card in the audio stage. For such a language the
// transformed text is the DEFAULT recording and the text unmodified is the ALT — the transform is
// the preferred take, and the plain text is offered as the fallback you can switch a card to. (This
// is the reverse of the original wiring: the 。 take proved the better default for Japanese, so it
// became the default rather than an opt-in alt.) Both are generated and offered in the audio review,
// where a card can be switched to its alt or have its audio dropped. A language absent from this map
// has no alt audio and behaves exactly as before (one recording per card, the plain text).
//
// Japanese: a trailing 。 (full stop) gives ElevenLabs a sentence boundary to anchor on, which
// empirically fixes many mis-rendered short/bare clips (lone kana like はん/ふん, some numbers) — so
// the with-。 take is the default and the plain (no-。) take is the alt. The displayed target/reading
// never carries a 。; the dot is audio-only.
export const ALT_AUDIO_TRANSFORMS = {
  ja: (text) => `${text}。`,
};

/**
 * Returns the alt-audio text transform for `languageCode` (already resolved via
 * resolveIso639Code), or `undefined` if the language has no alt audio configured.
 */
export function getAltAudioTransform(languageCode) {
  return ALT_AUDIO_TRANSFORMS[languageCode];
}

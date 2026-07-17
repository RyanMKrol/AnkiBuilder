// Per-language "alt audio" transform — keyed by the same ISO 639-1 codes
// `resolveIso639Code` (src/model/iso639.js) resolves a cards.json's targetLanguage to.
//
// A language listed here gets a SECOND recording per card in the audio stage: the spoken
// text run through its transform. The default recording is the text unmodified; the alt is
// the transformed text. Both are generated and offered in the audio review, where a card can
// be switched to its alt or have its audio dropped. A language absent from this map has no
// alt audio and behaves exactly as before (one recording per card).
//
// Japanese: a trailing 。 (full stop) gives ElevenLabs a sentence boundary to anchor on, which
// empirically fixes many mis-rendered short/bare clips (lone kana like はん/ふん, some numbers).
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

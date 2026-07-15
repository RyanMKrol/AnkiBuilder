// Per-language default ElevenLabs voice — keyed by the same ISO 639-1 codes
// `resolveIso639Code` (src/model/iso639.js) resolves a cards.json's targetLanguage to. Lets
// `audio --run <dir>` omit `--voice` once a language has been used before, instead of asking
// every time. `--voice` always overrides this when given explicitly.
export const DEFAULT_VOICES = {
  ja: "3JDquces8E8bkmvbh6Bc",
};

/**
 * Returns the configured default voiceId for `languageCode` (already resolved via
 * resolveIso639Code), or `undefined` if no default is configured for it.
 */
export function getDefaultVoice(languageCode) {
  return DEFAULT_VOICES[languageCode];
}

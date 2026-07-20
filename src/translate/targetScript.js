// Per-language "simplified target script" rules — for a beginner who hasn't learned a language's full
// writing system yet and wants the card face in its simpler/learner script. This is the language
// plug-in layer (same pattern as voiceLibrary / altAudio / romanizationLibraries / fontLibrary): the
// translate core stays script-agnostic and just injects whatever instruction string this returns for
// the target language when the `--simple-script` option is on. A language with no entry → no-op.
//
// Add support for a language by adding an entry keyed by its ISO 639-1 code. Nothing Japanese-specific
// lives in the translate core — only here.
export const SIMPLE_SCRIPT_RULES = {
  // Japanese: force the target into kana (no kanji), so a beginner kana deck's card face never shows
  // kanji the learner can't read yet.
  ja:
    "Write `target` entirely in Japanese kana — hiragana for native words and grammar, katakana for " +
    "loanwords — with NO kanji at all (this is a beginner kana deck). " +
    "E.g. wallet → さいふ (never 財布), work → しごと (never 仕事), smartphone → スマホ.",
};

// The simplified-target-script instruction for a language, or null if it has none configured.
export function getSimpleScriptRule(languageCode) {
  return SIMPLE_SCRIPT_RULES[languageCode] ?? null;
}

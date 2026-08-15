// Per-language PROMPT-RULE fragments — the language plug-in layer for prompt text, same
// pattern as targetScript.js / voiceLibrary / romanizationLibraries / fontLibrary: each
// core prompt stays language-neutral and injects whatever fragment this module returns
// for the target language. A language with no entry gets an empty fragment and the
// prompt renders without that section — never Japanese prose leaking into a Spanish run.
//
// Add support for a language by adding an entry keyed by its ISO 639-1 code.

import { romanizationStyleRules } from "./romajiStyle.js";

export const LANGUAGE_PROMPT_RULES = {
  ja: {
    // Register/orthography guidance for MODEL-AUTHORED translations (the dictated-lesson and
    // template paths, where every target is generated fresh). Without this the output drifted
    // between です／ます and plain form across lessons of one textbook-aligned deck.
    translationStyle: [
      "Default to the polite です／ます register for verbs and copulas — this is a beginner deck " +
        "aligned with a polite-form textbook. Use plain/casual form only when the English is " +
        'explicitly casual ("hey", slang) or a hint asks for it, and never mix registers within ' +
        "one sentence.",
      "Prefer the phrasing a Japanese textbook teaches a beginner over a maximally colloquial " +
        "native rendering: keep the particles the sentence's grammar calls for (は, を, に, で) " +
        "rather than dropping them conversationally.",
    ],
    // The pinned romanization spec — modified Hepburn as this deck writes it — taken WHOLE from
    // src/translate/romajiStyle.js, which is also what scripts/preflight.mjs lints against. Every
    // prompt that produces a `pronunciation` gets this same list, so the four passes cannot describe
    // the style in four slightly different ways again.
    romanizationStyle: romanizationStyleRules("ja"),
    // The number-reading pass gets the whole spec plus what is specific to a spelled-out number.
    // Composed from the same array rather than restating any of it: the two lists disagreed once
    // already, on whether jūninichi was correct or forbidden.
    numberReadingStyle: [
      ...romanizationStyleRules("ja"),
      "A long number breaks at its thousand / ten-thousand groups, with the counter hyphenated " +
        "to the final group: `ichiman sanzen-en`, `nisen nijūgo-nen`.",
      "Everything that is not part of the number keeps the spacing it already has.",
    ],
    // Concrete irregular-counter examples (number-reading rule 2, fill-in-the-blank rule 9).
    counterExamples:
      "In Japanese: April is しがつ, never よんがつ; July is しちがつ; 9 o'clock is くじ, not " +
      "きゅうじ; 1 minute is いっぷん.",
  },
};

/** The prompt-rule fragments for a language, or `{}` when it has none configured. */
export function getLanguagePromptRules(languageCode) {
  return LANGUAGE_PROMPT_RULES[languageCode] ?? {};
}

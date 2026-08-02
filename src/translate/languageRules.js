// Per-language PROMPT-RULE fragments — the language plug-in layer for prompt text, same
// pattern as targetScript.js / voiceLibrary / romanizationLibraries / fontLibrary: each
// core prompt stays language-neutral and injects whatever fragment this module returns
// for the target language. A language with no entry gets an empty fragment and the
// prompt renders without that section — never Japanese prose leaking into a Spanish run.
//
// Add support for a language by adding an entry keyed by its ISO 639-1 code.

// One counter-hyphenation convention, shared verbatim by the number-reading and
// fill-in-the-blank fragments so the two passes cannot drift apart again (they once
// disagreed on whether jūninichi was correct or forbidden).
const JA_COUNTER_HYPHEN_RULE =
  "A number and its counter are joined by a HYPHEN: `jūni-nichi`, `shi-gatsu`, `go-ji`, " +
  "`nijūgo-nen`, `ip-pon`, `san-gai`. Never fuse them into one token — `jūninichi` reads as if " +
  'it contains an "ichi" that is not there. An ordinary word that merely looks like a counter ' +
  'keeps its spelling: にほん "Japan" is `nihon`, not `ni-hon`.';

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
    // The deck's romanization style for spelled-out numbers (number-reading pass, rule 3).
    numberReadingStyle: [
      "Long vowels take macrons: `jūji`, `tōkyō`, `nijūgo`.",
      "ん before a vowel takes an apostrophe: `sanzen'en`.",
      JA_COUNTER_HYPHEN_RULE + " (Same convention as the practice-card pass.)",
      "A long number breaks at its thousand / ten-thousand groups, with the counter hyphenated " +
        "to the final group: `ichiman sanzen-en`, `nisen nijūgo-nen`.",
      "Everything that is not part of the number keeps the spacing it already has.",
    ],
    // Concrete irregular-counter examples (number-reading rule 2, fill-in-the-blank rule 9).
    counterExamples:
      "In Japanese: April is しがつ, never よんがつ; July is しちがつ; 9 o'clock is くじ, not " +
      "きゅうじ; 1 minute is いっぷん.",
    counterHyphenRule: JA_COUNTER_HYPHEN_RULE,
  },
};

/** The prompt-rule fragments for a language, or `{}` when it has none configured. */
export function getLanguagePromptRules(languageCode) {
  return LANGUAGE_PROMPT_RULES[languageCode] ?? {};
}

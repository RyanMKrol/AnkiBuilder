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
    // `romanizationStyle` (the romanization-correction prompt's {{ROMANIZATION_STYLE_RULES}}) has no
    // entry yet, deliberately. It is the single place a pinned Hepburn spec belongs: the deck's
    // romanization drifts per batch today (trailing periods 100% in some units and 0% in others,
    // -san hyphenated 32/32 in one unit and spaced 40/40 in the next), and the fix is one style
    // constant fed to every prompt that romanizes, not four prompts each describing the style again.
    // Add it here and all four inherit it.
    //
    // Concrete irregular-counter examples (number-reading rule 2, fill-in-the-blank rule 9).
    counterExamples:
      "In Japanese: April is しがつ, never よんがつ; July is しちがつ; 9 o'clock is くじ, not " +
      "きゅうじ; 1 minute is いっぷん.",
    counterHyphenRule: JA_COUNTER_HYPHEN_RULE,
    // The romanization-correction prompt's language-specific parts. These used to be written into
    // the core template, so a Hindi or Arabic run was shown two Japanese exemplars (ろっかい,
    // こんにちは) and told about the small っ. Few-shot examples dominate a short instruction, so the
    // model was anchored on the wrong task entirely.
    romanizationSystem: "Hepburn",
    libraryFailureModes: [
      "it mis-splits a single word into pieces with spurious spaces",
      'it mishandles the small っ (sokuon), emitting a literal "tsu" instead of doubling the ' +
        "following consonant",
      "it falls back to spelling unfamiliar kana out letter by letter",
    ],
    romanizationExamples: [
      {
        id: "sixth-floor",
        english: "Sixth floor",
        target: "ろっかい",
        libraryRomanization: "ro tsu kai",
        pronunciation: "rokkai",
      },
      {
        id: "hello",
        english: "Hello",
        target: "こんにちは",
        libraryRomanization: "konnichiwa",
        pronunciation: "konnichiwa",
      },
    ],
  },

  // The other two library-proven languages. No `libraryFailureModes`: pinyin-pro and koroman are
  // accurate on everything measured here (你好 → `nǐ hǎo`, 中国 → `zhōng guó`, 안녕하세요 →
  // `annyeonghaseyo`), so the prompt renders the neutral "a starting point, not an answer" line
  // rather than inventing faults for them. The examples are here so a Mandarin or Korean run is
  // shown its OWN script instead of kana.
  zh: {
    romanizationSystem: "Hanyu Pinyin with tone marks",
    romanizationStyle: [
      "Group syllables into WORDS, as pinyin orthography does: 中国 is `Zhōngguó`, not `zhōng guó`; " +
        "谢谢 is `xièxie`. The library emits one syllable per token.",
    ],
    romanizationExamples: [
      {
        id: "china",
        english: "China",
        target: "中国",
        libraryRomanization: "zhōng guó",
        pronunciation: "Zhōngguó",
      },
      {
        id: "hello",
        english: "Hello",
        target: "你好",
        libraryRomanization: "nǐ hǎo",
        pronunciation: "nǐ hǎo",
      },
    ],
  },
  ko: {
    romanizationSystem: "Revised Romanization of Korean",
    romanizationExamples: [
      {
        id: "hello",
        english: "Hello",
        target: "안녕하세요",
        libraryRomanization: "annyeonghaseyo",
        pronunciation: "annyeonghaseyo",
      },
      {
        id: "thank-you",
        english: "Thank you",
        target: "감사합니다",
        libraryRomanization: "gamsahamnida",
        pronunciation: "gamsahamnida",
      },
    ],
  },
  ru: {
    romanizationSystem: "a readable transliteration of Cyrillic",
    romanizationExamples: [
      {
        id: "hello",
        english: "Hello",
        target: "привет",
        libraryRomanization: "privet",
        pronunciation: "privet",
      },
      {
        id: "moscow",
        english: "Moscow",
        target: "Москва",
        libraryRomanization: "Moskva",
        pronunciation: "Moskva",
      },
    ],
  },

  // ── Languages whose romanization library is NOT trustworthy ────────────────────────────────────
  //
  // Only ja / zh / ko have ever been run end to end. The rest were wired in on the strength of the
  // library existing, and measured output is unusable — see the entries below and the LIMITATIONS
  // row "Only ja / zh / ko have a proven romanization path". These fragments exist so the model is
  // told what it is actually being handed instead of being shown Japanese and left to guess.

  hi: {
    romanizationSystem: "IAST-style Devanagari romanization, adjusted for spoken Hindi",
    // Measured: कमल → "kamala", सड़क → "saḍa़ka", पानी → "pānī".
    libraryFailureModes: [
      "it transliterates with the Sanskrit convention that every inherent schwa is pronounced, so " +
        "it writes a trailing (and often medial) `a` that spoken Hindi deletes: कमल comes back as " +
        "`kamala` where the word is `kamal`",
      "it can leak a raw combining nukta (U+093C) straight into the output instead of romanizing " +
        "the letter it modifies: सड़क comes back as `saḍa़ka` where the word is `saṛak`",
    ],
    romanizationStyle: [
      "Apply Hindi SCHWA DELETION: the inherent `a` is dropped word-finally, and medially where " +
        "spoken Hindi drops it. कमल is `kamal`, not `kamala`; नमस्ते is `namaste` (the final `e` " +
        "is a real vowel, not a schwa).",
      "Romanize a nukta-bearing letter as the sound it makes and never emit the combining mark " +
        "itself: ड़ is `ṛ`, ज़ is `z`, फ़ is `f`, ख़ is `x`/`kh`. सड़क is `saṛak`.",
      "Long vowels keep their macrons (पानी → `pānī`); retroflex and dental consonants keep their " +
        "diacritics.",
    ],
    romanizationExamples: [
      {
        id: "lotus",
        english: "Lotus",
        target: "कमल",
        libraryRomanization: "kamala",
        pronunciation: "kamal",
      },
      {
        id: "road",
        english: "Road",
        target: "सड़क",
        libraryRomanization: "saḍa़ka",
        pronunciation: "saṛak",
      },
    ],
  },

  ar: {
    romanizationSystem: "IJMES",
    romanizationStyle: [
      "Arabic script does not write short vowels, and unvocalized text gives you no way to read " +
        "them off the page — SUPPLY THE FULL VOCALIZATION from your own knowledge of the word. " +
        "كتاب is `kitāb`, not `ktab`; مدرسة is `madrasa`, not `mdrsa`; بيت is `bayt`, not `byt`. " +
        "A consonant skeleton is not a pronunciation guide: it tells a learner nothing they could " +
        "say out loud.",
      "Render tā' marbūṭa as a final `a` (مدرسة → `madrasa`), and the definite article as `al-` " +
        "assimilated to a following sun letter where the pronunciation assimilates (`ash-shams`).",
    ],
    romanizationExamples: [
      { id: "book", english: "Book", target: "كتاب", pronunciation: "kitāb" },
      { id: "school", english: "School", target: "مدرسة", pronunciation: "madrasa" },
    ],
  },

  he: {
    romanizationSystem: "a readable general-purpose transliteration",
    romanizationStyle: [
      "Hebrew without niqqud does not write its vowels — SUPPLY THE FULL VOCALIZATION from your " +
        "own knowledge of the word. ספר is `sefer`, not `spr`; שלום is `shalom`, not `šlwm`; " +
        "בית ספר is `beit sefer`. A consonant skeleton is not a pronunciation guide.",
      "Read a mater lectionis as the vowel it marks rather than as a consonant: the ו in שלום is " +
        "the `o` of `shalom`, not a `w`.",
      "Prefer the spelling a learner can pronounce (`sh`, `ch`, `tz`) over scholarly diacritics " +
        "(`š`, `ḥ`, `ṣ`).",
    ],
    romanizationExamples: [
      { id: "book", english: "Book", target: "ספר", pronunciation: "sefer" },
      { id: "peace", english: "Hello / peace", target: "שלום", pronunciation: "shalom" },
    ],
  },
};

/**
 * The neutral few-shot pair, for a language with no entry of its own.
 *
 * Deliberately not in any script. Showing a Spanish run two Japanese cards teaches it the SHAPE of
 * the answer and, much more strongly, that the task is about kana — and a few-shot example beats a
 * one-line instruction every time. An abstract pair teaches only the shape.
 */
const NEUTRAL_ROMANIZATION_EXAMPLES = [
  {
    id: "example-1",
    english: "the English gloss",
    target: "<the target-language text>",
    libraryRomanization: "<the library's attempt, often wrong>",
    pronunciation: "<the correct romanization>",
  },
];

/** The few-shot pair to show for a language: its own if it has one, else the neutral shape. */
export function romanizationExamples(languageCode) {
  return getLanguagePromptRules(languageCode).romanizationExamples ?? NEUTRAL_ROMANIZATION_EXAMPLES;
}

/** The prompt-rule fragments for a language, or `{}` when it has none configured. */
export function getLanguagePromptRules(languageCode) {
  return LANGUAGE_PROMPT_RULES[languageCode] ?? {};
}

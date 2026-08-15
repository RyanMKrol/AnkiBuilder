// Per-language registry of real, deterministic romanization libraries — keyed by the same
// ISO 639-1 codes `resolveIso639Code` (src/model/iso639.js) resolves a corpus's targetLanguage
// to. `load` is always a dynamic import() thunk (never a static top-level import here or in any
// adapter) so a run in a language with no configured library — or a different configured
// language — never pays the cost of loading one it doesn't need, most notably the Japanese
// adapter's ~40MB kuromoji dictionary. Each adapter module exports a single uniform
// `async romanize(targetText) => string`, so callers never branch on which library backs a
// given language — see romanizationEval.js for how this plugs into translation.
//
// ⚠️ A LIBRARY HERE IS A CLAIM THAT ITS OUTPUT IS WORTH SHOWING THE MODEL. The prompt hands the
// library's value over as "a useful starting point" and tells the model to keep it when it is
// already right, so a library that is systematically wrong does not merely fail to help — it
// anchors. Arabic and Hebrew were wired in on the strength of the package existing and have been
// REMOVED for exactly that reason (see below). Only ja / zh / ko have been run end to end.
export const ROMANIZATION_LIBRARIES = {
  ja: {
    load: () => import("./romanization/ja.js"),
    library: "kuroshiro + kuroshiro-analyzer-kuromoji",
  },
  zh: { load: () => import("./romanization/zh.js"), library: "pinyin-pro" },
  ko: { load: () => import("./romanization/ko.js"), library: "koroman" },
  ru: { load: () => import("./romanization/cyrillic.js"), library: "cyrillic-to-translit-js" },
  // Kept, but the library is only half right and the prompt says so: Sanscript's devanagari→IAST is
  // a SANSKRIT scheme, where every inherent schwa is pronounced. Hindi deletes it, so कमल comes back
  // as `kamala` for a word that is `kamal`, and a nukta can leak through raw (सड़क → `saḍa़ka`). The
  // vowels are at least all there, which is what separates this from ar/he; the per-language
  // schwa-deletion and nukta rules in languageRules.js are what make the output correctable.
  hi: {
    load: () => import("./romanization/indic.js"),
    library: "@indic-transliteration/sanscript",
  },
  //
  // ── ar and he are DELIBERATELY ABSENT ──────────────────────────────────────────────────────────
  //
  // Both scripts omit short vowels, and neither library restores them, so both return a consonant
  // skeleton. Measured: كتاب → `ktab` (kitāb), مدرسة → `mdrsa` (madrasa), بيت → `byt` (bayt);
  // ספר → `spr` (sefer), שלום → `šlwm` (shalom, with the mater lectionis ו rendered as a consonant
  // `w`). None of those is a pronunciation guide — a learner reading `ktab` cannot say the word.
  //
  // Removing them is not a downgrade: a language with no entry takes the LLM-only pronunciation
  // path, which is what every other language already does and which can supply the vowels. Leaving
  // them in was strictly worse than nothing, because the prompt presents the library's value as a
  // trustworthy starting point and the model was being told to preserve a skeleton.
  //
  // The adapters (./romanization/{ar,he}.js) and their tests stay — they are accurate about what
  // those packages do, and re-wiring is one line here if a vocalizing library ever appears.
};

/**
 * Returns the romanization-library config entry for `languageCode` (already resolved via
 * resolveIso639Code), or `undefined` if no library is configured for it — the caller's signal to
 * fall through to the LLM-only pronunciation path.
 */
export function getRomanizationLibrary(languageCode) {
  return ROMANIZATION_LIBRARIES[languageCode];
}

// Per-language registry of real, deterministic romanization libraries — keyed by the same
// ISO 639-1 codes `resolveIso639Code` (src/model/iso639.js) resolves a corpus's targetLanguage
// to. `load` is always a dynamic import() thunk (never a static top-level import here or in any
// adapter) so a run in a language with no configured library — or a different configured
// language — never pays the cost of loading one it doesn't need, most notably the Japanese
// adapter's ~40MB kuromoji dictionary. Each adapter module exports a single uniform
// `async romanize(targetText) => string`, so callers never branch on which library backs a
// given language — see romanizationEval.js for how this plugs into translation.
export const ROMANIZATION_LIBRARIES = {
  ja: {
    load: () => import("./romanization/ja.js"),
    library: "kuroshiro + kuroshiro-analyzer-kuromoji",
  },
  zh: { load: () => import("./romanization/zh.js"), library: "pinyin-pro" },
  ko: { load: () => import("./romanization/ko.js"), library: "koroman" },
  ru: { load: () => import("./romanization/cyrillic.js"), library: "cyrillic-to-translit-js" },
  he: { load: () => import("./romanization/he.js"), library: "hebrew-transliteration" },
  hi: {
    load: () => import("./romanization/indic.js"),
    library: "@indic-transliteration/sanscript",
  },
  ar: { load: () => import("./romanization/ar.js"), library: "arabic-transliterate" },
};

/**
 * Returns the romanization-library config entry for `languageCode` (already resolved via
 * resolveIso639Code), or `undefined` if no library is configured for it — the caller's signal to
 * fall through to the LLM-only pronunciation path.
 */
export function getRomanizationLibrary(languageCode) {
  return ROMANIZATION_LIBRARIES[languageCode];
}

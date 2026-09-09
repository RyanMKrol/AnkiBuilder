import { runClaudeWithPrompt, runClaudeWithPromptAsync } from "../util/runClaude.js";

/**
 * The translate-family runners — one per pass, not one for the family.
 *
 * Same reasoning as the EPUB family (see src/corpus/epubLlmRunClaude.js): these calls have very
 * different blast radii, so each pass gets its own `ANKI_BUILDER_<PASS>_MODEL` / `_EFFORT` /
 * `_TIMEOUT_MS` triple, with the legacy `ANKI_BUILDER_TRANSLATE_*` pair honored underneath it and
 * `ANKI_BUILDER_LLM_*` under that again. Setting `ANKI_BUILDER_TRANSLATE_MODEL` still moves every
 * pass in this family, exactly as it did before.
 *
 * Every pass injects its runner as `runClaude`, so tests pass a stub and no real binary runs.
 */
const FAMILY_PREFIX = "ANKI_BUILDER_TRANSLATE";
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * The pin for every pass in this family, as data, for the same reason as the EPUB family's table:
 * a pin that lives only as an argument is a pin nothing can check.
 */
export const TRANSLATE_PASS_PINS = Object.freeze({
  FAMILY: { model: "claude-sonnet-5", effort: "medium" },
  ROMANIZATION: { model: "claude-sonnet-5", effort: "medium" },
  CATEGORIZE: { model: "claude-sonnet-5", effort: "medium" },
  DEDUP: { model: "claude-sonnet-5", effort: "medium" },
  NUMBER_READINGS: { model: "claude-sonnet-5", effort: "medium" },
  CROSS_LESSON: { model: "claude-sonnet-5", effort: "medium", timeoutMs: 20 * 60 * 1000 },
  KANJI: { model: "claude-sonnet-5", effort: "medium" },
});

function translateRunner(scope, defaults = {}) {
  const scopeEnvPrefix = scope ? [`ANKI_BUILDER_${scope}`, FAMILY_PREFIX] : [FAMILY_PREFIX];
  return (prompt) =>
    runClaudeWithPrompt(prompt, { scopeEnvPrefix, defaults, maxBuffer: MAX_BUFFER });
}

/**
 * Translation and pronunciation. Its own scope IS the family prefix — this is the pass the family
 * is named after, and giving it a second name would only mean two knobs for one thing.
 */
export const runClaude = translateRunner(null, TRANSLATE_PASS_PINS.FAMILY);

/** Romanization eval: corrects what the offline romanizer produced. */
export const runRomanizationClaude = translateRunner(
  "ROMANIZATION",
  TRANSLATE_PASS_PINS.ROMANIZATION,
);

/** Lesson-word category assignment, for a dictated (--words) lesson. */
export const runCategorizeClaude = translateRunner("CATEGORIZE", TRANSLATE_PASS_PINS.CATEGORIZE);

/** Semantic de-dup of mined practice cards. Excludes cards, so a wrong call costs a card. */
export const runSemanticDedupClaude = translateRunner("DEDUP", TRANSLATE_PASS_PINS.DEDUP);

/** Number readings: spells out numerals left in a card's reading or romaji. */
export const runNumberReadingsClaude = translateRunner(
  "NUMBER_READINGS",
  TRANSLATE_PASS_PINS.NUMBER_READINGS,
);

/**
 * Cross-lesson notes. Reads every earlier lesson of the book, so its prompt is the largest in the
 * pipeline and grows with book progress — 20 minutes rather than 10.
 */
export const runCrossLessonClaude = translateRunner(
  "CROSS_LESSON",
  TRANSLATE_PASS_PINS.CROSS_LESSON,
);

/**
 * Async twin, for server-side callers (the dashboard's single-threaded HTTP handler must never run a
 * blocking model call — see runClaudeWithPromptAsync).
 */
export function runClaudeAsync(prompt) {
  return runClaudeWithPromptAsync(prompt, {
    scopeEnvPrefix: [FAMILY_PREFIX],
    defaults: TRANSLATE_PASS_PINS.FAMILY,
    maxBuffer: MAX_BUFFER,
  });
}

/** Kanji orthography for the Japanese TTS variants — async, because it runs from the dashboard. */
export function runKanjiOrthographyClaude(prompt) {
  return runClaudeWithPromptAsync(prompt, {
    scopeEnvPrefix: ["ANKI_BUILDER_KANJI", FAMILY_PREFIX],
    defaults: TRANSLATE_PASS_PINS.KANJI,
    maxBuffer: MAX_BUFFER,
  });
}

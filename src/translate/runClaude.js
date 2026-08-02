import { runClaudeWithPrompt, runClaudeWithPromptAsync } from "../util/runClaude.js";

/**
 * Default runner for the translate-family passes (translation, romanization eval,
 * semantic de-dup, cross-lesson notes, number readings, kanji orthography). Thin
 * wrapper over the shared core (src/util/runClaude.js — stdin prompt, timeout, one
 * retry); the legacy ANKI_BUILDER_TRANSLATE_MODEL/EFFORT pair still wins over the
 * unified ANKI_BUILDER_LLM_MODEL/EFFORT. Injected as `runClaude` in tests so no
 * real binary runs.
 */
export function runClaude(prompt) {
  return runClaudeWithPrompt(prompt, {
    scopeEnvPrefix: "ANKI_BUILDER_TRANSLATE",
    maxBuffer: 10 * 1024 * 1024,
  });
}

/**
 * Async twin, for server-side callers (the dashboard's single-threaded HTTP handler must
 * never run a blocking model call — see runClaudeWithPromptAsync).
 */
export function runClaudeAsync(prompt) {
  return runClaudeWithPromptAsync(prompt, {
    scopeEnvPrefix: "ANKI_BUILDER_TRANSLATE",
    maxBuffer: 10 * 1024 * 1024,
  });
}

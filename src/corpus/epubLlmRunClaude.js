import { runClaudeWithPrompt } from "../util/runClaude.js";

/**
 * Default runner for the EPUB-family passes (chapter extraction, book conventions,
 * taught index, forward flags, fill-in-the-blank mining, pedagogical sort). The
 * model is expected to use its own Read tool to load the chapter file referenced
 * in the prompt — this is not a plain text-completion call. Thin wrapper over the
 * shared core (src/util/runClaude.js — stdin prompt, timeout, one retry); the
 * legacy ANKI_BUILDER_EPUB_LLM_MODEL/EFFORT pair still wins over the unified
 * ANKI_BUILDER_LLM_MODEL/EFFORT. Injected as `runClaude` in tests so no real
 * binary runs.
 */
export function runClaude(prompt) {
  return runClaudeWithPrompt(prompt, {
    scopeEnvPrefix: "ANKI_BUILDER_EPUB_LLM",
    maxBuffer: 20 * 1024 * 1024,
  });
}

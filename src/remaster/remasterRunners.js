import { runClaudeWithPrompt, runClaudeWithPromptAsync } from "../util/runClaude.js";

// The model pins for the two remaster passes, as data (the same convention as EPUB_PASS_PINS in
// src/corpus/epubLlmRunClaude.js). Each has its own env scope, so either can be overridden with
// ANKI_BUILDER_REMASTER_OUTLINE_MODEL / _EFFORT / _TIMEOUT_MS and the TRANSCRIBE equivalents.
//
// TRANSCRIBE is the pass whose mistakes cost the most: a dropped or invented character becomes a
// card, and nothing downstream sees the page again. High effort buys a second look at small print.
// OUTLINE is one text-only call over the whole book's OCR margins.
export const REMASTER_PASS_PINS = Object.freeze({
  OUTLINE: { model: "claude-sonnet-5", effort: "high", timeoutMs: 15 * 60 * 1000 },
  TRANSCRIBE: { model: "claude-sonnet-5", effort: "high", timeoutMs: 10 * 60 * 1000 },
  // A checking role, so pinned above the pass it checks: it decides between two TRANSCRIBE runs.
  SETTLE: {
    model: "claude-opus-5",
    effort: "high",
    timeoutMs: 10 * 60 * 1000,
    checks: ["TRANSCRIBE"],
  },
});

export const runOutlineClaude = (prompt) =>
  runClaudeWithPrompt(prompt, {
    scopeEnvPrefix: ["ANKI_BUILDER_REMASTER_OUTLINE"],
    defaults: REMASTER_PASS_PINS.OUTLINE,
  });

// Async so several pages can be in flight at once; each is an independent call.
export const runTranscribeClaude = (prompt) =>
  runClaudeWithPromptAsync(prompt, {
    scopeEnvPrefix: ["ANKI_BUILDER_REMASTER_TRANSCRIBE"],
    defaults: REMASTER_PASS_PINS.TRANSCRIBE,
  });

export const runSettleClaude = (prompt) =>
  runClaudeWithPromptAsync(prompt, {
    scopeEnvPrefix: ["ANKI_BUILDER_REMASTER_SETTLE"],
    defaults: REMASTER_PASS_PINS.SETTLE,
  });

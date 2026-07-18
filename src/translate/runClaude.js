import { spawnSync } from "child_process";

// Pinned so translation quality is reproducible instead of inheriting whatever
// the local Claude Code default happens to be. Sonnet at medium effort, matching
// every other LLM pass in this toolset (see ../corpus/epubLlmRunClaude.js) — one
// model/effort across the whole pipeline. Override per run with
// ANKI_BUILDER_TRANSLATE_MODEL / ANKI_BUILDER_TRANSLATE_EFFORT.
const DEFAULT_TRANSLATE_MODEL = "claude-sonnet-5";
const DEFAULT_TRANSLATE_EFFORT = "medium";

/**
 * Default runner: invokes the local `claude -p` CLI with the given prompt and
 * returns its stdout. Injected as `runClaude` in tests so no real binary runs.
 */
export function runClaude(prompt) {
  const model = process.env.ANKI_BUILDER_TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL;
  const effort = process.env.ANKI_BUILDER_TRANSLATE_EFFORT || DEFAULT_TRANSLATE_EFFORT;
  const result = spawnSync("claude", ["-p", prompt, "--model", model, "--effort", effort], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`claude -p exited with status ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}

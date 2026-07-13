import { spawnSync } from "child_process";

// Pinned so translation quality is reproducible instead of inheriting whatever
// the local Claude Code default happens to be. Haiku is the deliberate choice
// here — translation is batched into small chunks (see ../translate/index.js) so
// the cheaper model has little to get wrong per call. Override per run with
// ANKI_BUILDER_TRANSLATE_MODEL (e.g. claude-sonnet-5 / claude-opus-4-8).
const DEFAULT_TRANSLATE_MODEL = "claude-haiku-4-5";

/**
 * Default runner: invokes the local `claude -p` CLI with the given prompt and
 * returns its stdout. Injected as `runClaude` in tests so no real binary runs.
 */
export function runClaude(prompt) {
  const model = process.env.ANKI_BUILDER_TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL;
  const result = spawnSync("claude", ["-p", prompt, "--model", model], {
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

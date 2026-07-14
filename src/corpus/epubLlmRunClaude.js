import { spawnSync } from "child_process";

// Sonnet at medium effort was validated empirically this way: reading a whole
// raw chapter file (no pre-split blocks) and extracting vocabulary/key
// sentences directly. It matched the quality of Sonnet at high effort under
// the older block-splitting pipeline, at lower cost, and reliably caught
// content (e.g. un-glossed vocabulary requiring inferred translations) that
// Haiku missed on a majority of repeated runs. Override with
// ANKI_BUILDER_EPUB_LLM_MODEL / ANKI_BUILDER_EPUB_LLM_EFFORT.
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_EFFORT = "medium";

/**
 * Default runner: invokes the local `claude -p` CLI with the given prompt
 * and returns its stdout. The model is expected to use its own Read tool to
 * load the chapter file referenced in the prompt — this is not a plain
 * text-completion call. Injected as `runClaude` in tests so no real binary
 * runs.
 */
export function runClaude(prompt) {
  const model = process.env.ANKI_BUILDER_EPUB_LLM_MODEL || DEFAULT_MODEL;
  const effort = process.env.ANKI_BUILDER_EPUB_LLM_EFFORT || DEFAULT_EFFORT;

  const result = spawnSync("claude", ["-p", prompt, "--model", model, "--effort", effort], {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`claude -p exited with status ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}

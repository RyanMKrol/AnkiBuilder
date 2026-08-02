import { spawnSync } from "child_process";
import { assertExternalCallAllowed } from "./testEnv.js";

// One core for every `claude -p` call in the pipeline. Sonnet at medium effort was
// validated empirically for both prompt families (see the two wrapper modules'
// histories); one model/effort across the whole pipeline unless overridden.
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_EFFORT = "medium";

// A hung `claude` used to hang the build forever with the run-dir claim held; every
// call now has a hard ceiling. 10 minutes accommodates the slowest legitimate pass
// (a whole-book agentic read); override with ANKI_BUILDER_LLM_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function firstSet(...values) {
  return values.find((value) => value !== undefined && value !== "");
}

/**
 * Invokes the local `claude -p` CLI with the given prompt and returns its stdout.
 *
 * - The prompt rides on STDIN, not argv — several prompts embed whole card sets plus
 *   every earlier lesson's vocabulary and grow with book progress, heading for the OS
 *   ARG_MAX limit when passed as an argument.
 * - Each call has a timeout (default 10 min) and ONE retry on any failure (spawn
 *   error, non-zero exit, timeout), since a transient CLI hiccup shouldn't fail a
 *   whole prepare pass whose siblings all succeeded.
 * - Model/effort resolution, most specific wins: the caller's legacy scope pair
 *   (e.g. ANKI_BUILDER_TRANSLATE_MODEL) → the unified ANKI_BUILDER_LLM_MODEL /
 *   ANKI_BUILDER_LLM_EFFORT → the built-in Sonnet-medium default.
 *
 * `scopeEnvPrefix` names the legacy per-family env pair to honor (e.g.
 * "ANKI_BUILDER_TRANSLATE" or "ANKI_BUILDER_EPUB_LLM"). `spawn` is injectable for
 * tests only.
 */
export function runClaudeWithPrompt(
  prompt,
  { scopeEnvPrefix, maxBuffer = 20 * 1024 * 1024, spawn = spawnSync } = {},
) {
  assertExternalCallAllowed("spawn `claude -p`");

  const env = process.env;
  const model = firstSet(
    scopeEnvPrefix ? env[`${scopeEnvPrefix}_MODEL`] : undefined,
    env.ANKI_BUILDER_LLM_MODEL,
    DEFAULT_MODEL,
  );
  const effort = firstSet(
    scopeEnvPrefix ? env[`${scopeEnvPrefix}_EFFORT`] : undefined,
    env.ANKI_BUILDER_LLM_EFFORT,
    DEFAULT_EFFORT,
  );
  const timeout = Number(env.ANKI_BUILDER_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return invokeOnce(prompt, { model, effort, timeout, maxBuffer, spawn });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function invokeOnce(prompt, { model, effort, timeout, maxBuffer, spawn }) {
  const result = spawn("claude", ["-p", "--model", model, "--effort", effort], {
    input: prompt,
    encoding: "utf-8",
    maxBuffer,
    timeout,
  });

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`claude -p timed out after ${timeout} ms`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`claude -p exited with status ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}

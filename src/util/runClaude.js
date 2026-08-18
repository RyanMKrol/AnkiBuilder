import { spawnSync, spawn } from "child_process";
import { assertExternalCallAllowed } from "./testEnv.js";

// One core for every `claude -p` call in the pipeline. Sonnet at medium effort was
// validated empirically for both prompt families (see the two wrapper modules'
// histories); one model/effort across the whole pipeline unless overridden.
const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_EFFORT = "medium";

// A hung `claude` used to hang the build forever with the run-dir claim held; every
// call now has a hard ceiling. 10 minutes is the floor every pass gets; the slow agentic
// passes raise it for themselves (see `defaults` below and the table in PIPELINE.md).
// Override with <SCOPE>_TIMEOUT_MS or ANKI_BUILDER_LLM_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function firstSet(...values) {
  return values.find((value) => value !== undefined && value !== "");
}

/**
 * Model / effort / timeout for one call, most specific source first.
 *
 * `scopeEnvPrefix` is a list of env prefixes, narrowest first — a pass's OWN scope, then the family
 * scope it belongs to. That ordering is the whole point of the split: one knob used to cover chapter
 * extraction (whose misses are silent and unrecoverable) and the pedagogical sort (mechanically
 * validated, fails open), whose blast radii are not comparable. The family prefixes
 * (ANKI_BUILDER_EPUB_LLM, ANKI_BUILDER_TRANSLATE) stay in the chain, so anyone already setting one
 * keeps the behaviour they had.
 *
 * The TIMEOUT resolves through the same chain, and that is not a convenience. A single ceiling
 * shared with the effort knob turns a quality decision into a hard mid-pass abort with a misleading
 * error: raise a slow agentic pass to `high` under a 10-minute cap and it stops finishing, having
 * spent the money. Timeout travels with the scope it belongs to.
 *
 * Exported because a cached whole-book artifact records the model and effort that produced it
 * (src/corpus/artifactMeta.js), and a record derived from a second copy of this resolution order
 * would drift from the real one.
 */
export function resolvePinning(scopeEnvPrefix, defaults = {}) {
  const env = process.env;
  const prefixes = (Array.isArray(scopeEnvPrefix) ? scopeEnvPrefix : [scopeEnvPrefix]).filter(
    Boolean,
  );
  const scoped = (suffix) => prefixes.map((prefix) => env[`${prefix}_${suffix}`]);

  const model = firstSet(
    ...scoped("MODEL"),
    env.ANKI_BUILDER_LLM_MODEL,
    defaults.model,
    DEFAULT_MODEL,
  );
  const effort = firstSet(
    ...scoped("EFFORT"),
    env.ANKI_BUILDER_LLM_EFFORT,
    defaults.effort,
    DEFAULT_EFFORT,
  );
  const timeoutSetting = firstSet(...scoped("TIMEOUT_MS"), env.ANKI_BUILDER_LLM_TIMEOUT_MS);
  const timeout = Number(timeoutSetting) || Number(defaults.timeoutMs) || DEFAULT_TIMEOUT_MS;

  return { model, effort, timeout };
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
 * - Model/effort/timeout resolution, most specific wins: the pass's own scope
 *   (e.g. ANKI_BUILDER_EXTRACT_MODEL) → its family scope (ANKI_BUILDER_EPUB_LLM_MODEL) →
 *   the unified ANKI_BUILDER_LLM_MODEL → the pass's own built-in default → Sonnet-medium.
 *   See `resolvePinning` and the per-pass table in docs/PIPELINE.md.
 *
 * `scopeEnvPrefix` is the env prefix (or list of prefixes, narrowest first) to honor;
 * `defaults` is that pass's own built-in `{ model, effort, timeoutMs }`. `spawn` is
 * injectable for tests only.
 */
export function runClaudeWithPrompt(
  prompt,
  { scopeEnvPrefix, defaults, maxBuffer = 20 * 1024 * 1024, spawn = spawnSync } = {},
) {
  assertExternalCallAllowed("spawn `claude -p`");

  const { model, effort, timeout } = resolvePinning(scopeEnvPrefix, defaults);

  if (quotaExhausted) throw new QuotaExhaustedError(quotaExhausted);

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return invokeOnce(prompt, { model, effort, timeout, maxBuffer, spawn });
    } catch (error) {
      lastError = error;
      // A quota refusal is not a transient hiccup: do not spend the retry, and do not let the rest
      // of the run spend anything either.
      if (looksLikeQuotaExhaustion(error.message)) {
        quotaExhausted = error.message;
        throw new QuotaExhaustedError(error.message);
      }
    }
  }
  throw lastError;
}

/**
 * The reason a `claude -p` run failed, from wherever the CLI put it.
 *
 * It reports a usage/quota refusal on STDOUT, not stderr, and this message used to interpolate
 * stderr alone — so a whole run of passes died with "exited with status 1: " and nothing after the
 * colon, and quota was indistinguishable from a bad flag or a malformed prompt. Both streams, always,
 * trimmed and capped so a megabyte of half-written JSON cannot bury the one line that explains it.
 */
/**
 * Does this failure look like the account's usage limit rather than a bad call?
 *
 * Worth distinguishing because a quota refusal is the one failure where retrying, and where
 * CONTINUING AT ALL, is pure waste: every remaining pass in the run will fail the same way. One
 * lesson build burned ten spawns after the limit was already reached, then reported five separate
 * "failed" passes as if they were five separate problems.
 */
export function looksLikeQuotaExhaustion(text) {
  return /usage limit|rate limit|quota|too many requests|429|upgrade to increase|limit reached/i.test(
    String(text ?? ""),
  );
}

/**
 * Set once a quota refusal is seen, so the rest of the run stops spawning. Process-scoped on
 * purpose: a fresh invocation gets a fresh chance, which is exactly right when the window has rolled
 * over.
 */
let quotaExhausted = null;

/** Test seam, and the way a caller signals a new window is worth trying. */
export function resetQuotaState() {
  quotaExhausted = null;
}

/** What stopped the run, if it was the quota. Callers use this to record WHY a pass never ran. */
export function quotaFailure() {
  return quotaExhausted;
}

class QuotaExhaustedError extends Error {
  constructor(detail) {
    super(
      `claude -p refused: the account's usage limit appears to be reached.\n${detail}\n` +
        `Every remaining model pass in this run would fail the same way, so the run stopped here ` +
        `rather than spending attempts on it. Re-run when the window has rolled over; passes that ` +
        `completed are recorded and will not be redone.`,
    );
    this.quotaExhausted = true;
  }
}

function describeFailure(status, stdout, stderr) {
  const cap = (text) => {
    const trimmed = String(text ?? "").trim();
    return trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed;
  };
  const parts = [];
  if (cap(stderr)) parts.push(`stderr: ${cap(stderr)}`);
  if (cap(stdout)) parts.push(`stdout: ${cap(stdout)}`);
  const detail = parts.length ? parts.join(" | ") : "no output on either stream";
  return `claude -p exited with status ${status} (${detail})`;
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
    throw new Error(describeFailure(result.status, result.stdout, result.stderr));
  }

  return result.stdout;
}

/**
 * Async twin of `runClaudeWithPrompt` — same stdin prompt, timeout, one retry and env
 * resolution, but built on `spawn` so it never blocks the event loop. This is what a
 * SERVER-side caller must use: the dashboard runs one single-threaded HTTP handler, and a
 * spawnSync model call in it froze every page, player and edit for the duration.
 */
export async function runClaudeWithPromptAsync(
  prompt,
  { scopeEnvPrefix, defaults, maxBuffer = 20 * 1024 * 1024, spawnImpl = spawn } = {},
) {
  assertExternalCallAllowed("spawn `claude -p`");

  const { model, effort, timeout } = resolvePinning(scopeEnvPrefix, defaults);

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await invokeOnceAsync(prompt, { model, effort, timeout, maxBuffer, spawnImpl });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function invokeOnceAsync(prompt, { model, effort, timeout, maxBuffer, spawnImpl }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnImpl("claude", ["-p", "--model", model, "--effort", effort], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`claude -p timed out after ${timeout} ms`));
    }, timeout);

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    child.on("error", fail);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) {
        child.kill("SIGKILL");
        fail(new Error("claude -p stdout exceeded maxBuffer"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(describeFailure(code, stdout, stderr)));
      } else {
        resolvePromise(stdout);
      }
    });

    child.stdin.on("error", () => {}); // a dead child mustn't crash the writer
    child.stdin.end(prompt);
  });
}

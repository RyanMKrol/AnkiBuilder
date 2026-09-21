/**
 * The raw transcript of every agent call in a phase: what was asked, what came back, and, the part
 * that did not exist before, what came back when the call was REJECTED.
 *
 * ── Why this is separate from run-report.json ────────────────────────────────────────────────────
 *
 * `runReport.js` records CLAIMS that are checked against artifacts on disk, and it says so: "a
 * report is not a log". That is the right shape for gating, and it is deliberately not evidence. It
 * records that `gap-author` finished ok and wrote 50 items. It cannot tell you that 44 of those 50
 * were the same sentence pattern, because it never saw the text.
 *
 * This is the evidence half. It is never gated on and nothing branches on it; it exists so a
 * reviewer (human or the final-review agent) can read what a role actually produced instead of
 * inferring it from counts.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────────────────────────
 *
 * Every guard in this directory parses, validates, then throws. A rejected response was therefore
 * destroyed by the act of judging it: on one real chapter-9 failure the only thing that reached disk
 * was `blocks.json`, and nothing could say whether the model had dropped the gaps or answered with
 * handles that did not match. SKILL.md has carried that as a known rough edge, unfixed, because the
 * obvious fix (having each phase inject a teeing wrapper around `runClaude`) would mean a test
 * that forgot to stub the runner spawned a real model, which is golden rule 6.
 *
 * This avoids that entirely by teeing inside `runRole` instead of at the injection site. Injection
 * semantics are untouched: a test that passes a stub still gets its stub, a test that passes nothing
 * still hits `assertExternalCallAllowed` and is refused. Logging happens only when a caller passes a
 * `logDir`, and the phases pass their unit directory, so tests log nothing unless they ask to.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";

/** Where a unit's agent transcripts live, relative to its run directory. */
export const LOG_DIR_NAME = "agent-logs";

/**
 * How much of a prompt or response is kept.
 *
 * A whole prompt is the chapter plus every earlier lesson's vocabulary and runs to hundreds of
 * kilobytes, which would make the log bigger than the deck. The response is what a reviewer needs in
 * full; the prompt is kept as a head and a length so a wrong or truncated prompt is still visible.
 */
const PROMPT_HEAD_CHARS = 2000;

const pad = (n) => String(n).padStart(2, "0");

export function logDirFor(unitDir) {
  return join(unitDir, LOG_DIR_NAME);
}

/**
 * Appends one agent call to a unit's transcript directory.
 *
 * One file per call rather than one growing file: a phase that dies mid-run leaves every completed
 * call intact, and two phases writing the same unit cannot interleave into one corrupt document.
 */
export function appendRunLog(logDir, entry) {
  if (!logDir) return null;
  mkdirSync(logDir, { recursive: true });
  const seq = readdirSync(logDir).filter((f) => f.endsWith(".json")).length + 1;
  const name = `${pad(seq)}-${entry.role}${entry.ok ? "" : "-FAILED"}.json`;
  const path = join(logDir, name);
  writeFileAtomic(
    path,
    JSON.stringify(
      {
        role: entry.role,
        model: entry.model ?? null,
        effort: entry.effort ?? null,
        ok: entry.ok,
        at: entry.at ?? new Date().toISOString(),
        durationMs: entry.durationMs ?? null,
        promptChars: entry.prompt?.length ?? 0,
        promptHead: (entry.prompt ?? "").slice(0, PROMPT_HEAD_CHARS),
        response: entry.response ?? null,
        error: entry.error ?? null,
      },
      null,
      2,
    ) + "\n",
  );
  return path;
}

/**
 * Every transcript a unit has, oldest first.
 *
 * Returns `[]` for a unit built before logging existed, which is an absence and not a clean run,
 * callers that report on logs must say which of the two they are looking at.
 */
export function readRunLogs(unitDir) {
  const dir = logDirFor(unitDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      try {
        return { file: f, ...JSON.parse(readFileSync(join(dir, f), "utf-8")) };
      } catch (error) {
        return { file: f, unreadable: error.message };
      }
    });
}

/** True when this unit predates logging, so "no findings" can be distinguished from "no evidence". */
export function hasRunLogs(unitDir) {
  return existsSync(logDirFor(unitDir));
}

/**
 * The directory the current phase is logging to, if any.
 *
 * ── Why ambient rather than threaded ─────────────────────────────────────────────────────────────
 *
 * Twelve agents call `runRole`, each already forwarding an injected `runClaude`. Threading a second
 * cross-cutting argument through all twelve means twelve signatures, twelve forwarding sites and
 * twelve chances to forget one, and a forgotten one is SILENT, costing exactly the evidence this
 * module exists to keep. Logging is genuinely ambient to a phase: every call inside one run belongs
 * to one unit, and no agent has an opinion about where its transcript goes.
 *
 * It is scoped rather than merely set: `withRunLogDir` restores the previous value on the way out,
 * including when the phase throws, so a failed run cannot leave the next one writing into its
 * directory. An explicit `logDir` passed to `runRole` still wins, which is what tests use.
 */
let ambientLogDir = null;

export function currentRunLogDir() {
  return ambientLogDir;
}

/** Runs `fn` with every `runRole` call inside it logging to `dir`. Restores on the way out. */
export function withRunLogDir(dir, fn) {
  const previous = ambientLogDir;
  ambientLogDir = dir;
  try {
    return fn();
  } finally {
    ambientLogDir = previous;
  }
}

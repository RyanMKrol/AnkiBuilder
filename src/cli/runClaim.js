import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { hostname } from "os";
import { writeFileAtomic } from "../util/atomicWrite.js";

/**
 * A run directory's `claim.json` — "a process is building this lesson right now".
 *
 * It does two jobs, and neither is reserving the directory name (the `mkdir` in
 * outputPaths.js does that atomically):
 *
 *  1. RESUME. A run dir is allocated up front but only gets its `corpus.json` minutes
 *     later, after extraction. If assemble crashes in between, the claim is the only thing
 *     that says "this empty dir is my own crashed attempt at chapter 23" rather than "an
 *     orphan belonging to nobody". Without it, every retry would leak a fresh sequence
 *     number. That is why a FAILED assemble deliberately keeps its claim.
 *  2. The dashboard's read-only "building" state.
 *
 * Liveness is PID-based, not a heartbeat. `runClaude` is spawnSync, so it blocks the event
 * loop for the whole of a multi-minute LLM call and a `setInterval` heartbeat would simply
 * not fire. `process.kill(pid, 0)` costs nothing and is exact for the local-machine case
 * this targets (`output/` and `.anki-builder/` are both gitignored and local).
 */

export const CLAIM_FILENAME = "claim.json";

// Purely a backstop against PID reuse — macOS recycles pids after ~100k spawns, and a
// recycled pid would otherwise keep a long-dead claim looking alive forever.
export const CLAIM_HARD_MAX_MS = 12 * 60 * 60 * 1000;

export function claimPath(runDir) {
  return join(runDir, CLAIM_FILENAME);
}

/** Reads a run dir's claim, or null when there is none (or it's unreadable). */
export function readClaim(runDir) {
  const path = claimPath(runDir);
  if (!existsSync(path)) return null;
  try {
    const claim = JSON.parse(readFileSync(path, "utf-8"));
    return claim && typeof claim === "object" ? claim : null;
  } catch {
    return null;
  }
}

/**
 * Writes a claim, stamping pid/host/startedAt. `exclusive` uses O_EXCL so a claim written
 * immediately after reserving a directory can never overwrite a competitor who got there
 * first; it throws EEXIST in that case.
 */
export function writeClaim(runDir, fields, { exclusive = false, now = Date.now } = {}) {
  const claim = {
    version: 1,
    ...fields,
    pid: process.pid,
    host: hostname(),
    startedAt: new Date(now()).toISOString(),
  };
  const body = JSON.stringify(claim, null, 2) + "\n";
  if (exclusive) {
    writeFileSync(claimPath(runDir), body, { flag: "wx" });
  } else {
    writeFileAtomic(claimPath(runDir), body);
  }
  return claim;
}

/** Merges `patch` into an existing claim (e.g. `{ stage: "audio" }`). No-op if absent. */
export function updateClaim(runDir, patch) {
  const claim = readClaim(runDir);
  if (!claim) return null;
  const next = { ...claim, ...patch };
  writeFileAtomic(claimPath(runDir), JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function clearClaim(runDir) {
  try {
    unlinkSync(claimPath(runDir));
  } catch {
    /* already gone */
  }
}

/** Default liveness probe: does this pid exist? EPERM means it exists but isn't ours. */
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/**
 * "live" | "stale" | "unknown". `unknown` (a claim from another host, which we cannot
 * probe) is treated as live everywhere — the conservative choice.
 */
export function claimLiveness(claim, deps = {}) {
  const { isPidAlive: alive = isPidAlive, hostname: host = hostname, now = Date.now } = deps;
  if (!claim) return "stale";
  if (claim.host && claim.host !== host()) return "unknown";
  const startedAt = Date.parse(claim.startedAt);
  if (Number.isFinite(startedAt) && now() - startedAt > CLAIM_HARD_MAX_MS) return "stale";
  return alive(claim.pid) ? "live" : "stale";
}

/** True when a claim is for this exact unit of work (so its dir can be reclaimed/refused). */
export function claimMatches(claim, key) {
  if (!claim) return false;
  return Object.entries(key).every(([field, value]) => claim[field] === value);
}

/** Human-readable, for both the "already being built" error and the dashboard banner. */
export function describeClaim(claim) {
  if (!claim) return "no claim";
  const stage = claim.stage ? `${claim.stage} ` : "";
  return `${stage}pid ${claim.pid} on ${claim.host} since ${claim.startedAt}`;
}

/**
 * Runs `fn` with a claim held on `runDir`.
 *
 * `clearOnFailure` is the subtle part. For `assemble` it must be FALSE: a crashed assemble
 * leaves a directory with no corpus.json, and the claim is the only marker that lets the
 * retry reuse it instead of allocating a new sequence number. Every later stage passes
 * TRUE, because its directory is already identified by corpus.json/cards.json.
 */
export function withClaim(runDir, fields, fn, { clearOnFailure = true } = {}) {
  writeClaim(runDir, fields);

  // A claim must not outlive its process even when the process is killed mid-stage.
  const release = () => clearClaim(runDir);
  const onSignal = (signal) => {
    release();
    process.removeListener("exit", release);
    process.kill(process.pid, signal);
  };
  const onSigint = () => onSignal("SIGINT");
  const onSigterm = () => onSignal("SIGTERM");
  process.on("exit", release);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const detach = () => {
    process.removeListener("exit", release);
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };

  let result;
  try {
    result = fn();
  } catch (err) {
    detach();
    if (clearOnFailure) clearClaim(runDir);
    throw err;
  }

  // An async stage must keep the claim until its promise settles, not just until it returns.
  if (result && typeof result.then === "function") {
    return result.then(
      (value) => {
        detach();
        clearClaim(runDir);
        return value;
      },
      (err) => {
        detach();
        if (clearOnFailure) clearClaim(runDir);
        throw err;
      },
    );
  }

  detach();
  clearClaim(runDir);
  return result;
}

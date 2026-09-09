// What a phase script records about its own run, and how the main thread checks it.
//
// THE RULE THIS ENCODES. A step that did nothing can still report success. v1 learned this the
// expensive way twice: a pass that fell open still set its completion marker, and "Mark done" set
// its flag even when the package rebuild it triggered had failed, so a watcher polling the flag
// announced a unit was finished while its deck was stale. The lesson written down at the time was
// "when a click triggers work, watch the work's ARTIFACT, not the click", and this module is that
// rule made mechanical rather than remembered.
//
// So a report is not a log. A log is prose a step writes about itself, and a step that skipped its
// work writes exactly the same prose as one that did it. A report is a set of claims each of which
// names a file, and `verifyRun` checks the files. The main thread reads the verdict, never the log.
//
// WHAT A ZERO MEANS. A step that legitimately produced nothing (a chapter with no images) and a
// step that silently produced nothing are indistinguishable from counts alone, so they are kept
// apart by SHAPE: a declared artifact must exist on disk, always, even when it holds an empty list.
// Absence of the file is a hard failure; emptiness of its contents is a note for a human. That way
// "the image step found nothing" is a sentence someone can read, and "the image step never ran" is
// an error, and neither can be mistaken for the other.

import { existsSync, readFileSync, statSync } from "fs";
import { join, isAbsolute } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";

/** The file a phase writes its report to, inside the unit's run directory. */
export const RUN_REPORT_FILE = "run-report.json";

/** Terminal statuses. Anything else in a report is itself a problem. */
export const STEP_STATUS = Object.freeze({ OK: "ok", FAILED: "failed", SKIPPED: "skipped" });
const TERMINAL = new Set(Object.values(STEP_STATUS));

/**
 * Starts a report for one phase. Steps are appended as they finish, so a run killed halfway leaves
 * a report of what it got through rather than nothing at all.
 */
export function startRun({ phase, unitDir, now = () => new Date().toISOString() }) {
  return { phase, unitDir, startedAt: now(), finishedAt: null, steps: [] };
}

/**
 * Records one finished step.
 *
 * `artifact` is a path relative to the unit dir. Declare it whenever the step produces one: it is
 * the only part of the claim that can be checked. `counts` is free-form (`{ in, out }` by
 * convention) and is evidence for a reader, never a gate.
 */
export function recordStep(
  run,
  {
    step,
    role = null,
    status,
    model = null,
    effort = null,
    durationMs = null,
    counts = null,
    artifact = null,
    reason = null,
  },
) {
  if (!TERMINAL.has(status)) {
    throw new Error(`step "${step}" recorded a non-terminal status: ${JSON.stringify(status)}`);
  }
  if (status === STEP_STATUS.FAILED && !reason) {
    throw new Error(
      `step "${step}" failed without a reason, which is the one thing a failure owes`,
    );
  }
  run.steps.push({ step, role, status, model, effort, durationMs, counts, artifact, reason });
  return run;
}

/** Closes the report and writes it into the unit dir. Returns the path written. */
export function finishRun(run, { now = () => new Date().toISOString() } = {}) {
  run.finishedAt = now();
  const path = join(run.unitDir, RUN_REPORT_FILE);
  writeFileAtomic(path, `${JSON.stringify(run, null, 2)}\n`);
  return path;
}

/** Reads a unit's report, or null when the phase never wrote one. */
export function readRun(unitDir) {
  const path = join(unitDir, RUN_REPORT_FILE);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

function artifactPath(unitDir, artifact) {
  return isAbsolute(artifact) ? artifact : join(unitDir, artifact);
}

/**
 * Checks a run against the files it claims to have produced.
 *
 * Returns `{ ok, problems, notes }`. A problem means the run cannot be trusted and the phase must
 * not hand over a review link. A note is something a person should look at and nothing more.
 *
 * The checks, and why each one is a problem rather than a note:
 *
 *   - a step that did not finish            the run was interrupted; its outputs are partial
 *   - a step that FAILED                    the phase is incomplete by its own account
 *   - an `ok` step whose artifact is absent  this is the whole point: a success claim with nothing
 *                                            behind it is the failure mode the report exists to catch
 *   - an `ok` step whose artifact is empty   0 bytes is not "no findings", it is a truncated write
 *   - a required step that never appears     a step removed from a script leaves no trace otherwise
 */
export function verifyRun(run, { unitDir = run?.unitDir, requiredSteps = [] } = {}) {
  const problems = [];
  const notes = [];

  if (!run) return { ok: false, problems: ["no run report: the phase never recorded one"], notes };
  if (!run.finishedAt) problems.push("the run never finished: it was interrupted mid-phase");

  const seen = new Set();
  for (const step of run.steps ?? []) {
    seen.add(step.step);
    if (!TERMINAL.has(step.status)) {
      problems.push(`${step.step}: non-terminal status ${JSON.stringify(step.status)}`);
      continue;
    }
    if (step.status === STEP_STATUS.FAILED) {
      problems.push(`${step.step}: failed (${step.reason})`);
      continue;
    }
    if (step.status === STEP_STATUS.SKIPPED) {
      notes.push(`${step.step}: skipped${step.reason ? ` (${step.reason})` : ""}`);
      continue;
    }
    if (!step.artifact) continue;
    const path = artifactPath(unitDir, step.artifact);
    if (!existsSync(path)) {
      problems.push(
        `${step.step}: reported ok but its artifact is missing (${step.artifact}). ` +
          `A success claim with nothing behind it is exactly what this check exists to catch.`,
      );
      continue;
    }
    if (statSync(path).size === 0) {
      problems.push(`${step.step}: reported ok but ${step.artifact} is empty (0 bytes)`);
      continue;
    }
    const produced = step.counts?.out;
    if (typeof produced === "number" && produced === 0) {
      notes.push(`${step.step}: ran and produced nothing. Correct for some chapters; check it is.`);
    }
  }

  for (const required of requiredSteps) {
    if (!seen.has(required)) {
      problems.push(`${required}: required by this phase and absent from the report`);
    }
  }

  return { ok: problems.length === 0, problems, notes };
}

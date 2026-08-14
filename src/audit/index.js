import { ALL_CHECKS, SCHEMA_ONLY_CHECKS } from "./checks/index.js";
import { loadWorkspace, runChecks, SCOPES, TIERS } from "./registry.js";
import { formatReport } from "./report.js";
import { writeAccepted } from "./accepted.js";

/**
 * `src/audit/` — the deterministic gate, as a library.
 *
 * The whole of it lives here rather than in `scripts/` for the reason the codebase already
 * half-follows and this workstream makes a rule: anything that reasons about (or mutates) `output/`
 * keeps its logic in `src/` behind unit tests, and the `.mjs` is arg parsing plus reporting. Before
 * this, 1,653 lines across thirteen scripts had zero tests, and the one deterministic gate the
 * whole pipeline funnels through was one of them.
 *
 * Entry points:
 *   `audit(...)`        run the checks, get structured results
 *   `formatReport(...)` turn those results into lines
 *   `acceptFindings(…)` record acknowledgements (only ever from an explicit `--accept`)
 */

export { ALL_CHECKS, SCHEMA_ONLY_CHECKS, loadWorkspace, runChecks, formatReport, SCOPES, TIERS };
export { defineCheck } from "./registry.js";
export * from "./units.js";
export { ACCEPTED_FILENAME, acceptedPath, readAccepted } from "./accepted.js";

/**
 * Loads the workspace and runs the selected checks over it.
 *
 * `exitCode` is 1 when anything blocks: a FAIL finding, or an ACK finding nobody has acknowledged.
 * An empty output root is exit 0 with a coverage line saying so — a fresh clone has no decks, and a
 * command that cannot find any deck state must not be indistinguishable from one that found broken
 * decks.
 */
export function audit({
  outputRoot = "output",
  collectionDir = null,
  checks = ALL_CHECKS,
  scopes = SCOPES,
  only = null,
  libraryHomeDir = null,
} = {}) {
  const workspace = loadWorkspace({ outputRoot, collectionDir });
  if (libraryHomeDir) workspace.libraryHomeDir = libraryHomeDir;
  const run = runChecks(checks, workspace, { scopes, only });
  return {
    ...run,
    workspace,
    exitCode: run.failCount > 0 || run.unreviewedCount > 0 ? 1 : 0,
  };
}

/**
 * Records every currently-unreviewed ACK finding in the acknowledgement file of the directory it
 * belongs to. Returns `[{ path, added }]`.
 *
 * Only ever reached from an explicit `preflight --accept`. Nothing calls it as a side effect: an
 * acknowledgement a tool can grant itself would say nothing about whether a human looked.
 */
export function acceptFindings(results, { note = null, now } = {}) {
  const byDir = new Map();
  for (const result of results) {
    if (result.tier !== "ACK") continue;
    for (const finding of result.unreviewed) {
      if (!byDir.has(result.acceptDir)) byDir.set(result.acceptDir, []);
      byDir.get(result.acceptDir).push({
        checkId: result.id,
        key: finding.key,
        message: finding.message,
      });
    }
  }
  return [...byDir].map(([dir, entries]) => writeAccepted(dir, entries, { note, now }));
}

import { isAccepted, readAccepted } from "./accepted.js";
import { loadUnits, scanWorkspace, describeCollectionDir } from "./units.js";

/**
 * The check registry: scope, severity tier, and one runner per check.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `unit`        runs once per unit directory. Sees one unit.
 *   `collection`  runs once per book / course / template deck. Sees all of that collection's units
 *                 and its package.
 *   `workspace`   runs once for the whole output root, and may iterate collections to apply
 *                 PER-COLLECTION logic (a whole-tree shape report, say). It must NEVER compare one
 *                 collection's cards against another's.
 *
 * ⚠️ COLLECTIONS ARE ISOLATED (owner ruling, 2026-08-14; stated in CLAUDE.md). Two decks built from
 * two different sources are two separate products, and nothing here may overlap them, compare them,
 * cue them against each other, or consider one in reference to the other. Three workspace-scope
 * checks that did exactly that were written, merged, and then removed. Within a single collection,
 * cross-referencing between its lessons and extras is unchanged and correct: that is one product
 * being made coherent with itself.
 *
 * The `workspace` scope stays because a legitimate whole-tree question exists (coverage, shape, "is
 * this directory anybody's?"), but it is not the loophole. If a check you are writing needs to read
 * a second collection's cards to answer its question, it is the wrong check.
 *
 * ── TIER ─────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `FAIL`  blocks. A finding here means "do not hand over a review link". Exit code 1.
 *   `ACK`   blocks only while instances are UNREVIEWED. A finding can be acknowledged with
 *           `preflight --accept`, which records it in the collection's `.preflight-accepted.json`;
 *           acknowledged instances are still printed, quietly, as a standing count. This is the tier
 *           for a genuine finding whose resolution is a judgement — "yes, those two really are
 *           different senses of the same word" — and it is what stops a permanently non-zero number
 *           from teaching the operator to ignore the report.
 *   `INFO`  never affects the exit code. Coverage, shape and provenance reporting.
 *
 * Standing rule for anyone adding a check: **a check promoted to FAIL ships in the same commit as
 * the fix, or as the ACK, for its live instances.** A red gate the operator has to override on the
 * day it lands is worse than no gate, because the override becomes the habit.
 *
 * ── ADDING A CHECK ───────────────────────────────────────────────────────────────────────────────
 *
 *     export const myCheck = defineCheck({
 *       id: "my-check",             // stable; the acknowledgement file keys on it
 *       title: "short label",       // printed in the report column
 *       scope: "collection",
 *       tier: "FAIL",
 *       appliesTo: (collection) => collection.kind !== "template",   // optional
 *       run({ collection, units }) {
 *         return {
 *           findings: [{ key: "chapter-3/x1", message: "..." }],
 *           summary: `${units.length} unit(s) checked`,
 *         };
 *       },
 *     });
 *
 * then add it to the list in `src/audit/checks/index.js`. A `run` may also return
 * `{ skipped: "reason" }` — for a check whose input is not on this machine (an unbuilt package, an
 * absent dedup library) — which is reported as a skip and never as a pass. A check that returns
 * findings for something it could not look at is the failure mode this whole module exists to
 * prevent.
 *
 * A finding's `key` is its ACKNOWLEDGEMENT IDENTITY: it must be stable across runs and specific
 * enough that accepting one instance does not silently accept the next one. Prefer
 * `<unit>/<cardId>` over an index, and never include a count or a timestamp.
 */

export const TIERS = ["FAIL", "ACK", "INFO"];
export const SCOPES = ["unit", "collection", "workspace"];

export function defineCheck(spec) {
  const { id, title, scope, tier, run } = spec;
  if (!id || !title) throw new Error("a check needs an id and a title");
  if (!SCOPES.includes(scope)) throw new Error(`check ${id}: unknown scope "${scope}"`);
  if (!TIERS.includes(tier)) throw new Error(`check ${id}: unknown tier "${tier}"`);
  if (typeof run !== "function") throw new Error(`check ${id}: run must be a function`);
  return { appliesTo: () => true, ...spec };
}

/** Normalizes whatever a check's `run` returned into the shape the runner reports on. */
function normalize(result) {
  if (!result) return { findings: [], summary: null, skipped: null, notes: [] };
  if (result.skipped) return { findings: [], summary: null, skipped: result.skipped, notes: [] };
  const findings = (result.findings ?? []).map((finding) =>
    typeof finding === "string" ? { key: finding, message: finding } : finding,
  );
  return {
    findings,
    summary: result.summary ?? null,
    skipped: null,
    notes: result.notes ?? [],
  };
}

/**
 * Loads the workspace once — collections, their units, their acknowledgement records — so that
 * thirty checks read the same thirty cards.json files a single time and can never disagree about
 * what is on disk mid-run.
 */
export function loadWorkspace({ outputRoot = "output", collectionDir = null } = {}) {
  // Pointing preflight at ONE collection checks it even when it is retired: naming a directory
  // explicitly is a deliberate act, and the retirement filter exists to keep dead decks out of a
  // whole-root sweep, not to make them unexaminable.
  const scan = collectionDir
    ? {
        root: outputRoot,
        collections: [describeCollectionDir(collectionDir)],
        retired: [],
        unknownGroups: [],
      }
    : scanWorkspace(outputRoot);

  const collections = scan.collections.map((collection) => ({
    ...collection,
    units: loadUnits(collection),
    accepted: readAccepted(collection.dir),
  }));

  return {
    root: scan.root,
    missing: Boolean(scan.missing),
    retired: scan.retired ?? [],
    unknownGroups: scan.unknownGroups,
    collections,
    accepted: readAccepted(scan.root),
  };
}

/**
 * Runs a set of checks over a loaded workspace.
 *
 * `scopes` filters which scopes run (the `--schema-only` / `--unit-only` style switches), `only`
 * filters by check id. Returns `{ results, coverage, failCount, unreviewedCount }` — printing lives
 * in scripts/preflight.mjs, so the runner stays testable without capturing stdout.
 */
export function runChecks(checks, workspace, { scopes = SCOPES, only = null } = {}) {
  const selected = checks.filter(
    (check) => scopes.includes(check.scope) && (!only || only.includes(check.id)),
  );
  const results = [];

  for (const check of selected) {
    if (check.scope === "workspace") {
      if (!check.appliesTo(workspace)) continue;
      results.push(
        record(check, workspace, workspace.root, `workspace`, () =>
          check.run({ workspace, collections: workspace.collections }),
        ),
      );
      continue;
    }

    for (const collection of workspace.collections) {
      if (!check.appliesTo(collection, workspace)) continue;
      if (check.scope === "collection") {
        results.push(
          record(check, collection, collection.dir, collection.label, () =>
            check.run({ collection, units: collection.units, workspace }),
          ),
        );
        continue;
      }
      for (const unit of collection.units) {
        results.push(
          record(
            check,
            collection,
            collection.dir,
            `${collection.label}/${unit.name}`,
            () => check.run({ unit, collection, workspace }),
            unit.name,
          ),
        );
      }
    }
  }

  const coverage = describeCoverage(workspace, selected, results);
  const failCount = results.reduce((n, r) => n + (r.tier === "FAIL" ? r.findings.length : 0), 0);
  const unreviewedCount = results.reduce((n, r) => n + r.unreviewed.length, 0);
  return { results, coverage, failCount, unreviewedCount };
}

function record(check, acceptScope, acceptDir, target, invoke, unitName = null) {
  let outcome;
  try {
    outcome = normalize(invoke());
  } catch (error) {
    // A throwing check is itself a finding, never a silent skip: the alternative is a checker that
    // crashed reading exactly like one that passed.
    outcome = {
      findings: [{ key: `${target}::check-error`, message: `check threw: ${error.message}` }],
      summary: null,
      skipped: null,
      notes: [],
    };
  }

  const acceptRecord = acceptScope.accepted;
  const keyed = outcome.findings.map((finding) => ({
    ...finding,
    // Unit-scope findings are keyed within their collection's file, so prefix the unit name unless
    // the check already did — otherwise `chapter-3` and `chapter-4` would share an acknowledgement.
    key:
      unitName && !String(finding.key).startsWith(`${unitName}/`)
        ? `${unitName}/${finding.key}`
        : String(finding.key),
  }));

  const unreviewed =
    check.tier === "ACK"
      ? keyed.filter((finding) => !isAccepted(acceptRecord, check.id, finding.key))
      : check.tier === "FAIL"
        ? keyed
        : [];

  return {
    id: check.id,
    title: check.title,
    scope: check.scope,
    tier: check.tier,
    target,
    acceptDir,
    findings: keyed,
    unreviewed,
    accepted: keyed.length - unreviewed.length,
    summary: outcome.summary,
    skipped: outcome.skipped,
    notes: outcome.notes,
  };
}

/**
 * The coverage header: what the run actually looked at.
 *
 * This is the line that makes "clean" mean something. Without it a run that walked past a template
 * deck, an unreadable directory and a collection whose package was never built prints exactly the
 * same three characters as a run that checked all of them.
 */
function describeCoverage(workspace, selected, results) {
  const unitsByShape = { unit: 0, extras: 0, template: 0 };
  let units = 0;
  const unmatchedDirs = [];
  for (const collection of workspace.collections) {
    for (const unit of collection.units) {
      units++;
      unitsByShape[unit.shape] = (unitsByShape[unit.shape] ?? 0) + 1;
    }
    unmatchedDirs.push(...(collection.unmatchedDirs ?? []));
  }
  return {
    root: workspace.root,
    collections: workspace.collections.length,
    collectionsByKind: workspace.collections.reduce((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
      return acc;
    }, {}),
    units,
    unitsByShape,
    unmatchedDirs,
    retired: workspace.retired ?? [],
    unknownGroups: workspace.unknownGroups,
    checksDeclared: selected.length,
    checksSkipped: results.filter((r) => r.skipped).length,
  };
}

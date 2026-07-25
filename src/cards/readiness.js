/**
 * Is a lesson finished enough for a human to review?
 *
 * This is the ONE place that answers that question, and it is deliberately a pure function of
 * `cards.meta` so the CLI, the dashboard's render and the dashboard's write-back all reach the same
 * verdict from the same input.
 *
 * It exists because "the passes have all run" used to be a property of how you got here rather than
 * something anyone checked. Any `cards.json` was reviewable: `anki-builder translate --run <dir>` on
 * its own produced a lesson that rendered identically to a fully-prepared one, a `prepare` that died
 * after translate left the same thing behind, and a lesson built before a pass existed carried no
 * record either way. A reviewer signed off believing they were looking at the final card set, and the
 * drill, de-dup and cross-reference passes had never touched it.
 *
 * Checking the state instead of trusting the route means it does not matter how a lesson got here.
 */

/** The pre-review passes, in the order `prepare` runs them, keyed by the marker each one sets. */
const REQUIRED_PASSES = [
  {
    key: "enriched",
    label: "fill-in-the-blank drills + semantic de-dup",
  },
  {
    key: "notesEnhanced",
    label: "cross-lesson notes",
  },
];

/**
 * `{ ready, missing, reason }` for a lesson, from its `cards.meta`.
 *
 * `missing` lists the passes that have not recorded a complete run; `reason` is a short phrase for
 * the UI when a lesson is held back for something other than a missing pass.
 *
 * Two deliberate carve-outs:
 *
 *  - **A template is always ready.** It is a fixed vocabulary list: no source drills to mine and no
 *    sibling lessons to cross-reference, so `prepare` skips both passes by design and their markers
 *    are correctly absent.
 *  - **An already-reviewed lesson stays ready.** The gate is about what a human is asked to sign off,
 *    and that has already happened. Without this, tightening the rule would retroactively unreview
 *    every lesson finished before the markers existed.
 */
export function lessonReadiness(meta = {}) {
  if (meta.reviewed === true || meta.sourceType === "template") {
    return { ready: true, missing: [], reason: null };
  }

  const missing = REQUIRED_PASSES.filter((pass) => meta[pass.key] !== true);

  // `prepareDegraded` means a pass DID run but against an incomplete view of the book — earlier
  // lessons that had no cards.json yet. Its markers are withheld for exactly that reason, so it
  // shows up in `missing` too; this just gives the UI the more specific thing to say.
  const reason = meta.prepareDegraded
    ? `an earlier run could not see ${describeMissingLessons(meta.prepareDegraded)}`
    : null;

  return { ready: missing.length === 0, missing, reason };
}

function describeMissingLessons(degraded) {
  const names = Array.isArray(degraded.missing) ? degraded.missing : [];
  if (names.length === 0) return "this book's earlier lessons";
  return `this book's earlier lessons (${names.join(", ")})`;
}

/**
 * One human-readable line naming what still has to run, for a log or a banner. Takes the RESULT of
 * `lessonReadiness`, not the meta, so a caller that already has the verdict (the dashboard carries it
 * per unit) doesn't have to keep the raw meta around just to describe it.
 */
export function describeReadiness({ missing = [], reason = null } = {}) {
  // Derived from `missing` rather than the `ready` flag, so the two can never disagree and a caller
  // that passes a partial object still gets a sentence rather than a dangling fragment.
  if (missing.length === 0) return "ready for review";
  const passes = missing.map((pass) => pass.label).join(" and ");
  return reason ? `${passes} still to run — ${reason}` : `${passes} still to run`;
}

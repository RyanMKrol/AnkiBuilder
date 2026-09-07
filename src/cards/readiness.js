import { findUnreadableNumbers } from "./spokenNumbers.js";
import { resolveIso639Code } from "../model/iso639.js";

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

/**
 * Is the fill-in-the-blank + semantic de-dup pass this unit's to run?
 *
 * Two units answer no, for the same underlying reason: something else already settled what drills
 * the unit holds, so an absent `enriched` marker is correct rather than a pass that never finished.
 *
 *  - **A template** is a fixed vocabulary list with no source text to mine.
 *  - **A v2 phase unit** (`meta.phase`) had its sentences produced by phase 2's own miners. A base
 *    unit must hold no sentences at all, so mining drills into it would break the split the phases
 *    exist to enforce; an extras unit already holds the mined set.
 *
 * This is exported and shared rather than re-tested at each site because the three callers must
 * agree: `prepare` decides whether to run the pass, `lessonReadiness` decides whether its marker is
 * required before a human may sign off, and `resume` decides whether to send the operator back to
 * `prepare`. Two of those disagreeing produces a unit that can never become reviewable and a
 * recovery step that never stops recommending itself.
 */
export function drillPassExpected(meta = {}) {
  if (meta.sourceType === "template") return false;
  if (meta.phase === "base" || meta.phase === "extras") return false;
  return true;
}

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
export function lessonReadiness(meta = {}, items = null) {
  if (meta.reviewed === true || meta.sourceType === "template") {
    return { ready: true, missing: [], reason: null, numberIssues: [], translateErrors: [] };
  }

  // A pass this unit was never going to run cannot be missing from it. The cross-lesson note pass
  // still runs on a phase unit, so it stays required either way.
  const required = REQUIRED_PASSES.filter(
    (pass) => pass.key !== "enriched" || drillPassExpected(meta),
  );
  const missing = required.filter((pass) => meta[pass.key] !== true);

  // Items that never translated (recorded by the translate stage after its retry). A reviewer
  // signing off a lesson with holes in it would be approving a card set that isn't final —
  // re-running prepare retries exactly these items.
  const translateErrors = Array.isArray(meta.translateErrors) ? meta.translateErrors : [];

  // A digit that has leaked into the spoken text or the romaji. Held at THIS gate rather than at the
  // audio stage, which was the old placement and far too late: by then the lesson has been reviewed,
  // and the reviewer has been reading wrong romaji the whole way through. Here the offending cards are
  // on screen in front of them, and `ttsText`/`pronunciation` are both inline-editable — so fixing it
  // clears the block on the next render, with nothing to re-run.
  const numberIssues = items
    ? findUnreadableNumbers(items, resolveIso639Code(meta.targetLanguage))
    : [];

  // `prepareDegraded` means a pass DID run but against an incomplete view of the book — earlier
  // lessons that had no cards.json yet. Its markers are withheld for exactly that reason, so it
  // shows up in `missing` too; this just gives the UI the more specific thing to say.
  const reason = meta.prepareDegraded
    ? `an earlier run could not see ${describeMissingLessons(meta.prepareDegraded)}`
    : null;

  return {
    ready: missing.length === 0 && numberIssues.length === 0 && translateErrors.length === 0,
    missing,
    reason,
    numberIssues,
    translateErrors,
  };
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
export function describeReadiness({
  missing = [],
  reason = null,
  numberIssues = [],
  translateErrors = [],
} = {}) {
  // Derived from the findings rather than the `ready` flag, so the two can never disagree and a caller
  // that passes a partial object still gets a sentence rather than a dangling fragment.
  if (translateErrors.length > 0) {
    return (
      `${translateErrors.length} item(s) failed to translate — ` +
      `re-run prepare to retry them before reviewing`
    );
  }
  if (missing.length === 0 && numberIssues.length === 0) return "ready for review";
  if (missing.length === 0) {
    return (
      `${numberIssues.length} card(s) have a numeral that needs spelling out in a "ttsText" — ` +
      `the romaji and the audio are both wrong until they do`
    );
  }
  const passes = missing.map((pass) => pass.label).join(" and ");
  return reason ? `${passes} still to run — ${reason}` : `${passes} still to run`;
}

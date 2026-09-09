// What the reviewer's own corrections say about the role that produced each card.
//
// THE SIGNAL IS FREE AND IT IS THE ONLY ONE THERE IS. Moving extraction to agents removed the eval
// fixtures' replay seam for that half of the pipeline: there is no recorded stdout to diff when the
// work is a judgement made across several roles. What replaces it is the reviewer, who already looks
// at every card and already excludes and edits. Those actions are ground truth about where a role
// was wrong, they cost nothing extra, and until now nothing read them back.
//
// WHAT COUNTS AS FEEDBACK, AND WHAT EMPHATICALLY DOES NOT. An exclusion carries `excludedBy`, and
// the difference between `human` and a script name is the difference between "a person judged this
// card wrong" and "the pipeline did its job". Counting a semantic-dedup exclusion against the role
// that produced the card would punish it for being deduplicated, which is not a mistake and is often
// the system working exactly as designed. Only human exclusions are treated as feedback; script
// exclusions are reported separately so the two can never be added together.
//
// WHAT THIS CANNOT TELL YOU, STATED RATHER THAN IMPLIED. A field that differs between the snapshot
// and the approved cards changed for one of two reasons: a reviewer edited it, or a downstream pass
// did. The card carries no record of which. So field changes are reported as "changed since
// generation" and never as "the reviewer rejected this wording". Overclaiming there would send
// someone to fix a prompt that was never at fault.

import { diffItemSets } from "../cards/itemSetDiff.js";
import { rolesFor } from "./snapshot.js";

/** Exclusions that represent a human's judgement rather than a pipeline step. */
export const HUMAN = "human";

const emptyRole = () => ({
  produced: 0,
  kept: 0,
  excludedByHuman: [],
  excludedByScript: [],
  changedSinceGeneration: [],
});

/**
 * Reads a unit's review back against the corpus its roles generated.
 *
 * `snapshot` is the immutable pre-review baseline (`as-generated.json`); `approved` is the unit's
 * `cards.json` after the gate. Returns per-role counts plus the unattributed remainder, which is a
 * real category: a card can reach the corpus by a route no role was recorded for, and inventing an
 * attribution for it would be worse than admitting the gap.
 */
export function learnFromReview(snapshot, approved, { languageCode } = {}) {
  const generated = snapshot?.items ?? [];
  const approvedItems = approved?.items ?? [];
  const byId = new Map(approvedItems.map((item) => [item.id, item]));

  const byRole = {};
  const unattributed = emptyRole();
  const roleBucket = (role) => (byRole[role] ??= emptyRole());

  for (const item of generated) {
    const roles = rolesFor(snapshot, item.id);
    const buckets = roles.length ? roles.map(roleBucket) : [unattributed];
    for (const bucket of buckets) bucket.produced++;

    const final = byId.get(item.id);
    if (!final) {
      // Present at generation, absent after review. Not an exclusion (that leaves the card in place
      // with a flag), so it is a removal by something that rewrote the file, and it is recorded as
      // its own thing rather than guessed at.
      for (const bucket of buckets) {
        bucket.changedSinceGeneration.push({
          id: item.id,
          field: "(removed)",
          from: item.target,
          to: null,
        });
      }
      continue;
    }

    if (final.excluded) {
      const entry = { id: final.id, target: final.target, reason: final.excludedReason ?? null };
      for (const bucket of buckets) {
        if (final.excludedBy === HUMAN) bucket.excludedByHuman.push(entry);
        else bucket.excludedByScript.push({ ...entry, by: final.excludedBy ?? null });
      }
      continue;
    }

    for (const bucket of buckets) bucket.kept++;
    for (const field of ["english", "target", "note", "hint", "scene", "category"]) {
      const before = item[field] ?? null;
      const after = final[field] ?? null;
      if (before !== after) {
        for (const bucket of buckets) {
          bucket.changedSinceGeneration.push({ id: final.id, field, from: before, to: after });
        }
      }
    }
  }

  // Cards the reviewer's file has that generation did not: added by hand, or by a later pass.
  const added = diffItemSets(generated, approvedItems, { languageCode }).extra;

  return {
    phase: snapshot?.phase ?? null,
    totals: {
      generated: generated.length,
      approved: approvedItems.filter((i) => !i.excluded).length,
      addedAfterGeneration: added.length,
    },
    byRole,
    unattributed,
    added,
  };
}

/**
 * A short report a person reads, ordered by the number of human exclusions.
 *
 * Human exclusions lead because they are the only line that is unambiguously feedback. The other
 * counts are context for reading it, not a score.
 */
export function describeLearning(report) {
  const rows = Object.entries(report.byRole)
    .map(([role, r]) => ({ role, ...r }))
    .sort((a, b) => b.excludedByHuman.length - a.excludedByHuman.length);

  const lines = [
    `${report.totals.generated} generated · ${report.totals.approved} approved · ` +
      `${report.totals.addedAfterGeneration} added after generation`,
  ];
  for (const r of rows) {
    lines.push(
      `  ${r.role.padEnd(24)} produced ${String(r.produced).padStart(3)} · kept ${String(r.kept).padStart(3)} · ` +
        `cut by human ${String(r.excludedByHuman.length).padStart(2)} · cut by script ` +
        `${String(r.excludedByScript.length).padStart(2)} · edited ${r.changedSinceGeneration.length}`,
    );
  }
  if (report.unattributed.produced) {
    lines.push(`  ${"(unattributed)".padEnd(24)} produced ${report.unattributed.produced}`);
  }
  lines.push(
    "",
    "Only 'cut by human' is feedback. A script exclusion is the pipeline working, and an edit may",
    "have come from a later pass rather than the reviewer: the card records no author for a field.",
  );
  return lines.join("\n");
}

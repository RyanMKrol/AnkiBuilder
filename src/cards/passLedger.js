// A record, on the unit itself, of how each model pass turned out.
//
// WHY. `prepare`'s two passes have always written markers (`enriched`, `notesEnhanced`), which is why
// a failure there is trivially recoverable: no marker means "not done", so a re-run retries exactly
// those. The other passes — the taught index, forward flags, the pedagogical sort, the romanization
// correction — wrote NOTHING. Nothing on disk knew they had failed, so nothing could retry them, and
// the failure surfaced weeks later as a wrong card. This extends the existing convention to all of
// them rather than inventing a second one.
//
// The ledger lives at `meta.passes`, and `translate` copies corpus meta into cards meta verbatim, so
// an entry written during assemble travels with the unit.

export const PASS_OK = "ok";
export const PASS_FAILED = "failed";
export const PASS_SKIPPED = "skipped";

/** Every pass that can fail independently, in the order a build runs them. */
export const KNOWN_PASSES = [
  "extraction",
  "bookConventions",
  "taughtIndex",
  "forwardFlags",
  "pedagogicalSort",
  "translate",
  "romanization",
  "fillInBlank",
  "semanticDedup",
  "crossLessonNotes",
  "numberReadings",
];

/**
 * Merge one pass's outcome into a meta object, in place. `reason` is free text and is what turns
 * "this failed" into "this failed BECAUSE the quota was reached", which is the difference between a
 * resumable run and a mystery.
 */
export function recordPass(meta, name, status, reason = null) {
  if (!meta || typeof meta !== "object") return meta;
  const passes = { ...(meta.passes ?? {}) };
  passes[name] = { status, ...(reason ? { reason: String(reason).slice(0, 300) } : {}) };
  meta.passes = passes;
  return meta;
}

/** The passes recorded as failed, as `[name, reason]` pairs. */
export function failedPasses(meta) {
  const passes = meta?.passes ?? {};
  return Object.entries(passes)
    .filter(([, entry]) => entry?.status === PASS_FAILED)
    .map(([name, entry]) => [name, entry.reason ?? null]);
}

/**
 * Model capability order. Higher wins.
 *
 * This is a RANKING, not a price list, and it is the only place that ordering is written down. When
 * a new model lands, adding it here is the deliberate act of saying where it sits relative to the
 * others; leaving it out makes every role that names it fail the build rather than silently rank as
 * unknown.
 *
 * It lives here, below every module that makes model calls, so both the pin tables (the agents in
 * src/agents/roles.js, which re-exports it) and the runner's own pin-order check (runClaude.js) can
 * read it without importing each other.
 */
export const MODEL_RANK = Object.freeze({
  "claude-haiku-4-5-20251001": 1,
  "claude-sonnet-5": 2,
  "claude-opus-5": 3,
});

/**
 * Effort, as the tiebreak within one model.
 *
 * The adversary assertion used to compare models alone, which worked while checkers were Opus and
 * producers were Sonnet. Moving the checkers to Sonnet on cost grounds (owner, 2026-09-08) collapses
 * that comparison: same model on both sides, so the only remaining axis is how hard each one thinks.
 *
 * Note what this does NOT recover. Half the original reason for the tier gap was that a model
 * checking its own family's output leans toward approving it, and effort does not address that at
 * all. What survives is the other half: noticing an omission is harder than producing content, so a
 * checker should at least be working harder than what it checks.
 */
export const EFFORT_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });

/** A pin's capability as one comparable number: model tier first, effort as the tiebreak. */
export function capabilityRank(pin) {
  return MODEL_RANK[pin.model] * 10 + (EFFORT_RANK[pin.effort] ?? 0);
}

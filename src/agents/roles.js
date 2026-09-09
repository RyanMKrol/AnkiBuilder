// Every v2 agent role, and the model each one is pinned to.
//
// WHY A REGISTRY RATHER THAN A DEFAULT. The operator thread runs Opus 5. An agent that does not
// state a model inherits whatever spawned it, so an unpinned role silently bills Opus rates for
// work Sonnet does well, and nobody finds out from the output. Pinning is the only reason running
// this work in scripts is cheaper than doing it in the operator's own context, so it cannot be a
// convention people remember: a role with no `model` or no `effort` fails the build
// (test/agents/roles.test.js), which is what makes "always pinned" true rather than aspirational.
//
// WHY ADVERSARIES OUTRANK WHAT THEY CHECK. Noticing that something is ABSENT is harder than
// producing it, and a model asked to check its own family's output is measurably biased toward
// approving it. So a role that verifies another declares `checks: [...]`, and the test asserts it
// is pinned strictly above every role it names. That ordering is the cheapest debias available and
// it is worth an explicit assertion, because getting it backwards would leave the pipeline looking
// fully verified while the verification was the weakest link in it.
//
// This registry governs v2 roles. The v1 passes that SURVIVED the rewrite keep declaring their
// pinning at their own call sites (src/corpus/epubLlmRunClaude.js, src/translate/runClaude.js),
// which is now a decision rather than a deferral: they are grouped into env families whose members
// share a blast radius, and v2's roles deliberately do not share one. Both tables are held to the
// same two rules by tests (test/agents/survivingPassPins.test.js), so "every agent is pinned" is
// asserted across the whole pipeline rather than only across half of it.

import { resolvePinning } from "../util/runClaude.js";

/**
 * Model capability order, for the adversary assertion. Higher wins.
 *
 * This is a RANKING, not a price list, and it is the only place that ordering is written down. When
 * a new model lands, adding it here is the deliberate act of saying where it sits relative to the
 * others; leaving it out makes every role that names it fail the build rather than silently rank as
 * unknown.
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

/** A role's capability as one comparable number: model tier first, effort as the tiebreak. */
export function capabilityRank(role) {
  return MODEL_RANK[role.model] * 10 + (EFFORT_RANK[role.effort] ?? 0);
}

const MINUTES = 60 * 1000;

/**
 * The roles, keyed by id. Each declares:
 *
 *   envScope   the `ANKI_BUILDER_<SCOPE>_MODEL` / `_EFFORT` / `_TIMEOUT_MS` triple that overrides
 *              it per environment. Overridable there and never at the call site, so a caller
 *              cannot quietly upgrade a role for one run and leave the cost unexplained.
 *   model      pinned, always. No default.
 *   effort     pinned, always. No default.
 *   timeoutMs  wall clock travels WITH effort: raising a slow role without raising its ceiling
 *              converts a quality knob into a hard mid-run abort, after the money is spent.
 *   phase      which workflow phase runs it.
 *   checks     for a verification role, the ids it verifies. Must be pinned above all of them.
 */
export const ROLES = Object.freeze({
  // ---- Phase 1: base vocabulary -------------------------------------------------------------
  tableSpecialist: {
    envScope: "TABLE_SPECIALIST",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "base",
    purpose: "Judge which of a chapter's tables are vocabulary, and read the headword/gloss pairs.",
  },
  chapterReader: {
    envScope: "CHAPTER_READER",
    model: "claude-sonnet-5",
    // Was `high`, for the reason v1's chapter extraction runs high: this role reads a long file
    // against several competing inclusion rules, and its misses were silent and unrecoverable.
    //
    // They are no longer silent. The coverage adversary re-derives the chapter independently and the
    // gap filler cards what this role missed: on chapter 9 that pair recovered fifteen items,
    // thirteen of them verb conjugations. The safety net that justifies `medium` did not exist when
    // the pin was chosen. Measured at 408s per run, the single most expensive step in the phase.
    effort: "medium",
    timeoutMs: 25 * MINUTES,
    phase: "base",
    purpose: "Find vocabulary anywhere in the chapter, independent of markup.",
  },
  imageSpecialist: {
    envScope: "IMAGE_SPECIALIST",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 20 * MINUTES,
    phase: "base",
    purpose: "Give every image a verdict and transcribe the ones that carry teaching content.",
  },
  coverageAdversary: {
    envScope: "COVERAGE_ADVERSARY",
    // Above every role it checks. Asked to enumerate independently, never shown the corpus or the
    // prompts that produced it, so the diff can be computed in code rather than judged.
    model: "claude-sonnet-5",
    effort: "high",
    timeoutMs: 25 * MINUTES,
    phase: "base",
    // All three producers, and `chapterReader` came BACK to this list rather than being left out.
    // It dropped out when the checkers moved to Sonnet and the two became peers at sonnet-5/high;
    // lowering the chapter reader to `medium` on cost grounds made this role its superior again.
    // The list tracks what is true about the pins, which is the only thing that makes it worth
    // asserting.
    checks: ["tableSpecialist", "chapterReader", "imageSpecialist"],
    purpose: "Enumerate the chapter's teachable items independently, for a code-side diff.",
  },

  backwardDeduplicator: {
    envScope: "BACKWARD_DEDUPLICATOR",
    // Above the producers, like every checking role here. It only ever FLAGS, so a wrong verdict
    // costs a reviewer a glance rather than a card — but the judgement itself is the subtle one in
    // this pipeline: おかし after かし is one word with a polite prefix, ごふん after ふん is not,
    // and the two are indistinguishable without knowing that ご is the number five.
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 20 * MINUTES,
    phase: "both",
    // NO `checks`, and dropping it was the honest half of moving to `medium`. At equal model and
    // equal effort this role is the exact peer of every producer it used to name, so asserting that
    // it outranks them would assert something untrue.
    //
    // The field was never quite right for this role anyway. An adversary re-derives what a producer
    // should have found and so genuinely checks it; a deduplicator judges the MERGED corpus and has
    // no opinion about who contributed what. It reconciles candidate pairs.
    purpose: "Decide which of a new unit's cards repeat what an earlier unit already taught.",
  },

  semanticDeduplicator: {
    envScope: "SEMANTIC_DEDUPLICATOR",
    // Above every producer, and for a sharper reason than the adversary's. This role can DELETE. A
    // wrong "duplicate" verdict removes a card and nobody notices it is gone, so it outranks the
    // roles whose output it judges in BOTH phases.
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 20 * MINUTES,
    phase: "both",
    // NO `checks`, and dropping it was the honest half of moving to `medium`. At equal model and
    // equal effort this role is the exact peer of every producer it used to name, so asserting that
    // it outranks them would assert something untrue.
    //
    // The field was never quite right for this role anyway. An adversary re-derives what a producer
    // should have found and so genuinely checks it; a deduplicator judges the MERGED corpus and has
    // no opinion about who contributed what. It reconciles look-alike groups.
    purpose: "Decide which look-alike items in one corpus are the same card, and which are senses.",
  },

  gapFiller: {
    envScope: "GAP_FILLER",
    // It completes work three specialists missed and decides what earns a card. It does not declare
    // `checks`: it is not verifying the adversary, it is acting on it.
    //
    // `medium`, on measurement rather than analogy. It judges a bounded list against a corpus it is
    // handed, which is not the long-file reading task `high` buys discipline for, and it was pinned
    // `high` by analogy with the adversary when it was written. 317s per run before the change.
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 25 * MINUTES,
    phase: "base",
    purpose: "Turn the adversary's confirmed gaps into finished cards, or say why each is not one.",
  },

  // ---- Phase 2: extras ----------------------------------------------------------------------
  exerciseMiner: {
    envScope: "EXERCISE_MINER",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "extras",
    purpose: "Turn drills and worked examples into complete sentences.",
  },
  fillInBlankMiner: {
    envScope: "FILL_IN_BLANK_MINER",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "extras",
    purpose: "Resolve every blank into a complete sentence; no template reaches a card.",
  },
  exampleSentenceMiner: {
    envScope: "EXAMPLE_SENTENCE_MINER",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "extras",
    purpose: "Card the book's own Key Sentences, model sentences and dialogue lines worth keeping.",
  },
  gapAuthor: {
    envScope: "GAP_AUTHOR",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "extras",
    purpose: "Write for the gaps the deterministic coverage checks found.",
  },
  inventiveAuthor: {
    envScope: "INVENTIVE_AUTHOR",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "extras",
    // Runs LAST of the extras roles, so it can see what already exists and not reinvent it, and is
    // the only bounded one: an inventive role with no ceiling is how a unit fills with padding.
    purpose: "Add roughly 20% more practice, using only vocabulary the book has already taught.",
  },
});

/** Every declared role id. */
export const ROLE_IDS = Object.freeze(Object.keys(ROLES));

/**
 * The pinning for one role, after the environment has had its say.
 *
 * Resolution runs through the same `resolvePinning` every v1 pass uses, so there is one order in
 * the codebase and not two: `ANKI_BUILDER_<SCOPE>_*`, then `ANKI_BUILDER_LLM_*`, then the role's
 * own declaration. The role's declaration is the floor, never a fallback for a missing one.
 */
export function resolveRolePinning(id, { env = process.env } = {}) {
  const role = ROLES[id];
  if (!role) throw new Error(`unknown agent role: ${id}. Declared roles: ${ROLE_IDS.join(", ")}`);
  const previous = process.env;
  try {
    if (env !== process.env) process.env = env;
    return resolvePinning([`ANKI_BUILDER_${role.envScope}`], {
      model: role.model,
      effort: role.effort,
      timeoutMs: role.timeoutMs,
    });
  } finally {
    process.env = previous;
  }
}

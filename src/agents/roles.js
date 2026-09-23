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

import { resolvePinning, registerPinFamily } from "../util/runClaude.js";

// The ranking lives in src/util/modelRank.js so the runner's own pin-order check can read it too.
// Re-exported here because every test and caller already imports it from this file.
export { MODEL_RANK, EFFORT_RANK, capabilityRank } from "../util/modelRank.js";

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

  // ---- Reading decks: one chapter to a reading corpus -----------------------------------------
  //
  // A separate deck kind with its own rules (docs/card-rules-reading.md) and its own phase
  // (src/reading/readingPhase.js; docs/designs/reading-decks/06). The three readers are pinned like
  // phase 1's producers and the adversary above them, for the same reasons.
  readingTableReader: {
    envScope: "READING_TABLE_READER",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 15 * MINUTES,
    phase: "reading",
    purpose: "Judge a chapter's tables and read the words and characters they teach to read.",
  },
  readingChapterReader: {
    envScope: "READING_CHAPTER_READER",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 25 * MINUTES,
    phase: "reading",
    purpose: "Find what a chapter teaches to read anywhere in it, independent of markup.",
  },
  readingImageReader: {
    envScope: "READING_IMAGE_READER",
    model: "claude-sonnet-5",
    effort: "medium",
    timeoutMs: 20 * MINUTES,
    phase: "reading",
    purpose: "Read the words and characters a chapter teaches only in pictures.",
  },
  readingCoverageAdversary: {
    envScope: "READING_COVERAGE_ADVERSARY",
    // Above the three readers it checks; enumerates independently, never shown the corpus.
    model: "claude-sonnet-5",
    effort: "high",
    timeoutMs: 25 * MINUTES,
    phase: "reading",
    checks: ["readingTableReader", "readingChapterReader", "readingImageReader"],
    purpose: "Enumerate what a chapter teaches to read, independently, for a code-side diff.",
  },

  // ---- Review: the last look before any audio is paid for --------------------------------
  finalReview: {
    envScope: "FINAL_REVIEW",
    // Opus, and that is forced rather than chosen. This role names every other role in `checks`, and
    // the registry asserts a checker outranks everything it checks; `coverageAdversary` is already
    // sonnet-5/high, the top of the Sonnet range, so nothing below Opus can sit above it. The cost
    // is bounded by frequency: one call per chapter, at the end, after both corpus gates.
    model: "claude-opus-5",
    effort: "medium",
    timeoutMs: 30 * MINUTES,
    phase: "review",
    // Everything. This role is the last thing to look at a chapter before its audio is paid for, so
    // its remit is the whole pipeline's output rather than one step's.
    checks: [
      "tableSpecialist",
      "chapterReader",
      "imageSpecialist",
      "coverageAdversary",
      "backwardDeduplicator",
      "semanticDeduplicator",
      "gapFiller",
      "exerciseMiner",
      "fillInBlankMiner",
      "exampleSentenceMiner",
      "gapAuthor",
      "inventiveAuthor",
    ],
    purpose:
      "Read the built chapter against the chapter itself, plus the deterministic findings and the " +
      "agent transcripts, and say what a human reviewer would otherwise have to notice by hand.",
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

// The runner checks, before a process's first model call, that no environment override has put a
// checking role at or below a role it checks (runClaude.js, assertPinOrder).
registerPinFamily({
  family: "agents",
  pins: ROLES,
  prefixesFor: (id) => [`ANKI_BUILDER_${ROLES[id].envScope}`],
});

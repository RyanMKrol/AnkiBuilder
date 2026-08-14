/**
 * WHAT THE LIVE PROBES HAVE ACTUALLY ANSWERED — and the gate that reads it.
 *
 * Three delivery behaviours cannot be established without a live Anki collection: whether a template
 * update regenerates a card row (and whether it unsuspends), what `changeDeck` does to a card in a
 * filtered deck, and what `suspend` does to one. `scripts/anki-behaviour-probe.mjs` answers them
 * against a throwaway profile behind a fail-closed interlock, and the human-facing record is the
 * results table in `.claude/skills/build-anki-deck/references/deliver.md`.
 *
 * This file is that table's machine-readable half. Every write path that depends on an answer asks
 * `assertProbeEvidence` first, and an `answer: null` row means "not yet run" — so a gated feature
 * refuses with the NAME of the evidence it is missing rather than running on an assumption.
 *
 * ⚠️ WHEN A PROBE SESSION PRODUCES AN ANSWER, BOTH HALVES ARE UPDATED IN THE SAME COMMIT: the row
 * here (with `recorded`, the date) and the row in deliver.md. `test/anki/probeEvidence.test.js`
 * fails if an id here has no row there, so they cannot silently drift apart. Nothing writes this
 * file automatically: a probe result is read and judged by a human, and a gate that could arm itself
 * from a script's output would be arming itself from the thing it exists to check.
 */

export class ProbeEvidenceMissing extends Error {}

/**
 * One row per question the runbook's results table asks.
 *
 * `answer` is `null` until a session records one. It is deliberately free text, not a boolean: the
 * useful answers here are shapes ("moved but kept odid, so the card claims two decks"), and a
 * boolean would flatten exactly the detail the gated code has to be written against.
 */
export const PROBE_RESULTS = {
  "template-regeneration": {
    question: "does a template update regenerate a card row the writer omitted?",
    answer: null,
    recorded: null,
  },
  "template-unsuspends": {
    question: "does a template update unsuspend a suspended card?",
    answer: null,
    recorded: null,
  },
  "changedeck-on-filtered": {
    question: "what does changeDeck do to a card with a non-zero odid?",
    answer: null,
    recorded: null,
  },
  "suspend-on-filtered": {
    question: "what does suspend do to a card with a non-zero odid?",
    answer: null,
    recorded: null,
  },
  "suspend-survives-template-write": {
    question: "does a template update or a Check Database bring a suspended card back?",
    answer: null,
    recorded: null,
  },
};

/** The write paths that may not run until their probes have answers. */
export const PROBE_GATED_FEATURES = {
  "template-add": {
    flag: "--allow-template-add",
    probes: ["template-regeneration", "template-unsuspends"],
    why:
      "adding a card template to the shared note type generates a new card on EVERY existing note " +
      "of that language, in both delivered collections at once, and nobody has established whether " +
      "that write also unsuspends the direction suspensions it lands on",
  },
  refile: {
    flag: "--refile",
    probes: ["changedeck-on-filtered"],
    why:
      "moving a card whose home deck is under a custom-study session can yank it out mid-session, " +
      "and Anki's deck: search and cardsInfo disagree about which deck such a card is in",
  },
  "suspend-orphans": {
    flag: "--suspend-orphans",
    probes: ["suspend-on-filtered", "suspend-survives-template-write"],
    why:
      "suspending is only a safe way to retire a card if the suspension is durable and does not " +
      "disturb a card sitting in a filtered deck",
  },
};

/** The probe ids a feature still has no answer for. Empty means the gate is open. */
export function missingProbeEvidence(featureId, results = PROBE_RESULTS) {
  const feature = PROBE_GATED_FEATURES[featureId];
  if (!feature) throw new Error(`unknown probe-gated feature "${featureId}"`);
  return feature.probes.filter((id) => !results[id] || results[id].answer == null);
}

export const RUNBOOK = ".claude/skills/build-anki-deck/references/deliver.md";

/**
 * Refuses a probe-gated write, naming the exact evidence that is missing.
 *
 * Deliberately not overridable by a flag. The flag in `PROBE_GATED_FEATURES` is what asks for the
 * feature; this is what says the feature is not ready for anyone to ask for. An escape hatch here
 * would be a way to run the unanswered write, which is the whole thing being prevented.
 */
export function assertProbeEvidence(featureId, results = PROBE_RESULTS) {
  const missing = missingProbeEvidence(featureId, results);
  if (missing.length === 0) return;
  const feature = PROBE_GATED_FEATURES[featureId];
  throw new ProbeEvidenceMissing(
    `${feature.flag} is not available yet: ${missing.length} live-Anki behaviour probe(s) have ` +
      `never been run, so what this write does is unknown. Missing evidence:\n` +
      missing.map((id) => `  - ${id}: ${PROBE_RESULTS[id].question}`).join("\n") +
      `\nWhy it is gated: ${feature.why}.\n` +
      `Run the probes against the ANKIBUILDER-PROBE profile (never your own) with ` +
      `"node scripts/anki-behaviour-probe.mjs --check" then "--run", record the answers in ` +
      `${RUNBOOK} and in src/anki/probeEvidence.js, and re-run this command.`,
  );
}

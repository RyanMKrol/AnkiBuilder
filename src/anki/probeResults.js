// The RECORDED answers to the live-AnkiConnect behaviour probes, as data a gate can read.
//
// `.claude/skills/build-anki-deck/references/deliver.md` holds the same table for a human, with the
// date each answer was recorded. This file is what shipping code consults, because "gated on a probe"
// has to mean "gated on a recorded RESULT", not on a memory that somebody once ran something.
//
// ⚠️ HOW TO UPDATE. Run the probes against the throwaway `ANKIBUILDER-PROBE` profile
// (`node scripts/anki-behaviour-probe.mjs --check`, then `--run` — see references/deliver.md for the
// interlock and the profile ceremony). Then write the answer into BOTH places, in the same commit:
// the table in deliver.md, and the entry here. Nothing automates that: the probes touch a live
// collection and the transcription is the moment a human confirms what they saw.
//
// An entry is `null` while the probe has not been run. It is never `false` by default: "we don't
// know" and "we know it is safe" are different states, and collapsing them is exactly the silent
// degradation this project keeps finding in itself.

export const PROBE_ANSWERS = {
  /**
   * Does a template update regenerate a card row that was deleted from a live note?
   * Recorded 2026-08-17: NO. `updateModelTemplates` against a note whose second card row had been
   * deleted left the row count unchanged, so a missing card row stays missing.
   */
  "template-update-regenerates-card": false,
  /**
   * Does a template update clear a card's suspended flag?
   * Recorded 2026-08-17: NO. A suspended card was still suspended after the template write, so a
   * suspension survives a note-type update.
   */
  "template-update-unsuspends": false,
  /** What does `changeDeck` do to a card sitting in a filtered deck (non-zero `odid`)? */
  "change-deck-on-filtered": null,
  /** What does `suspend` do to a card sitting in a filtered deck (non-zero `odid`)? */
  "suspend-on-filtered": null,
  /** Does a template update or Check Database clear a suspension we applied? */
  "housekeeping-unsuspends": null,
};

/** Human-readable names, used in the error a gate throws so the operator knows what to go and run. */
const PROBE_LABELS = {
  "template-update-regenerates-card": "does a template update regenerate a deleted card row",
  "template-update-unsuspends": "does a template update unsuspend a card",
  "change-deck-on-filtered": "what changeDeck does to a card in a filtered deck",
  "suspend-on-filtered": "what suspend does to a card in a filtered deck (non-zero odid)",
  "housekeeping-unsuspends": "whether a template update or Check Database clears our suspension",
};

/** The probe ids with no recorded answer yet, out of the ones asked about. */
export function unansweredProbes(ids, answers = PROBE_ANSWERS) {
  return ids.filter((id) => answers[id] === null || answers[id] === undefined);
}

/**
 * Throws unless every named probe has a recorded answer.
 *
 * `feature` is what is being refused, so the message says what the operator wanted, what is missing,
 * and where to record it — rather than the usual "this is disabled" with no route forward.
 */
export function assertProbesRecorded(ids, feature, { answers = PROBE_ANSWERS } = {}) {
  const missing = unansweredProbes(ids, answers);
  if (!missing.length) return;
  throw new Error(
    `${feature} is gated on live-Anki behaviour probes that have not been run.\n` +
      `Missing evidence:\n` +
      missing.map((id) => `  - ${id}: ${PROBE_LABELS[id] ?? id}`).join("\n") +
      `\n\nThese decide whether the operation is safe on a card the owner is already studying — ` +
      `notably one sitting in a filtered deck, where a suspension may behave differently or be ` +
      `undone by routine housekeeping.\n` +
      `Run them against the throwaway ANKIBUILDER-PROBE profile:\n` +
      `  node scripts/anki-behaviour-probe.mjs --check   # interlock only, writes nothing\n` +
      `  node scripts/anki-behaviour-probe.mjs --run\n` +
      `then record each answer in BOTH .claude/skills/build-anki-deck/references/deliver.md and ` +
      `src/anki/probeResults.js.`,
  );
}

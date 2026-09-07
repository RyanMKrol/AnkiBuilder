import { defineCheck } from "../registry.js";
import { isPredicateShaped, predicateMarkers } from "../../cards/predicateShape.js";
import { parseUnitDir } from "../../model/unitDir.js";

/**
 * Sentences that reached a BASE unit, which is meant to hold lexical entries only.
 *
 * v2 splits a chapter in two: the base unit teaches words and fixed expressions, its extras sibling
 * teaches propositions. The split is the reason phase 2 exists, and nothing enforced it: the phases
 * put a card where their prompt says, and a prompt is a rule that holds until the day it does not.
 *
 * **Only phase-built units are judged.** A v1 base unit is 20-30% utterances by this measure and
 * that is not a defect, it is the convention those chapters were built under. "No retroactive
 * rewriting" is an explicit non-goal of v2, so flagging them would be asking a reviewer to undo
 * finished work. They are counted and named as a permanent exemption instead, so the number is a
 * known set rather than an invisible one.
 *
 * **ACK, not FAIL.** The test is lexical entry versus utterance, and no mechanical rule decides it:
 * a fixed expression the book glosses as a unit is an entry however sentence-like it looks
 * (もういちどおねがいします has a particle and a polite predicate and is one entry). See
 * `predicateShape.js` for what the heuristic can and cannot see. A tier that blocked would be
 * overridden the first time it fired.
 *
 * **Unknown, never zero.** A language with no configured markers cannot be judged, and this says so
 * rather than reporting a clean pass, which is the failure `vocabCoverage` shipped for months.
 */
export const baseSplitCheck = defineCheck({
  id: "base-split",
  title: "base unit sentences",
  scope: "collection",
  tier: "ACK",
  run({ units }) {
    const bases = units.filter((unit) => {
      const parsed = parseUnitDir(unit.name);
      return parsed && !parsed.extras;
    });
    if (bases.length === 0) return { skipped: "this collection has no base units" };

    const phaseBuilt = bases.filter((unit) => unit.meta?.phase === "base");
    const legacy = bases.filter((unit) => unit.meta?.phase !== "base");

    const notes = [];
    if (legacy.length) {
      notes.push(
        `${legacy.length} base unit(s) were built before the base/extras split and are not judged ` +
          `here: ${legacy.map((u) => u.name).join(", ")}. Not rewriting them is a deliberate ` +
          `non-goal, so this exemption is permanent and expected.`,
      );
    }

    if (phaseBuilt.length === 0) {
      return {
        notes,
        summary: `no phase-built base unit yet; ${legacy.length} legacy unit(s) exempt`,
      };
    }

    const findings = [];
    let unconfigured = 0;
    let checked = 0;

    for (const unit of phaseBuilt) {
      if (!predicateMarkers(unit.meta?.targetLanguage)) {
        unconfigured++;
        continue;
      }
      checked++;
      for (const item of (unit.items ?? []).filter((i) => !i.excluded)) {
        if (isPredicateShaped(item.target, unit.meta?.targetLanguage) !== true) continue;
        findings.push({
          key: `${unit.name}/${item.id}`,
          message:
            `${unit.name}: "${item.target}" (${item.english || "no gloss"}) reads as a sentence, ` +
            `and a base unit holds lexical entries. If it is one, it belongs in this chapter's ` +
            `extras unit; if it is a fixed expression the book glosses as a single unit, it belongs ` +
            `exactly where it is and this finding is a false positive.`,
        });
      }
    }

    if (checked === 0 && unconfigured > 0) {
      return {
        notes,
        skipped:
          `no predicate markers are configured for the language of ${unconfigured} phase-built ` +
          `unit(s), so whether they hold sentences is UNKNOWN. That is not a clean result: see ` +
          `PREDICATE_MARKERS in src/cards/predicateShape.js`,
      };
    }

    if (unconfigured > 0) {
      notes.push(
        `${unconfigured} phase-built unit(s) are in a language with no predicate markers ` +
          `configured, and were not judged either way.`,
      );
    }

    return {
      findings,
      notes,
      summary: findings.length
        ? `${findings.length} sentence-shaped card(s) across ${checked} phase-built unit(s)`
        : `${checked} phase-built base unit(s) hold lexical entries only`,
    };
  },
});

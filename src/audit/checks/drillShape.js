import { defineCheck } from "../registry.js";
import { dominantFrame } from "../../cards/drillShape.js";

/**
 * How concentrated a unit's drilling is, reported as a FACT and never as a verdict.
 *
 * INFO, permanently, and that is the finding rather than a cop-out. The threshold version of this
 * check was measured against every unit in the live book before it was written, and it flags the
 * units that are correct: the invitation lesson is 48% the invitation frame, the wish lesson 45% the
 * wish frame, because a chapter with one grammar point SHOULD drill it. What made one unit defective
 * was that its dominant frame was not its chapter's point, which this module cannot know.
 *
 * So this prints the number and stops. `scripts/drill-shape.mjs` pairs it with an agent that names
 * the chapter's grammar point and diffs the two, which is where a verdict can honestly come from.
 */

/** Below this a unit has no shape worth a line in the report. */
const REPORTABLE_SHARE = 0.35;

export const drillFrameCheck = defineCheck({
  id: "drill-frame",
  title: "drill frame",
  scope: "unit",
  tier: "INFO",
  run({ unit }) {
    const dominant = dominantFrame(unit.items);
    if (!dominant) {
      return { findings: [], summary: `too few sentences to have a dominant frame` };
    }
    const pct = Math.round(dominant.share * 100);
    if (dominant.share < REPORTABLE_SHARE) {
      return {
        findings: [],
        summary: `no frame over ${Math.round(REPORTABLE_SHARE * 100)}% (top: "${dominant.frame}" at ${pct}%)`,
      };
    }
    return {
      findings: [
        {
          key: `frame::${dominant.frame}`,
          message:
            `${dominant.count} of ${dominant.total} sentence(s) end with "${dominant.frame}" (${pct}%) — ` +
            `concentration is only a defect when that frame is NOT this chapter's grammar point, ` +
            `which this check cannot know. Run scripts/drill-shape.mjs to have that judged.`,
        },
      ],
      summary: `dominant frame "${dominant.frame}" at ${pct}%`,
    };
  },
});

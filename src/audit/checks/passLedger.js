import { defineCheck } from "../registry.js";
import { failedPasses } from "../../cards/passLedger.js";

/**
 * A unit whose model passes did not all complete is not a finished unit, however complete it looks.
 *
 * This is the check that was missing when a lesson reached its review gate with the romanization
 * correction never having run: every card had a plausible-looking romaji, the style lint passed, and
 * the only thing that knew something was wrong was a log line that had already scrolled away. A pass
 * that fails now says so on the unit, and this refuses to let the unit present itself as ready.
 *
 * Silent for every unit built before the ledger existed: no `meta.passes`, nothing to report. It
 * fills in as units are rebuilt, rather than retroactively reddening finished work.
 */
export const passLedgerCheck = defineCheck({
  id: "pass-ledger",
  title: "model passes",
  scope: "unit",
  tier: "FAIL",
  run({ unit }) {
    const failed = failedPasses(unit.cards?.meta ?? {});
    if (failed.length === 0) return { findings: [] };
    return {
      findings: failed.map(([name, reason]) => ({
        key: `${name}`,
        message:
          `the ${name} pass did not complete${reason ? ` (${reason})` : ""}. Its output is missing ` +
          `from this unit, so the card set is not final. Re-run it — ` +
          `\`node scripts/recover-extraction-passes.mjs <runDir>\` covers the passes an ordinary ` +
          `re-run cannot reach.`,
      })),
      summary: `${failed.length} pass(es) did not complete: ${failed.map(([n]) => n).join(", ")}`,
    };
  },
});

import { defineCheck } from "../registry.js";
import { unitChapterNumber } from "../units.js";
import { parseUnitDir } from "../../model/unitDir.js";
import { missingCarriedForms } from "../../cards/carriedForms.js";

/**
 * Verbs that never got a form the book had already taught (src/cards/carriedForms.js).
 *
 * Phase 1 fills these as it builds, so on a new lesson this should find nothing. It exists for the
 * lessons built before that, and for a reviewer who excludes a carried card: the gap reopens, and
 * this says so rather than letting the deck quietly lose the form again. Owner ruling 2026-10-12.
 *
 * Each finding names the base unit the form belongs in, which is the lesson that taught the verb, or
 * the lesson that introduced the form when the verb came earlier.
 *
 * ACK, not FAIL: a verb that is really a fixed expression has no useful dictionary form, and that is
 * a judgement. Accept it once and the count stays honest.
 */
export const carriedFormsCheck = defineCheck({
  id: "carried-forms",
  title: "carried forms",
  scope: "collection",
  tier: "ACK",
  run({ units }) {
    const ordered = units
      .map((unit) => ({ unit, number: unitChapterNumber(unit.meta) }))
      .filter((u) => u.number !== null)
      .sort((a, b) => a.number - b.number);
    const bases = ordered.filter(({ unit }) => {
      const parsed = parseUnitDir(unit.name);
      return parsed && !parsed.extras;
    });
    if (bases.length === 0) return { skipped: "no base units carry a chapter number" };

    const findings = [];
    let unconfigured = 0;
    for (const { unit, number } of bases) {
      const priorItems = ordered
        .filter((u) => u.number < number)
        .flatMap((u) => u.unit.items ?? []);
      const gaps = missingCarriedForms(unit.items ?? [], {
        priorItems,
        languageCode: unit.meta?.targetLanguage,
      });
      if (gaps === null) {
        unconfigured++;
        continue;
      }
      for (const gap of gaps) {
        findings.push({
          key: `${unit.name}/${gap.sourceId ?? gap.target}/${gap.carriedForm}`,
          message:
            `${unit.name}: ${gap.target} (${gap.english || "no gloss"}) has no ${gap.carriedForm} ` +
            `card, and the book taught that form by this lesson. Add it to ${unit.name} as an ` +
            `AI-suggested card, with an extras sentence that uses it.`,
        });
      }
    }

    if (unconfigured === bases.length) {
      return {
        skipped:
          "no carried forms are configured for this collection's language, so whether its verbs " +
          "have them is UNKNOWN. See CARRIED_FORMS in src/cards/carriedForms.js",
      };
    }
    return {
      findings,
      summary: findings.length
        ? `${findings.length} verb(s) missing a form the book had already taught`
        : `${bases.length} base unit(s): every verb has the forms the book had taught by then`,
    };
  },
});

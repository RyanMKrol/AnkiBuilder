import { defineCheck } from "../registry.js";
import { unitChapterNumber } from "../units.js";
import { findTaughtNeverUsed } from "../../cards/taughtNeverUsed.js";

/**
 * Cards that teach a word the lesson never uses in anything longer.
 *
 * Grouped by `chapterNumber`, so a base unit and its `-extras` sibling are judged as ONE product:
 * the extras unit is where the base unit's bare vocabulary is meant to get used, so judging either
 * alone gives the wrong answer for both. That grouping stays strictly inside one collection, which
 * is where the boundary is.
 *
 * INFO, and it should stay INFO. A legitimately standalone card — an exclamation, a greeting, a
 * fixed reply — is indistinguishable from a stranded one without reading the gloss, and a tier that
 * blocked would be overridden on its first run.
 */
export const taughtNeverUsedCheck = defineCheck({
  id: "taught-never-used",
  title: "taught, never used",
  scope: "collection",
  tier: "INFO",
  run({ units }) {
    const byChapter = new Map();
    for (const unit of units) {
      const number = unitChapterNumber(unit.meta);
      if (number === null) continue;
      const shipping = (unit.items ?? []).filter((item) => !item.excluded);
      if (!byChapter.has(number)) byChapter.set(number, []);
      byChapter.get(number).push(...shipping.map((item) => ({ ...item, __unit: unit.name })));
    }
    if (byChapter.size === 0) return { skipped: "no units carry a chapter number" };

    const findings = [];
    for (const [, cards] of [...byChapter].sort((a, b) => a[0] - b[0])) {
      for (const card of findTaughtNeverUsed(cards)) {
        findings.push({
          key: `${card.__unit}/${card.id}`,
          // Named by UNIT, never by chapterNumber: that number is a spine index, so "lesson 11" for
          // a unit the reader knows as chapter-0 is a wrong fact rather than a terse one.
          message:
            `${card.__unit}: "${card.target}" (${card.english || "no gloss"}) is taught on its own ` +
            `and appears inside no other card of this lesson or its extras. Either it belongs in a ` +
            `sentence — which is the extras pass's job — or it is one of the words that legitimately ` +
            `stands alone (an exclamation, a greeting, a fixed reply).`,
        });
      }
    }

    return {
      findings,
      summary: `${byChapter.size} lesson(s) checked for words taught but never used`,
    };
  },
});

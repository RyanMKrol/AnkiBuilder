import { existsSync, readFileSync } from "fs";
import { defineCheck } from "../registry.js";
import { unitChapterNumber } from "../units.js";
import { chapterCachePath, chapterRangeCachePath } from "../../corpus/epubLibrary.js";
import { parseVocaEntries, findUncoveredVocab } from "../../cards/vocabCoverage.js";

// Did the extraction drop a whole vocabulary block?
//
// SKILL.md has ruled twice that this check is "a script, not a read-through", and
// scripts/vocab-coverage.mjs is that script for one unit. This is the same matching run over every
// unit of a book at once, so the answer is on the preflight report rather than only in whoever
// remembered to run it.
//
// INFO, deliberately, and it is not shyness. The check has KNOWN false positives that only a human
// can dismiss — a book prints its own vocabulary in ways no string match resolves, and the report
// carries the nearest card target precisely so dismissing one takes a glance. A tier that blocks
// would be overridden on its first run, and an override that becomes habit is worse than no check.
// Promote it once a book's live count has been looked at and is genuinely zero-or-explained.

function chapterFileFor(meta, { libraryHomeDir } = {}) {
  const number = unitChapterNumber(meta);
  if (!meta?.epubHash || number === null) return null;
  const last = meta.lastChapterNumber;
  const path =
    typeof last === "number" && last > number
      ? chapterRangeCachePath(meta.epubHash, number, last, { libraryHomeDir })
      : chapterCachePath(meta.epubHash, number, { libraryHomeDir });
  return existsSync(path) ? path : null;
}

export const vocabCoverageCheck = defineCheck({
  id: "vocab-coverage",
  title: "vocab coverage",
  scope: "collection",
  tier: "INFO",
  appliesTo: (collection) => collection.kind === "epub",
  /**
   * Every headword in each chapter's own `<table class="voca">` blocks, diffed against that unit's
   * card targets.
   *
   * Only BASE units are checked. An `-extras` unit is drills mined from the same chapter, so its
   * vocabulary is the base unit's by construction and diffing it would report the whole block twice.
   *
   * Skips rather than passes when the chapter cache is not on this machine: the cache is not tracked
   * (it is a free re-inflate of the EPUB), so a fresh clone has none of it, and a check that reports
   * "all covered" for files it never opened is the exact failure this module exists to prevent.
   */
  run({ units, workspace }) {
    const libraryHomeDir = workspace?.libraryHomeDir;
    const candidates = units.filter((unit) => !unit.extras && unit.meta?.epubHash);
    if (candidates.length === 0) return { skipped: "no --epub units with a book hash" };

    const findings = [];
    let checked = 0;
    let uncached = 0;

    for (const unit of candidates) {
      const chapterFile = chapterFileFor(unit.meta, { libraryHomeDir });
      if (!chapterFile) {
        uncached++;
        continue;
      }
      checked++;

      const entries = parseVocaEntries(readFileSync(chapterFile, "utf-8"));
      for (const miss of findUncoveredVocab(entries, unit.items ?? [])) {
        findings.push({
          key: `${unit.name}/${miss.target}`,
          message:
            `${unit.name}: "${miss.target}" (${miss.english || "no gloss"}) is a vocabulary ` +
            `headword in the chapter and appears in no card's target` +
            (miss.nearest
              ? `. Nearest card target: ${miss.nearest}`
              : ". Nothing in the unit is close"),
        });
      }
    }

    if (checked === 0) {
      return {
        skipped:
          `no cached chapter file for any of the ${candidates.length} unit(s) — the chapter cache ` +
          `is a free re-inflate of the EPUB and is not tracked, so run an assemble for this book ` +
          `first`,
      };
    }

    return {
      findings,
      summary: `${checked} chapter(s) diffed against their own vocabulary tables`,
      notes: uncached
        ? [`${uncached} unit(s) had no cached chapter file and were not checked`]
        : [],
    };
  },
});

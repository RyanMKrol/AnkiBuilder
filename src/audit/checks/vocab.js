import { existsSync, readFileSync } from "fs";
import { defineCheck } from "../registry.js";
import { unitChapterNumber, unitLanguage } from "../units.js";
import {
  chapterCachePath,
  chapterRangeCachePath,
  loadBookHints,
} from "../../corpus/epubLibrary.js";
import { parseVocabularyEntries, findUncoveredVocab } from "../../cards/vocabCoverage.js";

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
    let unconfigured = 0;

    for (const unit of candidates) {
      const chapterFile = chapterFileFor(unit.meta, { libraryHomeDir });
      if (!chapterFile) {
        uncached++;
        continue;
      }
      // The selector is the BOOK's, from its hints, and there is no default. A book that records
      // none cannot be diffed, and this check says so rather than reporting a clean zero — which is
      // exactly what it used to do on any book not marking its tables `class="voca"`.
      const hints = loadBookHints(unit.meta?.epubHash, { libraryHomeDir });
      const entries = parseVocabularyEntries(readFileSync(chapterFile, "utf-8"), {
        tableClass: hints.vocabularyTableClass,
        subRowClass: hints.vocabularySubRowClass,
      });
      if (entries === null) {
        unconfigured++;
        continue;
      }
      checked++;

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

    if (checked === 0 && unconfigured > 0) {
      return {
        skipped:
          `this book records no hints.vocabularyTableClass, so which of its tables are vocabulary ` +
          `is unknown and ${unconfigured} unit(s) could not be diffed. That is not a clean result: ` +
          `add the selector to the book's hints, or let the table specialist judge them`,
      };
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
      summary:
        `${checked} chapter(s) diffed against their own vocabulary tables` +
        (unconfigured ? `, ${unconfigured} not diffed (book records no selector)` : ""),
      notes: uncached
        ? [`${uncached} unit(s) had no cached chapter file and were not checked`]
        : [],
    };
  },
});

// A place name carded as a word: とうきょうタワー, えびすえき, ぎんざどおり.
//
// A proper name is not a card, and a named facility is a name even when the book's vocabulary list
// carries it (docs/card-rules-shared.md; DECISIONS.md, "A proper name is not a card"). Lesson 19
// shipped three such cards because the book listed them and nothing looked again. The shape is easy
// to spot: a name in kana followed by the common noun it is built on.
//
// INFO, because the shape is not proof. ビジネスホテル is built the same way and is a common noun,
// and only a human can tell the two apart. The finding names the common noun to card instead.
//
// Japanese only, and only cards the book's vocabulary put there: a base unit's word card that no
// agent authored. A name inside a sentence is fine, which is why sentences are not looked at, and an
// extras unit is drills, not the book's list.
const PLACE_SUFFIXES = ["タワー", "えき", "どおり", "デパート", "ホテル", "こうえん"];
const PLACE_NAME = new RegExp(`^[\\u3041-\\u309f\\u30a0-\\u30ff]+?(${PLACE_SUFFIXES.join("|")})$`);
// A word card has no space and no sentence punctuation in its target.
const NOT_A_WORD = /[\s\u3000。、？！?!.,]/;

/** The place suffix a card's target ends in after a name, or null. */
export function placeNameSuffix(target) {
  const text = String(target ?? "");
  if (NOT_A_WORD.test(text)) return null;
  const match = PLACE_NAME.exec(text);
  return match ? match[1] : null;
}

export const placeNameCardCheck = defineCheck({
  id: "place-name-card",
  title: "place name carded as a word",
  scope: "unit",
  tier: "INFO",
  run({ unit }) {
    if (unitLanguage(unit) !== "ja") return { findings: [], summary: "not a Japanese unit" };
    if (unit.extras) return { findings: [], summary: "extras unit: not the book's vocabulary" };

    const findings = [];
    let checked = 0;
    for (const item of unit.items ?? []) {
      if (item.excluded || item.aiSuggested || item.fillInBlank) continue;
      checked++;
      const suffix = placeNameSuffix(item.target);
      if (!suffix) continue;
      findings.push({
        key: `${unit.name}/${item.id}`,
        message:
          `${unit.name}/${item.id}: "${item.target}" (${item.english}) looks like a place name ` +
          `carded as vocabulary. A named facility is a name even when the book lists it: card ` +
          `the common noun ${suffix} instead and exclude this one, or accept it if it is a ` +
          `common noun`,
      });
    }
    return { findings, summary: `${checked} vocabulary card(s) checked for place names` };
  },
});

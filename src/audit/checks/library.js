import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { defineCheck } from "../registry.js";
import { libraryHome } from "../../model/index.js";
import { unitChapterNumber } from "../units.js";

// The two guards on the dedup library — `.anki-builder/epubs/<hash>/corpora/<chapterNumber>.json`,
// the backward-dedup input every later chapter of a book is checked against. Its failure mode is
// silent in both directions: a MISSING entry means a later chapter is deduped against a book with
// a hole in it (three lessons were missing once; twelve repeats shipped unflagged), and an entry
// written by the WRONG unit overwrites a real one with no trace.

function corporaDir(epubHash, { libraryHomeDir } = {}) {
  return join(libraryHomeDir ?? libraryHome(), "epubs", epubHash, "corpora");
}

export const extrasLibraryWriteCheck = defineCheck({
  id: "extras-library-write",
  title: "extras/library",
  scope: "collection",
  tier: "FAIL",
  appliesTo: (collection) => collection.kind === "epub",
  /**
   * The preflight MIRROR of the refusal in `markCardsReviewed` (src/server/adapters/applyCards.js).
   *
   * The library save keys purely on `(epubHash, chapterNumber)`, and a unit shares its
   * `chapterNumber` with its own `-extras` sibling by design — chapter-13 and chapter-13-extras are
   * both 33 today. So the moment an `-extras` unit carries an `epubHash`, signing it off in the
   * dashboard writes the drill cards over the base chapter's dedup entry, and every later chapter
   * is then deduped against the drills instead of the lesson. Nothing reports it; the file is simply
   * different afterwards.
   *
   * What saves the live book right now is an accident: no `-extras` unit happens to carry an
   * `epubHash`, because the field is written by assemble and an extras unit is hand-authored. One
   * copied `meta` block is all it would take. The code refuses the write; this asserts the
   * precondition never arises, so the accident cannot quietly become the situation.
   */
  run({ units }) {
    const findings = units
      .filter((unit) => unit.extras && unit.meta?.epubHash && unitChapterNumber(unit.meta) !== null)
      .map((unit) => ({
        key: `${unit.name}/epubHash`,
        message:
          `${unit.name} is an -extras unit carrying both epubHash and chapterNumber ` +
          `(${unitChapterNumber(unit.meta)}). Those two fields are the dedup library's key, and the ` +
          `base chapter already owns that key — signing this unit off would overwrite the base ` +
          `chapter's corpora entry with drill cards. Remove epubHash from this unit's meta.`,
      }));
    return { findings, summary: "no -extras unit claims a library key" };
  },
});

export const libraryCompletenessCheck = defineCheck({
  id: "library-completeness",
  title: "dedup library",
  scope: "collection",
  tier: "FAIL",
  appliesTo: (collection) => collection.kind === "epub",
  /**
   * Both directions of "does the dedup library match this book's reviewed chapters".
   *
   * FORWARD (the failure): a reviewed unit with no `corpora/<n>.json`. The library is written by the
   * dashboard's Mark reviewed, so a chapter reviewed before that side effect existed — or one whose
   * write failed — leaves a hole, and every later chapter is deduped against a book missing it.
   *
   * REVERSE (reported, not failed): a `corpora/<n>.json` no reviewed unit accounts for. This is what
   * would have surfaced the `.anki-builder/epubs/h1/` test leak on day one instead of five reviewers
   * finding it months later. It is not a failure because a legitimately deleted run dir leaves the
   * same trace, and deleting a library entry is a judgement.
   */
  run({ units, workspace }) {
    const libraryHomeDir = workspace?.libraryHomeDir;
    const hashes = new Set(
      units.map((unit) => unit.meta?.epubHash).filter((hash) => typeof hash === "string"),
    );
    if (hashes.size === 0) return { skipped: "no unit declares an epubHash" };
    if (hashes.size > 1) {
      return {
        findings: [...hashes].map((hash) => ({
          key: `mixed-hash/${hash}`,
          message: `this collection's units claim ${hashes.size} different epubHashes — one of them is not this book`,
        })),
      };
    }

    const epubHash = [...hashes][0];
    const dir = corporaDir(epubHash, { libraryHomeDir });
    if (!existsSync(dir)) {
      return { skipped: `no dedup library on this machine (${dir})` };
    }

    const stored = new Set(
      readdirSync(dir)
        .filter((name) => /^\d+\.json$/.test(name))
        .map((name) => Number(name.replace(/\.json$/, ""))),
    );

    const findings = [];
    const expected = new Set();
    for (const unit of units) {
      if (!unit.meta?.reviewed || unit.extras) continue;
      const number = unitChapterNumber(unit.meta);
      if (number === null) continue;
      expected.add(number);
      if (!stored.has(number)) {
        findings.push({
          key: `${unit.name}/missing-corpus`,
          message:
            `${unit.name} is reviewed but has no ${join(dir, `${number}.json`)} — later chapters ` +
            `are being deduped against a book that is missing this lesson. Re-open and re-review it, ` +
            `or restore the entry.`,
        });
      }
    }

    const orphans = [...stored].filter((n) => !expected.has(n)).sort((a, b) => a - b);
    return {
      findings,
      notes: orphans.length
        ? [
            `${orphans.length} library entr(ies) no reviewed unit accounts for: ${orphans.join(", ")} ` +
              `— a deleted run dir, or something that was never this book`,
          ]
        : [],
      summary: `${expected.size} reviewed chapter(s), all present in the library`,
    };
  },
});

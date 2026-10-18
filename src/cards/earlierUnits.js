// Every unit of a collection that comes BEFORE the one being built, base and extras alike.
//
// WHY THIS IS NOT `loadPriorChapterItems`. That reads the dedup library at
// `.anki-builder/epubs/<hash>/corpora/<n>.json`, which is keyed `(epubHash, chapterNumber)`. An
// `-extras` unit shares its base unit's chapter number, so writing one to that library would
// overwrite the base chapter's entry and every later chapter would be deduped against the drills
// instead of the lesson. The dashboard refuses the write and a FAIL-tier check
// (`extras-library-write`) asserts no extras unit can ever claim the key.
//
// The consequence is that extras content is invisible to backward dedup, permanently. On the live
// book that is 1,163 targets a new chapter cannot see, next to the 1,176 it can: half the collection.
//
// So this reads the units off disk instead. The key collision is a property of how that library file
// is STORED, not of the comparison, and nothing about comparing a new card against an earlier one
// needs the library to exist.
//
// WHY IT READS cards.json AND NOT THE LIBRARY'S COPY. `cards.json` is the live file, so it reflects
// exclusions and edits made since the unit was signed off. For "has the learner already met this",
// current is the right answer, and `prepare` already reads sibling `cards.json` files for the note
// and drill passes.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseUnitDir } from "../model/unitDir.js";
import { isPredicateShaped } from "./predicateShape.js";

// WHY ORDER IS THE BOOK'S AND NOT THE FOLDER'S. "Earlier" means earlier in the BOOK, which is
// `meta.chapterNumber` (the lesson's first spine index; see the invariant in src/audit/units.js).
// The `<n>` in `chapter-<n>` is only the order the units were BUILT in, and the two part ways the
// moment a supplement is built late: Busy People's chapter-25 sits at spine 40, between chapter-17
// (39) and chapter-18 (42). Sorting by folder number made chapter-25 "later" than all of 18 to 24,
// so their builds never saw its words as taught, and it saw all of theirs as taught although the
// book puts them after it (QA ruling 1, 2026-10-18). A base unit still counts as earlier than its
// own extras sibling, which shares its chapterNumber.

/** `meta.chapterNumber` when it is a number, else null (the rule `unitChapterNumber` uses). */
function unitChapterNumber(meta) {
  const value = meta?.chapterNumber;
  return typeof value === "number" ? value : null;
}

/** A unit's cards.json, parsed, or null when it is missing or will not parse. */
function readUnitCards(collectionDir, name) {
  const file = join(collectionDir, name, "cards.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    // A unit that will not parse is the schema check's problem, not this one's. Skipping it loses
    // prior art rather than crashing a build over a file this module does not own.
    return null;
  }
}

/** Book position: chapterNumber, with an extras unit just after its base. */
const rank = (chapterNumber, extras) => chapterNumber * 2 + (extras ? 1 : 0);

/**
 * Every unit of the collection with its parsed cards.json and its book position, in book order.
 * A unit that declares no `meta.chapterNumber` has no place in the book and is skipped, like one
 * that will not parse; every unit `assemble` writes is stamped with one.
 */
function unitsInBookOrder(collectionDir) {
  const units = [];
  for (const name of readdirSync(collectionDir)) {
    const unit = parseUnitDir(name);
    if (!unit) continue;
    const parsed = readUnitCards(collectionDir, name);
    const chapterNumber = unitChapterNumber(parsed?.meta);
    if (!parsed || chapterNumber === null) continue;
    units.push({ unit, parsed, chapterNumber, rank: rank(chapterNumber, unit.extras) });
  }
  return units.sort((a, b) => a.rank - b.rank || a.unit.name.localeCompare(b.unit.name));
}

/**
 * The book position of the unit being built: the caller's `chapterNumber` when given, else its own
 * cards.json, else (for an extras unit) its base sibling's. A unit on its first build has no
 * cards.json yet, which is why every build script passes the number it is building.
 */
function selfChapterNumber(collectionDir, self, chapterNumber) {
  if (typeof chapterNumber === "number") return chapterNumber;
  const own = unitChapterNumber(readUnitCards(collectionDir, self.name)?.meta);
  if (own !== null) return own;
  if (self.extras) {
    const baseName = self.name.replace(/-extras$/, "");
    return unitChapterNumber(readUnitCards(collectionDir, baseName)?.meta);
  }
  return null;
}

/**
 * Shipping items from every unit ordered before `unitName` in the book, each stamped `__unit`.
 *
 * Ordering is by `meta.chapterNumber` (spine), with a base unit counting as earlier than its own
 * extras sibling: the extras unit is built FROM the base unit's approved vocabulary, so the base
 * unit is prior art for it by construction. Items come back in book order.
 *
 * `options.chapterNumber` is the position of the unit being built. It is required when that unit
 * has no cards.json yet (a first build); without it, and with nothing on disk to read it from, this
 * throws rather than guess, because a guess from the folder number is exactly the bug above.
 *
 * Returns `[]` for a collection directory that does not exist, which is the shadow-run and
 * first-chapter case rather than an error.
 */
export function loadEarlierUnitItems(collectionDir, unitName, { chapterNumber } = {}) {
  if (!collectionDir || !existsSync(collectionDir)) return [];
  const self = parseUnitDir(unitName);
  if (!self) return [];

  const ownNumber = selfChapterNumber(collectionDir, self, chapterNumber);
  if (ownNumber === null) {
    throw new Error(
      `loadEarlierUnitItems: no book position for ${unitName}. Pass { chapterNumber } (its first ` +
        `spine index), since the folder number is not the book's order.`,
    );
  }
  const selfRank = rank(ownNumber, self.extras);

  const items = [];
  for (const { unit, parsed, rank: unitRank } of unitsInBookOrder(collectionDir)) {
    if (unitRank >= selfRank || unit.name === unitName) continue;
    for (const item of parsed.items ?? []) {
      if (item?.excluded) continue;
      items.push({ ...item, __unit: unit.name, __chapterLabel: parsed.meta?.chapterLabel ?? null });
    }
  }
  return items;
}

/**
 * The vocabulary a phase-2 role may USE when building the chapter at book position
 * `beforeChapterNumber` (its `meta.chapterNumber`, the first spine index, NOT its folder number):
 * every shipping card of every base unit the book puts earlier, plus the lexical entries of every
 * extras unit the book puts earlier. "Taught" means taught by the book's order, so a supplement
 * built late is judged where the book puts it.
 *
 * Extras units used to be left out entirely, on the reasoning that a drill sentence does not teach
 * the words inside it, and counting one would make every word of every drill look taught. That half
 * still holds, so sentence cards stay out. But an extras unit also holds real vocabulary: pathway 2
 * retrofits land there (Lesson 7's extras teach どうやって, from the Nihongo 102 notes), and so do
 * words like chapter-9-extras' おとうと. Leaving those out made Lesson 20's miners drop the chapter's
 * own title question, どうやって X に いきますか, as untaught.
 *
 * So an extras card counts when `isPredicateShaped` says it is NOT a sentence. For a language with no
 * markers that returns null, and null keeps the card out: the old strict rule, which fails safe.
 * Different from `loadEarlierUnitItems`, which is prior art for backward dedup and reads everything.
 */
export function loadEarlierTaughtItems(collectionDir, beforeChapterNumber, targetLanguage) {
  if (!collectionDir || !existsSync(collectionDir)) return [];
  const items = [];
  for (const { unit, parsed, chapterNumber } of unitsInBookOrder(collectionDir)) {
    if (chapterNumber >= beforeChapterNumber) continue;
    for (const item of parsed.items ?? []) {
      if (item?.excluded) continue;
      if (unit.extras && isPredicateShaped(item.target, targetLanguage) !== false) continue;
      items.push(item);
    }
  }
  return items;
}

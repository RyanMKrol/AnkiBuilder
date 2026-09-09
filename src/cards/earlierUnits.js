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

/**
 * Shipping items from every unit ordered before `unitName`, each stamped `__unit`.
 *
 * Ordering is by unit number, with a base unit counting as earlier than its own extras sibling: the
 * extras unit is built FROM the base unit's approved vocabulary, so the base unit is prior art for
 * it by construction.
 *
 * Returns `[]` for a collection directory that does not exist, which is the shadow-run and
 * first-chapter case rather than an error.
 */
export function loadEarlierUnitItems(collectionDir, unitName) {
  if (!collectionDir || !existsSync(collectionDir)) return [];
  const self = parseUnitDir(unitName);
  if (!self) return [];

  const rank = (unit) => unit.number * 2 + (unit.extras ? 1 : 0);
  const selfRank = rank(self);

  const items = [];
  for (const name of readdirSync(collectionDir).sort()) {
    const unit = parseUnitDir(name);
    if (!unit || rank(unit) >= selfRank) continue;
    const file = join(collectionDir, name, "cards.json");
    if (!existsSync(file)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      // A unit that will not parse is the schema check's problem, not this one's. Skipping it loses
      // prior art rather than crashing a build over a file this module does not own.
      continue;
    }
    for (const item of parsed.items ?? []) {
      if (item?.excluded) continue;
      items.push({ ...item, __unit: name, __chapterLabel: parsed.meta?.chapterLabel ?? null });
    }
  }
  return items;
}

// A chapter's two units, and the single audio gate they share.
//
// WHAT v2 CHANGES, AND WHAT IT DOES NOT. Each unit still moves through `corpus` then `audio`, and
// `meta.reviewed` / `meta.done` still mean exactly what they meant: they drive package selection and
// delivery, and v2 is not redesigning them. The per-unit stage machinery needed no change at all,
// which is worth stating because the plan described this task as adding a stage.
//
// What changes is that a chapter's TWO units share one audio review. v1 gave each unit its own pair
// of gates, so a chapter cost four sign-offs and the extras unit's arc began months after the base
// unit's. v2 runs base, then extras, then audio for both, which is three gates instead of four.
//
// WHY THE GATE IS CHAPTER-LEVEL RATHER THAN PER UNIT. Audio must not start until every card that
// will ship has been approved. With two units that means both corpus reviews, not one: generating
// the base unit's clips between the two reviews is not wrong, but it splits one review into two and
// re-introduces the second visit the design removed.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseUnitDir } from "../model/unitDir.js";

/** The units belonging to one chapter: its base unit and its `-extras` sibling, if that exists. */
export function chapterUnits(collectionDir, chapterNumber, { readdir } = {}) {
  const names = (readdir ?? readdirSync)(collectionDir);
  return names
    .map((name) => ({ name, unit: parseUnitDir(name) }))
    .filter(({ unit }) => unit && unit.number === chapterNumber)
    .map(({ name, unit }) => ({
      name,
      dir: join(collectionDir, name),
      extras: unit.extras,
      meta: readMeta(join(collectionDir, name)),
    }))
    .sort((a, b) => Number(a.extras) - Number(b.extras));
}

function readMeta(unitDir) {
  const path = join(unitDir, "cards.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")).meta ?? {};
  } catch {
    return null;
  }
}

/**
 * Whether a chapter's audio may run, and why not when it may not.
 *
 * `ok` is false with a reason rather than a bare boolean, because "not yet" and "this chapter has no
 * extras unit" and "the extras unit was never built" call for different next actions and a caller
 * that cannot tell them apart will guess.
 */
export function chapterAudioReadiness(units) {
  if (!units.length) {
    return { ok: false, reason: "no units found for this chapter" };
  }
  const missingCards = units.filter((u) => u.meta === null);
  if (missingCards.length) {
    return {
      ok: false,
      reason: `${missingCards.map((u) => u.name).join(", ")} has no readable cards.json`,
    };
  }
  const unreviewed = units.filter((u) => u.meta.reviewed !== true);
  if (unreviewed.length) {
    return {
      ok: false,
      reason:
        `${unreviewed.map((u) => u.name).join(", ")} not signed off at the corpus gate. A chapter's ` +
        `audio covers both its units, so it waits for both reviews rather than splitting into two.`,
    };
  }
  if (!units.some((u) => u.extras)) {
    return {
      ok: false,
      reason:
        `this chapter has no -extras unit. Phase 2 runs after the base review and before audio, so ` +
        `an absent extras unit means the chapter is not finished rather than that it has none.`,
    };
  }
  return { ok: true, reason: null, units: units.map((u) => u.name) };
}

/** Units of a chapter still awaiting the shared audio sign-off. */
export function awaitingDone(units) {
  return units.filter((u) => u.meta?.reviewed === true && u.meta?.done !== true);
}

/** True when every unit of the chapter carries `done`, which is what the package build selects on. */
export function chapterIsDone(units) {
  return units.length > 0 && units.every((u) => u.meta?.done === true);
}

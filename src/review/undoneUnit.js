import { readFileSync } from "fs";
import { join, resolve } from "path";
import { copyFileAtomic, writeFileAtomic } from "../util/atomicWrite.js";
import { validateCards as defaultValidateCards } from "../model/index.js";

// Pulling a finished unit back out of the shipping package.
//
// `Mark done` has no opposite in the dashboard: the old Reopen button went away when done lessons
// became fully editable, and `setLessonDone(runDir, false)` is the only programmatic path (see
// applyCards.js). That left "undo a mis-clicked Mark done" as a hand edit of a live, daily-studied
// unit's JSON — the one operation most worth having reviewed code for. This is that code; the
// rebuild half lives in scripts/undone-unit.mjs, which calls this and then rebuilds the collection.
//
// What it deliberately does NOT do: touch Anki. A unit whose cards have already been delivered stays
// delivered — clearing `done` only removes it from the next package build. Removing the notes from
// the live collection is a separate, human decision.

/** `cards.json.pre-undone-<stamp>.bak` — stamped, so re-running can never clobber its own restore point. */
export function undoneBackupPath(cardsPath, at = new Date()) {
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  return `${cardsPath}.pre-undone-${stamp}.bak`;
}

/**
 * Clears `meta.done` on a unit, backing the file up first and validating the result before it is
 * published. Returns `{ changed, cardsPath, backupPath }`; `changed: false` (with a `reason`) when
 * the unit was not done in the first place, so a re-run is a no-op rather than an error.
 */
export function undoneUnit(
  runDir,
  { at = new Date(), validateCards = defaultValidateCards, backupFile = copyFileAtomic } = {},
) {
  const cardsPath = join(resolve(runDir), "cards.json");
  let data;
  try {
    data = JSON.parse(readFileSync(cardsPath, "utf-8"));
  } catch (e) {
    throw new Error(`cannot read ${cardsPath}: ${e.message}`);
  }

  if (data.meta?.done !== true) {
    return { changed: false, cardsPath, backupPath: null, reason: "this unit is not marked done" };
  }

  const backupPath = undoneBackupPath(cardsPath, at);
  backupFile(cardsPath, backupPath);

  delete data.meta.done;
  validateCards(data);
  writeFileAtomic(cardsPath, JSON.stringify(data, null, 2));

  return { changed: true, cardsPath, backupPath };
}

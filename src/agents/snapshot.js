// The corpus exactly as the agents produced it, before any human touched it.
//
// WHY IT HAS TO EXIST BEFORE ANYTHING WRITES A CORPUS. The learning pass turns a reviewer's own
// corrections into feedback on the agent that caused them, and every edit, exclusion and re-wording
// made at a gate is free ground truth about where a role was wrong. That signal is only computable
// as a DIFF, and the dashboard edits `cards.json` in place, so without a copy taken before the
// review there is nothing to diff against. Retrofitting this later does not recover the runs that
// happened in between; it only starts the clock again.
//
// WHY PROVENANCE LIVES HERE AND NOT ON THE CARD. "Which role produced this item" is a fact about
// the build, not about the flashcard, and the card schema is a contract with a live Anki collection
// that v2 is not redesigning. Keeping the map in the snapshot means the learning pass can attribute
// a reviewer's change to a role without a shipped card carrying a field no learner will ever see,
// and without an id-to-role mapping leaking into the delivery path.
//
// WHY WRITING IS ONE-SHOT. "Immutable" is not a property of a file, it is a property of the code
// allowed to write it. `writeSnapshot` refuses to overwrite, and the dashboard never imports this
// module, so the review cannot quietly rebase its own baseline. A second write is a bug in a phase
// script, and it should say so rather than silently making the diff read clean.
//
// NOT TRACKED IN GIT, deliberately. It is build scratch with a defined lifetime: written by a phase
// script, consumed by the learning pass, meaningless afterwards. `.gitignore` already excludes
// everything under `output/` that is not explicitly re-included, so it stays out without an edit.
// What is worth keeping long-term is the learning pass's REPORT, and that is G3's decision to make.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";

/** The snapshot file inside a unit's run directory. */
export const SNAPSHOT_FILE = "as-generated.json";

export function snapshotPath(unitDir) {
  return join(unitDir, SNAPSHOT_FILE);
}

export function hasSnapshot(unitDir) {
  return existsSync(snapshotPath(unitDir));
}

/**
 * Captures the generated corpus for a unit.
 *
 * `provenance` maps a card id to the role ids that produced it. It is a LIST per id because the
 * phase-1 roles deliberately overlap and their outputs are unioned, so "the table specialist and
 * the chapter reader both found this" is a real and useful state. An item with no entry is recorded
 * as unattributed rather than guessed at.
 *
 * Refuses to overwrite. Pass `force` only to repair a snapshot you have decided is wrong, never to
 * make a re-run succeed: a re-run that overwrites its own baseline reports that the reviewer
 * changed nothing.
 */
export function writeSnapshot(
  unitDir,
  { phase, items, provenance = {} },
  { force = false, now = () => new Date().toISOString() } = {},
) {
  const path = snapshotPath(unitDir);
  if (existsSync(path) && !force) {
    throw new Error(
      `${SNAPSHOT_FILE} already exists for ${unitDir}. It is the pre-review baseline and is written ` +
        `once; overwriting it would make the learning pass report that the reviewer changed nothing.`,
    );
  }
  if (!Array.isArray(items)) throw new Error("writeSnapshot needs an items array");

  const known = new Set(items.map((item) => item.id));
  const unknown = Object.keys(provenance).filter((id) => !known.has(id));
  if (unknown.length) {
    throw new Error(
      `provenance names ${unknown.length} id(s) absent from items (${unknown.slice(0, 3).join(", ")}` +
        `${unknown.length > 3 ? ", …" : ""}). An attribution that points at no card cannot be checked.`,
    );
  }

  const snapshot = {
    phase,
    capturedAt: now(),
    counts: { items: items.length, attributed: Object.keys(provenance).length },
    provenance,
    items,
  };
  writeFileAtomic(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return path;
}

/** The snapshot for a unit, or null when the phase never captured one. */
export function readSnapshot(unitDir) {
  const path = snapshotPath(unitDir);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/**
 * The roles credited with an item, as recorded at generation time.
 *
 * Returns `[]` for an item nobody claimed, which is a real answer: a card can reach the corpus by a
 * route no role was recorded for, and reporting that honestly is better than attributing a
 * reviewer's correction to a role that did not cause it.
 */
export function rolesFor(snapshot, cardId) {
  const roles = snapshot?.provenance?.[cardId];
  return Array.isArray(roles) ? roles : [];
}

import { existsSync, readdirSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { resolveDeckPathForDir } from "../deck/deckFileName.js";
import { readDeliveredMarker } from "../anki/deliveredMarker.js";
import { readUnitCards } from "../review/gateState.js";
import { UNIT_DIR_PATTERN } from "./units.js";

/**
 * ONE answer to "where does this unit/collection stand", for every guard to key on.
 *
 * Five booleans, in the order the pipeline reaches them:
 *
 *   `authored`   a cards.json exists and holds at least one item
 *   `reviewed`   `meta.reviewed` — gate 1, the human signed off the corpus
 *   `done`       `meta.done` — gate 2, the human said it ships
 *   `packaged`   the collection's `.apkg` exists and is not older than this unit's cards.json
 *   `delivered`  the collection carries a delivered marker, and this unit is in it
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────
 *
 * `delivered` is the state the "protect the user's scheduling" red line is actually about: those
 * cards are in a collection somebody studies daily, so a mutation there costs review history rather
 * than a rebuild. It was written by the deliverer, read by one dashboard badge, and consulted by no
 * guard — every mutating script instead keyed on a WEAKER proxy (`reviewed`/`done`), which is
 * satisfied long before a single card reaches Anki. One script had grown its own delivered check by
 * hand; the rest had none.
 *
 * So: the state is computed here, once, and `--force` no longer means one thing for a unit nobody
 * has reviewed and another for a book the user studied this morning. Touching a DELIVERED collection
 * needs its own flag, distinct from the reviewed/done one (`assertMutationAllowed`).
 *
 * ── ISOLATION ────────────────────────────────────────────────────────────────────────────────────
 *
 * Everything here reads ONE collection: its own package, its own marker, its own units. Nothing
 * compares two collections, and nothing may be added here that does (CLAUDE.md golden rule 7).
 */

export const STATE_KEYS = ["authored", "reviewed", "done", "packaged", "delivered"];

/**
 * The directory holding the package a unit ships in — its collection dir.
 *
 * A chapter/lesson unit ships inside its collection's single merged package, one level up. Anything
 * else (a template's language dir, a one-off run dir) IS its own collection. Same rule as
 * `packageDirForUnit` in src/review/gateState.js, which this deliberately mirrors rather than
 * re-deciding.
 */
export function collectionDirForUnit(runDir) {
  const dir = resolve(runDir);
  return UNIT_DIR_PATTERN.test(basename(dir)) ? dirname(dir) : dir;
}

function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * The state of a whole collection, read from disk.
 *
 * `reviewed`/`done` are true when EVERY authored unit is (a collection is only as done as its least
 * finished unit); `packaged` when a package exists and no unit's cards.json is newer than it;
 * `delivered` when the marker is present. `markerUnreadable` is surfaced separately so a corrupt
 * marker can never read as "never delivered".
 */
export function collectionState(collectionDir) {
  const dir = resolve(collectionDir);
  const marker = readDeliveredMarker(dir);
  const packagePath = resolveDeckPathForDir(dir);
  const packageAt = mtimeMs(packagePath);

  const unitDirs = listUnitDirsOnDisk(dir);
  const units = unitDirs.map((unitDir) => ({ dir: unitDir, ...readUnitFlags(unitDir) }));
  const authoredUnits = units.filter((unit) => unit.authored);
  const newestCardsAt = authoredUnits.reduce((max, unit) => Math.max(max, unit.cardsAt ?? 0), 0);

  return {
    dir,
    packagePath,
    marker,
    markerUnreadable: Boolean(marker?.unreadable),
    units,
    authored: authoredUnits.length > 0,
    reviewed: authoredUnits.length > 0 && authoredUnits.every((unit) => unit.reviewed),
    done: authoredUnits.length > 0 && authoredUnits.every((unit) => unit.done),
    packaged: packageAt !== null && packageAt >= newestCardsAt,
    // A marker that will not parse is not a delivery record: it is a question. `markerUnreadable`
    // is the flag that matters there, and `assertMutationAllowed` refuses on it before it looks at
    // anything else — so reporting `delivered: true` here would only mislead the state line.
    delivered: marker !== null && !marker.unreadable,
  };
}

/**
 * The state of ONE unit, read from disk.
 *
 * `packaged` and `delivered` are properties a unit inherits from its collection, narrowed by whether
 * the unit is in the shipped set at all: only a `done` unit is merged into the package (the template
 * shape has no `done` gate and is always its own package's content), and only a packaged unit can
 * have been delivered.
 *
 * `delivered` is deliberately conservative in both directions. When the marker records
 * `deliveredCardIds`, a unit is delivered iff one of ITS card ids is in that set — the precise
 * answer. When it does not (the pre-`deliveredCardIds` markers both live collections still carry),
 * every done unit of a delivered collection counts as delivered, because the marker says the
 * collection was pushed and cannot say which units were in it. Guessing "not delivered" there would
 * hand a mutating tool a free pass over live cards.
 */
export function unitState(runDir, { collection = null } = {}) {
  const dir = resolve(runDir);
  const collectionDir = collectionDirForUnit(dir);
  const state = collection ?? collectionState(collectionDir);
  const flags = readUnitFlags(dir);

  const isOwnCollection = collectionDir === dir;
  const shipped = flags.done || (isOwnCollection && flags.authored);
  const packaged = shipped && state.packaged;

  // `delivered` is NOT gated on `packaged`, and — where a baseline exists — NOT on `done` either.
  //
  // Not on `packaged`: delivery reads cards.json over AnkiConnect and never opens the package, so a
  // deleted or never-built .apkg says nothing about whether these cards are in Anki.
  //
  // Not on `done`: `done` is a flag on disk that a tool can CLEAR. Gating on it meant one
  // `undone-unit --force-delivered` (a single, correctly-guarded consent) permanently flipped the
  // unit to "not delivered", and every later tool would then rewrite live cards asking only for
  // `--force`. Where the marker records `deliveredCardIds`, that set is the precise answer and is
  // used alone: a card that was pushed to Anki stays delivered whatever the local flags now say.
  const hasBaseline = Array.isArray(state.marker?.deliveredCardIds);
  const delivered = hasBaseline
    ? state.delivered && markerCoversUnit(state.marker, flags.cardIds)
    : shipped && state.delivered;

  return {
    dir,
    collectionDir,
    name: basename(dir),
    authored: flags.authored,
    reviewed: flags.reviewed,
    done: flags.done,
    packaged,
    delivered,
    collection: state,
  };
}

/** True when the marker's recorded card-id baseline includes any of this unit's cards. */
function markerCoversUnit(marker, cardIds) {
  const recorded = marker?.deliveredCardIds;
  if (!Array.isArray(recorded)) return true; // no baseline recorded — see unitState's doc
  const set = new Set(recorded);
  return cardIds.some((id) => set.has(id));
}

function readUnitFlags(runDir) {
  const { data, error } = readUnitCards(runDir);
  if (error || !data) {
    return { authored: false, reviewed: false, done: false, cardIds: [], cardsAt: null };
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    authored: items.length > 0,
    reviewed: data.meta?.reviewed === true,
    done: data.meta?.done === true,
    cardIds: items.map((item) => item.id),
    cardsAt: mtimeMs(join(runDir, "cards.json")),
  };
}

function listUnitDirsOnDisk(collectionDir) {
  // A template/one-off collection IS its own unit; a book/course holds `chapter-*`/`lesson-*`.
  if (existsSync(join(collectionDir, "cards.json"))) return [collectionDir];
  let names = [];
  try {
    names = readdirSync(collectionDir);
  } catch {
    return [];
  }
  return names
    .filter((name) => UNIT_DIR_PATTERN.test(name))
    .sort()
    .map((name) => join(collectionDir, name))
    .filter((dir) => existsSync(join(dir, "cards.json")));
}

/** One line naming the states a unit/collection is in, for an error message or a report. */
export function describeState(state) {
  const on = STATE_KEYS.filter((key) => state[key]);
  return on.length ? on.join(", ") : "not authored";
}

export class MutationRefused extends Error {}

/**
 * The single guard every mutating tool asks before it writes into a unit or a collection.
 *
 * Two independent consents, because they protect two different things:
 *
 *   `force`           the unit is REVIEWED or DONE — a human signed off exactly what is there now,
 *                     and rewriting it changes what was approved.
 *   `forceDelivered`  the collection is DELIVERED — those cards are in Anki with real scheduling,
 *                     and this tool cannot reach them to undo anything.
 *
 * A delivered collection needs BOTH: the second flag is not a stronger version of the first, it is a
 * statement about a different consequence. Folding them into one flag is how "yes, re-order this
 * finished unit" quietly became "yes, edit the deck I studied this morning".
 *
 * Throws `MutationRefused` (message ready to print); returns the state when the mutation may proceed.
 */
export function assertMutationAllowed(
  target,
  { force = false, forceDelivered = false, action = "modify", flags = {} } = {},
) {
  const forceFlag = flags.force ?? "--force";
  const deliveredFlag = flags.forceDelivered ?? "--force-delivered";
  const state = typeof target === "string" ? unitState(target) : target;
  const label = state.name ?? basename(state.dir);
  // `target` may be a unit state (which carries its collection) or a collection state (which is one).
  const collection = state.collection ?? state;

  if (collection.markerUnreadable) {
    throw new MutationRefused(
      `${label}: this collection's delivery record (${collection.dir}) will not parse, so whether ` +
        `its cards are live in Anki is unknown. Fix or remove it before you ${action} anything.`,
    );
  }

  if (state.delivered && !forceDelivered) {
    throw new MutationRefused(
      `${label} is DELIVERED — its cards are in the live Anki collection with real scheduling, and ` +
        `this tool cannot reach them. Editing them here changes what the next deliver pushes, not ` +
        `what the learner is studying today. Re-run with ${deliveredFlag} if that is what you mean.`,
    );
  }

  if ((state.reviewed || state.done) && !force) {
    throw new MutationRefused(
      `${label} is ${describeState(state)} — a human signed off exactly these cards. Re-run with ` +
        `${forceFlag} if you mean to change what was approved.`,
    );
  }

  return state;
}

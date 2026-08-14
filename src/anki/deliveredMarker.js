import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * The delivered marker — `anki-delivered.json` beside a collection's package.
 *
 * It is the ONLY on-disk record that a collection's cards are in a live Anki collection somebody
 * studies, which makes it two different things at once:
 *
 *   1. a warning to a human ("do not re-import this .apkg"), which is what its `note` field is, and
 *   2. the `delivered` state every mutation guard should be keying on (see src/audit/state.js).
 *
 * It lives in its own module because both of those readers — the audit/state layer and the deliverer
 * itself — need it, and importing the whole deliverer (adapters, corpus library, deck builder) just
 * to learn a filename is how a leaf fact becomes a dependency cycle.
 *
 * ⚠️ Reading one collection's marker to decide something about THAT collection is the only
 * legitimate use. Nothing here may read a second collection's marker to compare (CLAUDE.md golden
 * rule 7).
 */

export const DELIVERED_MARKER = "anki-delivered.json";

export const markerPath = (collectionDir) => join(collectionDir, DELIVERED_MARKER);

/**
 * The marker for a collection dir, or `null` when it has never been delivered.
 *
 * An unreadable marker comes back as `{ unreadable: <message> }` rather than null, because "this
 * collection was never delivered" and "this collection's delivery record will not parse" must never
 * look the same to a guard: the first permits a mutation, the second is exactly the state where one
 * should stop.
 */
export function readDeliveredMarker(collectionDir) {
  const path = markerPath(collectionDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    return { unreadable: error.message };
  }
}

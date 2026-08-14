import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";

/**
 * The acknowledgement file behind the ACK tier: `<collectionDir>/.preflight-accepted.json`.
 *
 * Why it exists. A read-only preflight run has, for months, printed two lines that have never once
 * been zero — "17 target group(s) spanning units" and "7 clip(s) flagged marker-audible" — and then
 * printed "preflight clean". Both are real findings; both are also findings a human has looked at
 * and decided to live with. With no way to record that decision, the eighteenth duplicate group
 * renders identically to the noise the operator has already learned to scroll past, and the count is
 * wallpaper. An ACK check therefore reports UNREVIEWED instances: the ones nobody has said "yes, I
 * know" about yet. Drive that number to zero and it becomes a real gate again, because the next
 * non-zero it shows is genuinely new.
 *
 * Written ONLY by an explicit `preflight --accept`. Nothing in the pipeline ever writes it as a side
 * effect — an acknowledgement that a tool can grant itself is not an acknowledgement.
 *
 * It lives in the collection's own directory (and, for workspace-scope checks, at the output root)
 * so a collection carries its own decisions, and it is git-TRACKED (see .gitignore) because the
 * acknowledgement state is the only reason the ACK tier means anything: lose it and every accepted
 * finding silently goes red again.
 */

export const ACCEPTED_FILENAME = ".preflight-accepted.json";
const FORMAT_VERSION = 1;

/** Path of the acknowledgement file for a collection directory (or the output root). */
export function acceptedPath(dir) {
  return join(dir, ACCEPTED_FILENAME);
}

/**
 * Reads a directory's acknowledgements as `{ version, accepted: { <checkId>: { <key>: entry } } }`.
 *
 * A missing file is an empty record. An unreadable one THROWS rather than degrading to empty: an
 * acknowledgement file that will not parse would otherwise re-red every accepted finding at once,
 * and the operator would reasonably read that as fifteen new problems.
 */
export function readAccepted(dir) {
  const path = acceptedPath(dir);
  if (!existsSync(path)) return { version: FORMAT_VERSION, accepted: {} };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(
      `${path} will not parse (${error.message}). Fix or delete it — leaving it broken would ` +
        `silently un-accept every finding recorded in it.`,
    );
  }
  return {
    version: parsed?.version ?? FORMAT_VERSION,
    accepted: parsed?.accepted && typeof parsed.accepted === "object" ? parsed.accepted : {},
  };
}

/** True when this check's finding key has been explicitly acknowledged for this directory. */
export function isAccepted(record, checkId, key) {
  return Boolean(record?.accepted?.[checkId]?.[key]);
}

/**
 * Records acknowledgements for one directory and writes the file.
 *
 * `entries` is `[{ checkId, key, message }]`. Re-accepting an already-accepted key keeps the
 * ORIGINAL timestamp, so the file records when a decision was first made rather than when preflight
 * was last run with `--accept`. Returns `{ path, added }`.
 */
export function writeAccepted(dir, entries, { note = null, now = () => new Date() } = {}) {
  const record = readAccepted(dir);
  const at = now().toISOString();
  let added = 0;

  for (const { checkId, key, message } of entries) {
    const forCheck = (record.accepted[checkId] ||= {});
    if (forCheck[key]) continue;
    forCheck[key] = { at, message: message ?? null, ...(note ? { note } : {}) };
    added++;
  }

  const path = acceptedPath(dir);
  writeFileAtomic(
    path,
    JSON.stringify({ version: FORMAT_VERSION, accepted: sortRecord(record.accepted) }, null, 2) +
      "\n",
  );
  return { path, added };
}

// Stable key order, so accepting one finding produces a one-line diff rather than a reshuffle.
function sortRecord(accepted) {
  const out = {};
  for (const checkId of Object.keys(accepted).sort()) {
    out[checkId] = {};
    for (const key of Object.keys(accepted[checkId]).sort()) {
      out[checkId][key] = accepted[checkId][key];
    }
  }
  return out;
}

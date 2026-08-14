import { readFileSync } from "fs";
import { writeUnitJson } from "../util/unitWrite.js";

/**
 * Re-read `cards.json` and write back ONLY what the calling pass owns.
 *
 * Every enrichment pass here has the same shape: read the cards, spend several minutes in a model
 * call, write the cards. The read and the write are minutes apart, and the dashboard is editable
 * for that whole window — a lesson at the translate stage is exactly what someone reviews while
 * `prepare` is still running. Writing back the object read at the start silently discards any
 * exclude, inline edit or audio replacement made in between, and leaves no trace that it happened.
 *
 * `audio.js` already documented and defended against exactly this. This is that pattern, factored
 * out so the other passes get it too instead of each re-deriving it (or not).
 *
 * Four operations, applied in this order to a FRESH read of the file:
 *
 *   `remove`      — ids this pass is retiring (e.g. drills from a run that never got marked).
 *   `byId`        — `id → partial item`, from which only `ownedFields` are copied. A field whose
 *                   value is `undefined` is DELETED; every other value (including `null`) is
 *                   assigned as-is, because the two callers genuinely differ: an absent audio
 *                   filename must be an absent key (the schema rejects `audio: null`) while a
 *                   cleared note is stored as `null`. The caller decides; this does not guess.
 *   `append`      — whole new items, added at the end, skipping any id already present.
 *   `meta`        — shallow-merged into `meta`; an `undefined` value deletes that key.
 *
 * Anything not named by one of those four is left exactly as the file has it, which is the point.
 *
 * The write itself goes through `writeUnitJson`: validate before, stamped backup, atomic write,
 * then re-read and validate what landed. Returns `{ path, changed, backup }`; `changed` counts
 * items touched plus items appended, and a merge that changes nothing does not write or back up.
 */
export function mergeIntoCardsFile(
  path,
  { byId = new Map(), ownedFields = [], append = [], remove = [], meta, reason } = {},
) {
  if (!reason) throw new Error("mergeIntoCardsFile needs a `reason` for the backup filename");

  const data = JSON.parse(readFileSync(path, "utf-8"));
  const items = Array.isArray(data.items) ? data.items : [];
  let changed = 0;

  const removeIds = new Set(remove);
  const kept = items.filter((item) => !removeIds.has(item.id));
  changed += items.length - kept.length;

  for (const item of kept) {
    const next = byId.get(item.id);
    if (!next) continue;
    let touched = false;
    for (const field of ownedFields) {
      if (!(field in next)) continue;
      const value = next[field];
      if (value === undefined) {
        if (field in item) {
          delete item[field];
          touched = true;
        }
      } else if (item[field] !== value) {
        item[field] = value;
        touched = true;
      }
    }
    if (touched) changed++;
  }

  const present = new Set(kept.map((item) => item.id));
  for (const item of append) {
    if (present.has(item.id)) continue;
    present.add(item.id);
    kept.push(item);
    changed++;
  }

  let metaChanged = false;
  if (meta) {
    data.meta = { ...(data.meta ?? {}) };
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined) {
        if (key in data.meta) {
          delete data.meta[key];
          metaChanged = true;
        }
      } else if (data.meta[key] !== value) {
        data.meta[key] = value;
        metaChanged = true;
      }
    }
  }

  if (changed === 0 && !metaChanged) {
    return { path, changed: 0, backup: null };
  }

  data.items = kept;
  const { backup } = writeUnitJson(path, data, { reason });
  return { path, changed, backup };
}

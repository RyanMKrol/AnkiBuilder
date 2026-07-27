import { readFileSync, mkdirSync, existsSync } from "fs";
import { writeFileAtomic } from "../../util/atomicWrite.js";
import { join } from "path";
import { createHash } from "crypto";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import { httpError } from "../../util/httpError.js";
import { autoTrim } from "../../audio/trimSilence.js";
import { trimToRange as defaultTrimToRange } from "../../audio/trimToRange.js";
import { cleanupChain, isCleanupName, resolveCleanupName } from "../../audio/cleanupFilter.js";
import { AUDIO_FIELDS, deriveCardAudio } from "../../audio/index.js";
import { isSafeMediaFile } from "./runDir.js";

// Writes a card's audio choice back into a run dir — both the raw-upload path and the pick-a-generated-
// variant path — as a single read-modify-write of cards.json. Card targeting is by the item `id`
// (never array index or a path). All filenames written to `audio/` are generated server-side and
// validated with `isSafeMediaFile`, so no user-supplied path component ever reaches the filesystem.
//
// Every writer here stores a card's takes, not a single clip: the untouched `audioOriginal` and the
// `audioAuto` trimmed from it. `audio` — the one field the deck build reads — is always DERIVED from
// them by `deriveCardAudio`, never assigned directly, so the "manual cut beats automatic trim beats
// original" rule lives in exactly one place.

const EXT_ALLOWLIST = new Set(["mp3", "m4a", "ogg", "wav"]);

function loadCards(runDir) {
  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) throw httpError(404, "cards.json not found for this deck unit");
  return { cardsPath, data: JSON.parse(readFileSync(cardsPath, "utf-8")) };
}

// Apply a set of takes to a card and persist (validated). Shared core of every writer below. Fields
// present in `takes` are written, fields explicitly set to null are removed, and anything omitted is
// left alone — so a caller can replace a card's whole audio state or amend one part of it.
function setCardTakes(runDir, cardId, takes, { validateCards = defaultValidateCards } = {}) {
  const { cardsPath, data } = loadCards(runDir);
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);

  for (const [field, value] of Object.entries(takes)) {
    if (value == null || value === "") delete item[field];
    else item[field] = value;
  }
  const audio = deriveCardAudio(item);
  if (audio) item.audio = audio;
  else delete item.audio;

  try {
    validateCards(data);
  } catch (e) {
    throw httpError(400, `invalid card data after edit: ${e.message}`);
  }
  writeFileAtomic(cardsPath, JSON.stringify(data, null, 2));
  return {
    audio: item.audio,
    audioOriginal: item.audioOriginal || null,
    audioTrim: item.audioTrim || null,
    audioFilter: item.audioFilter || null,
  };
}

// A card's audio state, with every take cleared. Spread over a `takes` object so a writer that
// installs a NEW recording can't leave a stale take behind — notably an `audioManual` cut, which
// describes a range of the previous original and would otherwise keep winning the derive.
const clearedTakes = () => Object.fromEntries(AUDIO_FIELDS.map((field) => [field, null]));

// Store uploaded bytes as a card's new original, derive the trimmed take from it, and point the card
// at the result. Filenames carry the card id + a hash of the RAW bytes: disjoint from the audio
// stage's hash(text).mp3 clips, and cache-bustable (a new upload → new names → fresh /media URLs).
export async function applyCardAudio(runDir, cardId, bytes, ext, deps = {}) {
  const { trim, filter } = deps;
  const cleanExt = String(ext || "").toLowerCase();
  if (!EXT_ALLOWLIST.has(cleanExt)) {
    throw httpError(400, `unsupported audio extension: ${JSON.stringify(ext)}`);
  }

  // An uploaded clip is trimmed exactly like a generated one. Trimming used to live only at the
  // ElevenLabs fetch, so a hand-uploaded replacement kept whatever trailing silence it arrived with
  // and sat next to generated clips that had theirs removed — audible, and easy to mistake for a bad
  // recording. Best-effort as everywhere: no ffmpeg, or any failure, leaves the original as the take.
  //
  // The trimmer re-encodes to mp3, so the derived take is always .mp3 whatever the upload arrived as
  // — writing mp3 bytes under a .wav name would be a worse bug than not trimming at all. The original
  // keeps its uploaded extension, under a `.orig.` infix so an .mp3 upload's two files can't collide.
  const { auto, changed } = await autoTrim(bytes, { ...(trim ? { trim } : {}), cleanup: filter });

  const safeId = String(cardId).replace(/[^A-Za-z0-9._-]/g, "_");
  const stem = `${safeId}-user-${createHash("sha1").update(bytes).digest("hex").slice(0, 8)}`;
  const original = `${stem}.orig.${cleanExt}`;
  const audioAuto = changed ? `${stem}.mp3` : original;
  for (const name of [original, audioAuto]) {
    if (!isSafeMediaFile(name)) throw httpError(400, "could not derive a safe filename");
  }

  mkdirSync(join(runDir, "audio"), { recursive: true });
  writeFileAtomic(join(runDir, "audio", original), bytes);
  if (changed) writeFileAtomic(join(runDir, "audio", audioAuto), auto);

  return setCardTakes(
    runDir,
    cardId,
    {
      ...clearedTakes(),
      audioOriginal: original,
      audioAuto,
      // Record the chain that was actually applied, not just an explicit override — otherwise a
      // default-cleaned upload looks un-cleaned to the modal and to scripts/clean-audio.mjs.
      audioFilter: resolveCleanupName(filter),
    },
    deps,
  );
}

// Point a card at an existing clip already present in the run's audio/ (a generated variant). The
// variant's own untouched take comes along as the card's new original, so a pick stays re-trimmable.
export function selectCardAudio(runDir, cardId, filename, original = null, deps = {}) {
  const names = original ? [filename, original] : [filename];
  for (const name of names) {
    if (!isSafeMediaFile(name)) throw httpError(400, "invalid audio filename");
    if (!existsSync(join(runDir, "audio", name))) {
      throw httpError(404, `audio ${JSON.stringify(name)} not found`);
    }
  }
  return setCardTakes(
    runDir,
    cardId,
    {
      ...clearedTakes(),
      audioOriginal: original || filename,
      audioAuto: filename,
      audioFilter: resolveCleanupName(deps.filter),
    },
    deps,
  );
}

/**
 * The clip a manual trim cuts from: always the untouched original when the card has one.
 *
 * Falls back to the shipping clip for cards generated before originals were kept. Those can still be
 * hand-trimmed — just not widened back out past whatever the automatic trim already removed, because
 * that audio no longer exists anywhere.
 */
export function cardTrimSource(item) {
  return item.audioOriginal || item.audio || null;
}

// Cut a reviewer's hand-placed [start, end] range out of the card's ORIGINAL and ship the result.
//
// Always from the original, never from the previous cut: re-trimming a cut clip would compound the
// edits, so a selection made slightly too tight could only ever get tighter and the reviewer would
// have to regenerate to escape it. Cutting from the full-length take every time is what makes the
// editor's handles freely draggable in both directions — including back out past where the automatic
// trim landed, which is the entire reason the original is kept.
export function trimCardAudio(runDir, cardId, start, end, deps = {}) {
  const { trimToRange = defaultTrimToRange, filter } = deps;
  const { data } = loadCards(runDir);
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);

  const source = cardTrimSource(item);
  if (!source) throw httpError(422, "this card has no audio to trim");
  if (!isSafeMediaFile(source)) throw httpError(400, "invalid source filename");
  const sourcePath = join(runDir, "audio", source);
  if (!existsSync(sourcePath)) throw httpError(404, `audio ${JSON.stringify(source)} not found`);

  // The cut comes off the untouched original, so the noise cleanup has to be re-applied here or the
  // reviewer's hand trim would quietly reintroduce the rumble the automatic take had removed. Use the
  // chain this card was built with, so trimming never silently changes which filter is in force.
  const chain = filter ?? item.audioFilter ?? undefined;
  let cut;
  try {
    cut = trimToRange(readFileSync(sourcePath), start, end, { cleanup: cleanupChain(chain) });
  } catch (e) {
    // Unlike the automatic trim, an explicit edit that can't be applied must SAY so — a silent no-op
    // would tell the reviewer their cut landed when the card still holds the untrimmed clip.
    throw httpError(422, e.message);
  }

  const safeId = String(cardId).replace(/[^A-Za-z0-9._-]/g, "_");
  const filename = `${safeId}-manual-${createHash("sha1").update(cut).digest("hex").slice(0, 8)}.mp3`;
  if (!isSafeMediaFile(filename)) throw httpError(400, "could not derive a safe filename");
  writeFileAtomic(join(runDir, "audio", filename), cut);

  // Only the manual fields move. The original and the automatic take stay exactly as they are, so
  // "revert to automatic" is a delete rather than a regeneration.
  return setCardTakes(
    runDir,
    cardId,
    {
      audioManual: filename,
      audioTrim: { start, end },
      ...(filter ? { audioFilter: filter } : {}),
    },
    deps,
  );
}

/**
 * Rebuild a card's takes with a different noise-cleanup chain.
 *
 * The dashboard's escape hatch for the occasional clip the default chain handles badly — too little
 * cleaning, or a thinned voice. Always re-derived from the untouched ORIGINAL, never from the current
 * take, so switching chains can't stack one filter on top of another (which would compound the
 * artefacts each is trying to avoid, and make the result depend on the order you clicked the buttons).
 *
 * A hand trim is preserved: its stored range is re-cut from the original under the new chain, so
 * changing the cleanup doesn't silently throw away the reviewer's edit.
 */
export async function recleanCardAudio(runDir, cardId, filter, deps = {}) {
  const { trim, trimToRange = defaultTrimToRange } = deps;
  if (!isCleanupName(filter) && cleanupChain(filter) !== null) {
    throw httpError(400, `unknown cleanup filter: ${JSON.stringify(filter)}`);
  }
  const { data } = loadCards(runDir);
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);

  const source = item.audioOriginal;
  if (!source) throw httpError(422, "this card has no untouched original to re-clean from");
  if (!isSafeMediaFile(source)) throw httpError(400, "invalid source filename");
  const sourcePath = join(runDir, "audio", source);
  if (!existsSync(sourcePath)) throw httpError(404, `audio ${JSON.stringify(source)} not found`);
  const raw = readFileSync(sourcePath);

  const { auto } = await autoTrim(raw, { ...(trim ? { trim } : {}), cleanup: filter });
  const stem = source.replace(/\.orig\.[A-Za-z0-9]+$/, "").replace(/\.[A-Za-z0-9]+$/, "");
  const audioAuto = `${stem}.${filter}.mp3`;
  if (!isSafeMediaFile(audioAuto)) throw httpError(400, "could not derive a safe filename");
  writeFileAtomic(join(runDir, "audio", audioAuto), auto);

  const takes = { audioAuto, audioFilter: filter, audioManual: null, audioTrim: null };
  if (item.audioTrim && Number.isFinite(item.audioTrim.start)) {
    const { start, end } = item.audioTrim;
    try {
      const cut = trimToRange(raw, start, end, { cleanup: cleanupChain(filter) });
      const safeId = String(cardId).replace(/[^A-Za-z0-9._-]/g, "_");
      const name = `${safeId}-manual-${createHash("sha1").update(cut).digest("hex").slice(0, 8)}.mp3`;
      writeFileAtomic(join(runDir, "audio", name), cut);
      takes.audioManual = name;
      takes.audioTrim = { start, end };
    } catch (e) {
      throw httpError(422, `re-cleaned, but could not re-apply the saved trim: ${e.message}`);
    }
  }
  return setCardTakes(runDir, cardId, takes, deps);
}

// Drop a card's hand cut, falling back to the automatic take. The cut file is left on disk — it costs
// tens of KB, never reaches the deck, and keeping it means an accidental revert is undone by
// re-applying the same range rather than by re-cutting audio the reviewer already approved.
export function revertCardAudio(runDir, cardId, deps = {}) {
  return setCardTakes(runDir, cardId, { audioManual: null, audioTrim: null }, deps);
}

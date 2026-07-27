import { readFileSync, mkdirSync, existsSync } from "fs";
import { writeFileAtomic } from "../../util/atomicWrite.js";
import { join } from "path";
import { createHash } from "crypto";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import { httpError } from "../../util/httpError.js";
import { autoTrim } from "../../audio/trimSilence.js";
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
  return { audio: item.audio, audioTrim: item.audioTrim || null };
}

// A card's audio state, with every take cleared. Spread over a `takes` object so a writer that
// installs a NEW recording can't leave a stale take behind — notably an `audioManual` cut, which
// describes a range of the previous original and would otherwise keep winning the derive.
const clearedTakes = () => Object.fromEntries(AUDIO_FIELDS.map((field) => [field, null]));

// Store uploaded bytes as a card's new original, derive the trimmed take from it, and point the card
// at the result. Filenames carry the card id + a hash of the RAW bytes: disjoint from the audio
// stage's hash(text).mp3 clips, and cache-bustable (a new upload → new names → fresh /media URLs).
export async function applyCardAudio(runDir, cardId, bytes, ext, deps = {}) {
  const { trim } = deps;
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
  const { auto, changed } = await autoTrim(bytes, trim ? { trim } : {});

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
    { ...clearedTakes(), audioOriginal: original, audioAuto },
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
    { ...clearedTakes(), audioOriginal: original || filename, audioAuto: filename },
    deps,
  );
}

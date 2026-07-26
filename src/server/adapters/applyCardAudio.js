import { readFileSync, mkdirSync, existsSync } from "fs";
import { writeFileAtomic } from "../../util/atomicWrite.js";
import { join } from "path";
import { createHash } from "crypto";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import { httpError } from "../../util/httpError.js";
import { trimTrailingSilence } from "../../audio/trimSilence.js";
import { isSafeMediaFile } from "./runDir.js";

// Writes a card's audio choice back into a run dir — both the raw-upload path and the pick-a-generated-
// variant path — as a single read-modify-write of cards.json. Card targeting is by the item `id`
// (never array index or a path). All filenames written to `audio/` are generated server-side and
// validated with `isSafeMediaFile`, so no user-supplied path component ever reaches the filesystem.

const EXT_ALLOWLIST = new Set(["mp3", "m4a", "ogg", "wav"]);

function loadCards(runDir) {
  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) throw httpError(404, "cards.json not found for this deck unit");
  return { cardsPath, data: JSON.parse(readFileSync(cardsPath, "utf-8")) };
}

// Point a card at an existing audio filename and persist (validated). Shared core of the two writers.
function setCardAudio(runDir, cardId, filename, { validateCards = defaultValidateCards } = {}) {
  const { cardsPath, data } = loadCards(runDir);
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);
  item.audio = filename;
  try {
    validateCards(data);
  } catch (e) {
    throw httpError(400, `invalid card data after edit: ${e.message}`);
  }
  writeFileAtomic(cardsPath, JSON.stringify(data, null, 2));
  return { audio: filename };
}

// Store uploaded bytes as a new clip for the card, then point the card at it. The filename carries the
// card id + a content hash: disjoint from the audio stage's hash(text).mp3 clips, and cache-bustable
// (a new upload → a new name → a fresh /media URL).
export async function applyCardAudio(runDir, cardId, bytes, ext, deps = {}) {
  const { trim = trimTrailingSilence } = deps;
  const cleanExt = String(ext || "").toLowerCase();
  if (!EXT_ALLOWLIST.has(cleanExt)) {
    throw httpError(400, `unsupported audio extension: ${JSON.stringify(ext)}`);
  }

  // Trim an uploaded clip the same way a generated one is trimmed. Trimming used to live only at the
  // ElevenLabs fetch, so a hand-uploaded replacement kept whatever trailing silence it arrived with and
  // sat next to generated clips that had theirs removed — audible, and easy to mistake for a bad
  // recording. Best-effort exactly as elsewhere: no ffmpeg, or any failure, returns the original bytes.
  //
  // The trimmer re-encodes to mp3, so a clip it actually changed is stored as .mp3 whatever it arrived
  // as. Writing mp3 bytes under a .wav name would be a worse bug than not trimming at all.
  const trimmed = await trim(bytes);
  const changed = trimmed !== bytes && !trimmed.equals(bytes);
  const finalBytes = changed ? trimmed : bytes;
  const finalExt = changed ? "mp3" : cleanExt;

  const safeId = String(cardId).replace(/[^A-Za-z0-9._-]/g, "_");
  const shortHash = createHash("sha1").update(finalBytes).digest("hex").slice(0, 8);
  const filename = `${safeId}-user-${shortHash}.${finalExt}`;
  if (!isSafeMediaFile(filename)) throw httpError(400, "could not derive a safe filename");
  mkdirSync(join(runDir, "audio"), { recursive: true });
  writeFileAtomic(join(runDir, "audio", filename), finalBytes);
  return setCardAudio(runDir, cardId, filename, deps);
}

// Point a card at an existing clip already present in the run's audio/ (e.g. a generated variant).
export function selectCardAudio(runDir, cardId, filename, deps = {}) {
  if (!isSafeMediaFile(filename)) throw httpError(400, "invalid audio filename");
  if (!existsSync(join(runDir, "audio", filename))) {
    throw httpError(404, `audio ${JSON.stringify(filename)} not found`);
  }
  return setCardAudio(runDir, cardId, filename, deps);
}

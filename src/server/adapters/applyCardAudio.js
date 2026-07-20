import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import { httpError } from "../../util/httpError.js";
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
  writeFileSync(cardsPath, JSON.stringify(data, null, 2));
  return { audio: filename };
}

// Store uploaded bytes as a new clip for the card, then point the card at it. The filename carries the
// card id + a content hash: disjoint from the audio stage's hash(text).mp3 clips, and cache-bustable
// (a new upload → a new name → a fresh /media URL).
export function applyCardAudio(runDir, cardId, bytes, ext, deps = {}) {
  const cleanExt = String(ext || "").toLowerCase();
  if (!EXT_ALLOWLIST.has(cleanExt)) {
    throw httpError(400, `unsupported audio extension: ${JSON.stringify(ext)}`);
  }
  const safeId = String(cardId).replace(/[^A-Za-z0-9._-]/g, "_");
  const shortHash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  const filename = `${safeId}-user-${shortHash}.${cleanExt}`;
  if (!isSafeMediaFile(filename)) throw httpError(400, "could not derive a safe filename");
  mkdirSync(join(runDir, "audio"), { recursive: true });
  writeFileSync(join(runDir, "audio", filename), bytes);
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

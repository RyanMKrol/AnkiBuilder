import { createHash } from "crypto";
import { join, resolve } from "path";
import { promises as fs } from "fs";
import { writeFileAtomicAsync } from "../util/atomicWrite.js";
import { libraryHome } from "../model/index.js";
import { resolveIso639Code } from "../model/iso639.js";
import { getAltAudioTransform } from "./altAudio.js";
import { normalizeTtsText } from "./ttsText.js";
import { TTS_MODEL } from "./ttsModel.js";

export function hashTerm(term) {
  return createHash("sha256").update(term).digest("hex").slice(0, 16);
}

// The text actually handed to TTS (and used as the audio cache key) for a card:
// the card's `reading` when it's a non-empty string, otherwise its `target`. This
// is what lets a Japanese deck show kanji on the face (`target`) while speaking an
// unambiguous kana `reading` — for languages whose target is already phonetic, no
// `reading` is set and `target` is spoken exactly as before.
export function speechText(item) {
  return typeof item.reading === "string" && item.reading.length > 0 ? item.reading : item.target;
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// Fetches every term in `terms` into `audioDir`, keyed by its `hashTerm` filename, skipping any
// already cached. Returns a Map of term -> filename. Shared by the default and alt passes so both
// reuse the exact same hash/cache/fetch behaviour.
async function fetchTermsToCache(terms, audioDir, { fetchTts, voiceId, apiKey, languageCode }) {
  const fetched = new Map();
  for (const term of terms) {
    const filename = `${hashTerm(term)}.mp3`;
    const filepath = resolve(join(audioDir, filename));

    if (await fileExists(filepath)) {
      fetched.set(term, filename);
      continue;
    }

    const mp3Data = await fetchTts(term, voiceId, apiKey, languageCode);
    await writeFileAtomicAsync(filepath, mp3Data);
    fetched.set(term, filename);
  }
  return fetched;
}

/**
 * The exact text of a card's DEFAULT clip, and the filename that text hashes to.
 *
 * Exported so the audio stage's "already generated?" check can ask whether a card's stored clip still
 * matches its CURRENT text, rather than only whether some file exists. Clip names are content
 * addressed, so editing a `reading` after audio has run leaves the card pointing at a stale clip that
 * is still on disk — which read as "already generated — reusing" and silently kept the old audio.
 */
export function defaultClipText(item, languageCode, altTransform) {
  const text = normalizeTtsText(speechText(item), languageCode);
  return altTransform ? altTransform(text) : text;
}

/**
 * Does this filename look like a clip the audio STAGE generated — a bare content hash?
 *
 * Everything else a card can point at is a deliberate human choice and must never be regenerated over:
 * a `-gen-` / `-genkanji-` variant auditioned and picked in the dashboard, or a Replace upload under
 * its own name. Only a plain default take is ever a candidate for being stale.
 */
export function isDefaultClipFilename(filename) {
  return typeof filename === "string" && /^[0-9a-f]{16}\.mp3$/.test(filename);
}

export function defaultClipFilename(item, languageCode, altTransform) {
  return `${hashTerm(defaultClipText(item, languageCode, altTransform))}.mp3`;
}

export async function generateAudio(
  cards,
  {
    voiceId,
    fetchTts = null,
    libraryHomeDir = null,
    getAltTransform = getAltAudioTransform,
    model = TTS_MODEL,
  } = {},
) {
  if (!voiceId) {
    throw new Error("voiceId is required");
  }

  if (!fetchTts) {
    throw new Error("fetchTts function is required");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const basePath = libraryHomeDir || libraryHome();
  // Segment the cache by model so an eleven_v3 clip never collides with an eleven_multilingual_v2
  // clip of the same text (same hash, different model dir). See ttsModel.js.
  const audioDir = resolve(join(basePath, "audio", voiceId, model));

  await ensureDir(audioDir);

  // Only a real ISO 639-1 code (e.g. "ja") is passed through to fetchTts — a full
  // language name (e.g. "Japanese") or an unrecognized value resolves to null, and
  // ElevenLabs falls back to auto-detecting the language from the text itself, same as
  // it always has. Resolved once per call, not per term, since it's the same corpus-wide
  // targetLanguage for every item.
  const languageCode = resolveIso639Code(cards.meta?.targetLanguage);
  const fetchCtx = { fetchTts, voiceId, apiKey, languageCode };

  // The DEFAULT (and only up-front) take. For a language with a transform (Japanese appends 。), the
  // WITH-。 take is the default — a trailing 。 gives ElevenLabs a sentence boundary and fixes many
  // mis-rendered short/bare clips (lone kana, some numbers). Languages with no transform get the plain
  // take. Every OTHER variant — the no-。 take, comma/bracket forms, and kana+kanji — is generated ON
  // DEMAND in the dashboard, not here. The displayed target/reading never carries a 。; the dot is
  // audio-only.
  const altTransform = getAltTransform(languageCode);
  const defaultTextFor = (item) => defaultClipText(item, languageCode, altTransform);

  // Excluded cards are dropped from the deck at build time (src/deck/index.js), so don't spend TTS on
  // them here — and clear any `audio` they carry so the review shows no player and nothing lingers.
  // The flag is reversible: un-excluding a card and re-running `audio` regenerates its clip.
  const uniqueTerms = new Set();
  for (const item of cards.items) {
    if (item.excluded) continue;
    uniqueTerms.add(defaultTextFor(item));
  }
  const fetchedFiles = await fetchTermsToCache(uniqueTerms, audioDir, fetchCtx);

  const annotatedCards = {
    ...cards,
    items: cards.items.map((item) => {
      if (item.excluded) {
        const rest = { ...item };
        delete rest.audio;
        return rest;
      }
      return { ...item, audio: fetchedFiles.get(defaultTextFor(item)) };
    }),
  };

  return annotatedCards;
}

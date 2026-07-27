import { createHash } from "crypto";
import { join, resolve } from "path";
import { promises as fs } from "fs";
import { writeFileAtomicAsync } from "../util/atomicWrite.js";
import { libraryHome } from "../model/index.js";
import { resolveIso639Code } from "../model/iso639.js";
import { getAltAudioTransform } from "./altAudio.js";
import { normalizeTtsText } from "./ttsText.js";
import { TTS_MODEL } from "./ttsModel.js";
import { autoTrim } from "./trimSilence.js";

export function hashTerm(term) {
  return createHash("sha256").update(term).digest("hex").slice(0, 16);
}

/**
 * Every audio field a card can carry. Listed once so "clear this card's audio" can never drift out of
 * step with the schema by forgetting one — an orphaned `audioManual` would keep pointing `audio` at a
 * clip of text the card no longer has.
 */
export const AUDIO_FIELDS = [
  "audio",
  "audioOriginal",
  "audioAuto",
  "audioManual",
  "audioTrim",
  "audioFilter",
];

/**
 * The clip a card actually ships, given its stored takes: a hand-cut range wins over the automatic
 * trim, which wins over the untouched original.
 *
 * `audio` stays the single field the deck build, the `.apkg` rebuild and AnkiConnect delivery read —
 * they never learn about the others. This is the one place that decides what it points at, so a
 * reviewer's manual cut and a fallback to the original follow the same rule everywhere.
 */
export function deriveCardAudio(item) {
  return item.audioManual || item.audioAuto || item.audioOriginal || undefined;
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
// already cached. Returns a Map of term -> `{ audio, original }`, where `audio` is the auto-trimmed
// clip that ships and `original` the untouched take beside it (null when the entry predates
// originals). Shared by the default and alt passes so both reuse the exact same hash/cache/fetch
// behaviour.
//
// `<hash>.mp3` keeps its long-standing meaning — the trimmed clip the deck embeds — so every existing
// cache entry, and `isDefaultClipFilename`'s staleness rule, are untouched. The raw take is a new
// `<hash>.orig.mp3` sibling, which makes its ABSENCE mean exactly one thing: that entry was written
// before originals were kept. Nothing already on disk is silently reinterpreted.
async function fetchTermsToCache(
  terms,
  audioDir,
  { fetchTts, voiceId, apiKey, languageCode, trim },
) {
  const fetched = new Map();
  for (const term of terms) {
    const base = hashTerm(term);
    const filename = `${base}.mp3`;
    const original = `${base}.orig.mp3`;
    const filepath = resolve(join(audioDir, filename));
    const origPath = resolve(join(audioDir, original));

    if (await fileExists(filepath)) {
      // Cached. A pre-originals entry has no sibling — report it absent rather than refetching, which
      // would spend credits re-rolling a take (ElevenLabs is non-deterministic) purely to recover an
      // original we had already chosen to discard.
      fetched.set(term, {
        audio: filename,
        original: (await fileExists(origPath)) ? original : null,
      });
      continue;
    }

    const raw = await fetchTts(term, voiceId, apiKey, languageCode);
    const { auto } = await autoTrim(raw, { trim });
    // Original FIRST. Crashing between the two writes must leave the SHIPPING clip missing (so the
    // next run refetches and self-heals), never an orphaned shipping clip whose absent sibling would
    // permanently read as "this entry predates originals".
    await writeFileAtomicAsync(origPath, raw);
    await writeFileAtomicAsync(filepath, auto);
    fetched.set(term, { audio: filename, original });
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
    trim = undefined,
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
  const fetchCtx = { fetchTts, voiceId, apiKey, languageCode, trim };

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
        for (const field of AUDIO_FIELDS) delete rest[field];
        return rest;
      }
      const clip = fetchedFiles.get(defaultTextFor(item));
      const next = { ...item, audio: clip.audio, audioAuto: clip.audio };
      if (clip.original) next.audioOriginal = clip.original;
      else delete next.audioOriginal;
      // A regenerated card is speaking NEW text, so any hand-cut range the reviewer applied describes
      // a clip that no longer exists. Carrying it forward would point `audio` at a stale `-manual-`
      // file — the old words, kept because a start/end pair happened to survive the regeneration.
      delete next.audioManual;
      delete next.audioTrim;
      return next;
    }),
  };

  return annotatedCards;
}

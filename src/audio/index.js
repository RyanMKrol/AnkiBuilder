import { createHash } from "crypto";
import { join, resolve } from "path";
import { promises as fs } from "fs";
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
    await fs.writeFile(filepath, mp3Data);
    fetched.set(term, filename);
  }
  return fetched;
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

  // The exact text sent to TTS (and used as the cache key): the card's spoken text with any
  // language-specific normalization applied — for Japanese, spaces stripped so they aren't voiced
  // as pauses. `target`/`reading` keep their editorial spaces for display; only the audio loses them.
  const ttsTextFor = (item) => normalizeTtsText(speechText(item), languageCode);

  // Default vs. alt take. For a language with a transform (Japanese appends 。), the WITH-。 take is
  // the DEFAULT — a trailing 。 gives ElevenLabs a sentence boundary and fixes many mis-rendered
  // short/bare clips (lone kana, some numbers) — and the plain (no-。) take is the ALT you can switch
  // a card to. Languages with no transform get a single plain take as the default and no alt. The
  // displayed target/reading never carries a 。; the dot is audio-only.
  const altTransform = getAltTransform(languageCode);
  const defaultTextFor = (item) =>
    altTransform ? altTransform(ttsTextFor(item)) : ttsTextFor(item);

  const uniqueTerms = new Set();
  for (const item of cards.items) {
    uniqueTerms.add(defaultTextFor(item));
  }
  const fetchedFiles = await fetchTermsToCache(uniqueTerms, audioDir, fetchCtx);

  // Alt pass: when the target language has a transform, generate a SECOND recording per card from
  // the PLAIN (untransformed) spoken text — the no-。 take. It hashes to a distinct filename, so it
  // caches alongside the default with no collision. Languages with no transform get no alt audio and
  // no `altAudio` field at all.
  let altFetchedFiles = null;
  if (altTransform) {
    const uniqueAltTerms = new Set();
    for (const item of cards.items) {
      uniqueAltTerms.add(ttsTextFor(item));
    }
    altFetchedFiles = await fetchTermsToCache(uniqueAltTerms, audioDir, fetchCtx);
  }

  const annotatedCards = {
    ...cards,
    items: cards.items.map((item) => {
      const annotated = { ...item, audio: fetchedFiles.get(defaultTextFor(item)) };
      if (altFetchedFiles) {
        annotated.altAudio = altFetchedFiles.get(ttsTextFor(item));
      }
      return annotated;
    }),
  };

  return annotatedCards;
}

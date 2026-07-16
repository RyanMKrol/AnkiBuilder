import { createHash } from "crypto";
import { join, resolve } from "path";
import { promises as fs } from "fs";
import { libraryHome } from "../model/index.js";
import { resolveIso639Code } from "../model/iso639.js";

function hashTerm(term) {
  return createHash("sha256").update(term).digest("hex").slice(0, 16);
}

// The text actually handed to TTS (and used as the audio cache key) for a card:
// the card's `reading` when it's a non-empty string, otherwise its `target`. This
// is what lets a Japanese deck show kanji on the face (`target`) while speaking an
// unambiguous kana `reading` — for languages whose target is already phonetic, no
// `reading` is set and `target` is spoken exactly as before.
function speechText(item) {
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

export async function generateAudio(
  cards,
  { voiceId, fetchTts = null, libraryHomeDir = null } = {},
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
  const audioDir = resolve(join(basePath, "audio", voiceId));

  await ensureDir(audioDir);

  // Only a real ISO 639-1 code (e.g. "ja") is passed through to fetchTts — a full
  // language name (e.g. "Japanese") or an unrecognized value resolves to null, and
  // ElevenLabs falls back to auto-detecting the language from the text itself, same as
  // it always has. Resolved once per call, not per term, since it's the same corpus-wide
  // targetLanguage for every item.
  const languageCode = resolveIso639Code(cards.meta?.targetLanguage);

  const uniqueTerms = new Set();
  for (const item of cards.items) {
    uniqueTerms.add(speechText(item));
  }

  const fetchedFiles = new Map();

  for (const term of uniqueTerms) {
    const filename = `${hashTerm(term)}.mp3`;
    const filepath = resolve(join(audioDir, filename));

    const exists = await fileExists(filepath);
    if (exists) {
      fetchedFiles.set(term, filename);
      continue;
    }

    const mp3Data = await fetchTts(term, voiceId, apiKey, languageCode);
    await fs.writeFile(filepath, mp3Data);
    fetchedFiles.set(term, filename);
  }

  const annotatedCards = {
    ...cards,
    items: cards.items.map((item) => ({
      ...item,
      audio: fetchedFiles.get(speechText(item)),
    })),
  };

  return annotatedCards;
}

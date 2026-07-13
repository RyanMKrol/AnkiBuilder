import { createHash } from "crypto";
import { join, resolve } from "path";
import { promises as fs } from "fs";
import { stateHome } from "../model/index.js";

function hashTerm(term) {
  return createHash("sha256").update(term).digest("hex").slice(0, 16);
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

export async function generateAudio(cards, { voiceId, fetchTts = null, stateHomeDir = null } = {}) {
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

  const basePath = stateHomeDir || stateHome();
  const audioDir = resolve(join(basePath, "audio", voiceId));

  await ensureDir(audioDir);

  const uniqueTerms = new Set();
  for (const item of cards.items) {
    uniqueTerms.add(item.target);
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

    const mp3Data = await fetchTts(term, voiceId, apiKey);
    await fs.writeFile(filepath, mp3Data);
    fetchedFiles.set(term, filename);
  }

  const annotatedCards = {
    ...cards,
    items: cards.items.map((item) => ({
      ...item,
      audio: fetchedFiles.get(item.target),
    })),
  };

  return annotatedCards;
}

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { hashTerm } from "./index.js";
import { cardAudioVariants } from "./variants.js";
import { fetchElevenLabsTts } from "./elevenLabsTts.js";
import { TTS_MODEL } from "./ttsModel.js";
import { httpError } from "../util/httpError.js";

// Synthesizes (or reuses from cache) the audio-variant clips for one card via ElevenLabs, writing
// each into the run's `audio/` dir under its content-addressed `hash(ttsText).mp3` name. The with-/
// no-。 variants share names with the audio stage's own clips, so those are cache hits. Does NOT touch
// cards.json — the caller applies a pick via `selectCardAudio`. Returns `[{ label, audio }]`.
export async function generateCardVariants(
  runDir,
  cardId,
  { voiceId, apiKey, languageCode, fetchTts = fetchElevenLabsTts, model = TTS_MODEL } = {},
) {
  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) throw httpError(404, "cards.json not found for this deck unit");
  const data = JSON.parse(readFileSync(cardsPath, "utf-8"));
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);

  const variants = cardAudioVariants(item, languageCode);
  if (variants.length === 0) throw httpError(422, "card has no spoken text to generate from");

  const audioDir = join(runDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const out = [];
  for (const variant of variants) {
    const filename = `${hashTerm(variant.ttsText)}.mp3`;
    const filepath = join(audioDir, filename);
    if (!existsSync(filepath)) {
      const bytes = await fetchTts(variant.ttsText, voiceId, apiKey, languageCode, model);
      writeFileSync(filepath, bytes);
    }
    out.push({ label: variant.label, audio: filename });
  }
  return out;
}

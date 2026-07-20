import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { hashTerm } from "./index.js";
import { cardAudioVariants } from "./variants.js";
import { fetchElevenLabsTts } from "./elevenLabsTts.js";
import { TTS_MODEL } from "./ttsModel.js";
import { httpError } from "../util/httpError.js";

// On-demand audio-variant generation for one card, for the dashboard's Generate button. Makes a
// FRESH ElevenLabs call per applicable variant every time (no cache reuse) — ElevenLabs is
// non-deterministic, so this is what lets a spot-check re-roll a take that sounds wrong. Each clip is
// written under a name content-addressed by its BYTES (`<hash(ttsText)>-gen-<hash(bytes)>.mp3`), so a
// fresh take NEVER overwrites the audio stage's built clips (which a card's current `audio` may point
// at) — it's a new preview file. Does NOT touch cards.json — the caller applies a pick via
// `selectCardAudio`. Returns `[{ label, audio }]`. Costs credits on every call (one per variant).
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
    const bytes = await fetchTts(variant.ttsText, voiceId, apiKey, languageCode, model);
    const bytesHash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
    const filename = `${hashTerm(variant.ttsText)}-gen-${bytesHash}.mp3`;
    writeFileSync(join(audioDir, filename), bytes);
    out.push({ label: variant.label, audio: filename });
  }
  return out;
}

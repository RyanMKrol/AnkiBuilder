import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { hashTerm } from "./index.js";
import { normalizeTtsText } from "./ttsText.js";
import { getAltAudioTransform } from "./altAudio.js";
import { fetchElevenLabsTts } from "./elevenLabsTts.js";
import { TTS_MODEL } from "./ttsModel.js";
import { generateCardKanji } from "./kanjiOrthography.js";
import { runClaude as defaultRunClaude } from "../translate/runClaude.js";
import { httpError } from "../util/httpError.js";

// On-demand "kana+kanji" audio-variant generation for one card, for the dashboard's Generate (kanji)
// button. Japanese-only: a kanji orthography is generated from the card's kana reading (via Claude),
// then FRESH ElevenLabs takes are synthesized from THAT text (no-。 and with-。). Distinct filename
// infix `-genkanji-` so a preview never collides with the audio stage's built clips or the ordinary
// `-gen-` previews. Does NOT touch cards.json — the caller applies a pick via `selectCardAudio`.
// Returns `[{ label, audio, kanji }]`, the produced kanji text included so the modal can show it.
export async function generateCardKanjiVariants(
  runDir,
  cardId,
  {
    voiceId,
    apiKey,
    languageCode,
    fetchTts = fetchElevenLabsTts,
    runClaude = defaultRunClaude,
    model = TTS_MODEL,
  } = {},
) {
  if (languageCode !== "ja") throw httpError(422, "kanji variants are Japanese-only");

  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) throw httpError(404, "cards.json not found for this deck unit");
  const data = JSON.parse(readFileSync(cardsPath, "utf-8"));
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);

  const kanji = generateCardKanji(item, { runClaude });
  const base = normalizeTtsText(kanji, languageCode);
  if (!base) throw httpError(422, "kanji orthography was empty");

  const altTransform = getAltAudioTransform(languageCode);
  const takes = [
    { label: "kanji", ttsText: base },
    ...(altTransform ? [{ label: "kanji · 。", ttsText: altTransform(base) }] : []),
  ];

  const audioDir = join(runDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const out = [];
  for (const take of takes) {
    const bytes = await fetchTts(take.ttsText, voiceId, apiKey, languageCode, model);
    const bytesHash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
    const filename = `${hashTerm(take.ttsText)}-genkanji-${bytesHash}.mp3`;
    writeFileSync(join(audioDir, filename), bytes);
    out.push({ label: take.label, audio: filename, kanji });
  }
  return out;
}

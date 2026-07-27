import { Buffer } from "buffer";
import { TTS_MODEL } from "./ttsModel.js";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Fetches one TTS clip from ElevenLabs and returns its RAW, untouched mp3 bytes as a Buffer.
// `languageCode` is only ever a real ISO 639-1 code or null (see resolveIso639Code) — omitted from
// the request body when null so ElevenLabs falls back to its own language auto-detection. Shared by
// the audio stage (via the CLI) and the dashboard's on-demand variant generation.
//
// Trimming deliberately does NOT happen here. It used to: this was the single choke point, so every
// clip arrived pre-trimmed and the raw take was discarded before it ever reached disk. That made the
// trim algorithm's mistakes permanent and invisible — it only ever cuts the END, and when it cut too
// early the clipped audio was simply gone. Callers now keep BOTH takes (`<hash>.orig.mp3` next to
// `<hash>.mp3`) and derive the trimmed one with `autoTrim`, so the review can show the original
// beside the shipping clip and a human can re-cut from the full-length take.
export async function fetchElevenLabsTts(
  text,
  voiceId,
  apiKey,
  languageCode = null,
  model = TTS_MODEL,
) {
  const response = await globalThis.fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: model,
      ...(languageCode ? { language_code: languageCode } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS request failed: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

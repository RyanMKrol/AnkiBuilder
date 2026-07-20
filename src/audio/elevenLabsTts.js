import { Buffer } from "buffer";
import { TTS_MODEL } from "./ttsModel.js";
import { trimTrailingSilence } from "./trimSilence.js";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Fetches one TTS clip from ElevenLabs and returns its mp3 bytes as a Buffer. `languageCode` is only
// ever a real ISO 639-1 code or null (see resolveIso639Code) — omitted from the request body when
// null so ElevenLabs falls back to its own language auto-detection. Shared by the audio stage (via
// the CLI) and the dashboard's on-demand variant generation.
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

  // Central post-process: trim the trailing silence + end blip ElevenLabs leaves on every clip
  // (best-effort — a no-op if ffmpeg is absent). This is the single choke point, so both the audio
  // build stage and the dashboard's Generate get cleaned clips.
  const bytes = Buffer.from(await response.arrayBuffer());
  return await trimTrailingSilence(bytes);
}

import { Buffer } from "buffer";
import { setTimeout as sleep } from "timers/promises";
import { TTS_MODEL } from "./ttsModel.js";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// Per-request ceiling and retry policy. A stalled socket used to hang the whole audio stage
// forever (bare fetch, no signal), and a transient 429/5xx killed it outright.
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

// The useful part of an ElevenLabs error lives in the JSON body's `detail` (quota exceeded, bad
// voice id, ...), not the status text. Best-effort — a body that won't read or parse yields "".
async function responseDetail(response) {
  try {
    const body = await response.text();
    try {
      const detail = JSON.parse(body)?.detail;
      if (typeof detail === "string") return detail;
      if (detail?.message) return detail.message;
      return detail ? JSON.stringify(detail) : body.slice(0, 300);
    } catch {
      return body.slice(0, 300);
    }
  } catch {
    return "";
  }
}

// Fetches one TTS clip from ElevenLabs and returns its RAW, untouched mp3 bytes as a Buffer.
// `languageCode` is only ever a real ISO 639-1 code or null (see resolveIso639Code) — omitted from
// the request body when null so ElevenLabs falls back to its own language auto-detection. Shared by
// the audio stage (via the CLI) and the dashboard's on-demand variant generation.
//
// Each attempt is bounded by a timeout, and transient failures — a timeout, a network error, a 429
// or a 5xx — are retried with backoff. A definitive 4xx (bad key, bad voice) throws immediately,
// carrying the response body's detail. `options` is test-only injection.
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
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    wait = sleep,
  } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await wait(1000 * 2 ** (attempt - 1));
    }

    try {
      const response = await fetchImpl(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
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
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const detail = await responseDetail(response);
        const error = new Error(
          `ElevenLabs TTS request failed: ${response.status} ${response.statusText}` +
            (detail ? ` — ${detail}` : ""),
        );
        // Rate limits and server errors are worth another try; any other 4xx is definitive.
        if (response.status === 429 || response.status >= 500) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      const transient =
        error?.name === "TimeoutError" ||
        error?.name === "AbortError" ||
        error instanceof TypeError;
      if (!transient) {
        throw error;
      }
      lastError = new Error(
        `ElevenLabs TTS request failed: ${error.message || error.name} (attempt ${attempt + 1})`,
      );
    }
  }

  throw lastError;
}

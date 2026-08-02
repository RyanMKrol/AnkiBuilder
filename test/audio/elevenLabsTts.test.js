import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";
import { fetchElevenLabsTts } from "../../src/audio/elevenLabsTts.js";

const noWait = () => Promise.resolve();

function okResponse(bytes = "MP3-BYTES") {
  return {
    ok: true,
    arrayBuffer: async () => Buffer.from(bytes),
  };
}

function errorResponse(status, statusText, body) {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  };
}

test("returns the clip bytes and sends text/model/language in the body", async () => {
  let captured;
  const buf = await fetchElevenLabsTts("こんにちは", "voice1", "key1", "ja", "eleven_v3", {
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return okResponse();
    },
    wait: noWait,
  });

  assert.equal(buf.toString(), "MP3-BYTES");
  assert.match(captured.url, /text-to-speech\/voice1$/);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.text, "こんにちは");
  assert.equal(body.model_id, "eleven_v3");
  assert.equal(body.language_code, "ja");
  assert.ok(captured.init.signal, "every request carries an abort signal");
});

test("surfaces the ElevenLabs error body detail, not just the status text", async () => {
  await assert.rejects(
    () =>
      fetchElevenLabsTts("text", "v", "k", null, "m", {
        fetchImpl: async () =>
          errorResponse(401, "Unauthorized", JSON.stringify({ detail: "invalid api key" })),
        wait: noWait,
      }),
    /401 Unauthorized — invalid api key/,
  );
});

test("retries a 429 with backoff and succeeds", async () => {
  let calls = 0;
  const waits = [];
  const buf = await fetchElevenLabsTts("text", "v", "k", null, "m", {
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? errorResponse(429, "Too Many Requests", JSON.stringify({ detail: "rate limited" }))
        : okResponse("second");
    },
    wait: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(buf.toString(), "second");
});

test("a definitive 4xx throws immediately with no retry", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchElevenLabsTts("text", "v", "k", null, "m", {
        fetchImpl: async () => {
          calls++;
          return errorResponse(400, "Bad Request", JSON.stringify({ detail: "bad voice" }));
        },
        wait: noWait,
      }),
    /400 Bad Request — bad voice/,
  );
  assert.equal(calls, 1);
});

test("a timeout counts as transient: retried, then reported once retries run out", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchElevenLabsTts("text", "v", "k", null, "m", {
        fetchImpl: async () => {
          calls++;
          const error = new Error("The operation was aborted due to timeout");
          error.name = "TimeoutError";
          throw error;
        },
        retries: 2,
        wait: noWait,
      }),
    /ElevenLabs TTS request failed:.*timeout/i,
  );
  assert.equal(calls, 3); // initial + 2 retries
});

test("a 5xx retries and the last error surfaces when all attempts fail", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchElevenLabsTts("text", "v", "k", null, "m", {
        fetchImpl: async () => {
          calls++;
          return errorResponse(503, "Service Unavailable", "");
        },
        retries: 1,
        wait: noWait,
      }),
    /503 Service Unavailable/,
  );
  assert.equal(calls, 2);
});

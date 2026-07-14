import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";
import { renderAudioReviewPage } from "../../src/review/renderAudioReviewPage.js";

function cards(overrides = {}) {
  return {
    meta: { targetLanguage: "Japanese", sourceType: "epub" },
    items: [
      {
        id: "hello",
        english: "Hello",
        category: "Greetings",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        audio: "abc123.mp3",
      },
    ],
    ...overrides,
  };
}

test("renderAudioReviewPage() embeds the audio file as a base64 data URI, read via the injected readFile", () => {
  let requestedPath = null;
  const readFile = (path) => {
    requestedPath = path;
    return Buffer.from("fake-mp3-bytes");
  };

  const html = renderAudioReviewPage(cards(), { audioDir: "/runs/x/audio", readFile });

  assert.match(requestedPath, /\/runs\/x\/audio[/\\]abc123\.mp3$/);
  const expectedBase64 = Buffer.from("fake-mp3-bytes").toString("base64");
  assert.match(html, new RegExp(`data:audio/mpeg;base64,${expectedBase64}`));
  assert.match(html, /<audio controls/);
});

test("renderAudioReviewPage() renders a placeholder for an item with no audio field", () => {
  const html = renderAudioReviewPage(
    cards({ items: [{ ...cards().items[0], audio: undefined }] }),
    {
      audioDir: "/runs/x/audio",
      readFile: () => {
        throw new Error("should not be called");
      },
    },
  );

  assert.match(html, /<span class="empty">no audio<\/span>/);
});

test("renderAudioReviewPage() uses regenerate mode", () => {
  const html = renderAudioReviewPage(cards(), {
    audioDir: "/runs/x/audio",
    readFile: () => Buffer.from("x"),
  });
  assert.match(html, /"flagged"/);
  assert.match(html, /"regenerate audio for"/);
  assert.match(html, /No rows flagged for regeneration\./);
});

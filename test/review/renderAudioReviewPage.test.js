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

test("renderAudioReviewPage() switches to audio-alt mode with an Alt column when any card has altAudio", () => {
  const withAlt = cards({
    items: [
      {
        id: "hachi",
        english: "eight",
        category: "Time",
        target: "はちじ",
        pronunciation: "hachiji",
        audio: "def.mp3",
        altAudio: "def-alt.mp3",
      },
    ],
  });
  const html = renderAudioReviewPage(withAlt, {
    audioDir: "/runs/x/audio",
    readFile: () => Buffer.from("x"),
  });

  assert.match(html, /<th>Alt \(no 。\)<\/th>/);
  assert.match(html, /<th>Audio \(。\)<\/th>/);
  assert.match(html, /"audio-alt"/);
  // two <audio> players for the row (default + alt)
  assert.equal((html.match(/<audio controls/g) || []).length, 2);
  assert.match(html, /data-has-alt="1"/);
  assert.match(html, /to switch to alt/);
  assert.doesNotMatch(html, /"regenerate audio for"/);
});

test("renderAudioReviewPage() marks a row with no alt clip as data-has-alt=0 and shows a placeholder", () => {
  const mixed = cards({
    items: [
      {
        id: "a",
        english: "eight",
        category: "Time",
        target: "はちじ",
        pronunciation: "hachiji",
        audio: "a.mp3",
        altAudio: "a-alt.mp3",
      },
      {
        id: "b",
        english: "nine",
        category: "Time",
        target: "くじ",
        pronunciation: "kuji",
        audio: "b.mp3",
      },
    ],
  });
  const html = renderAudioReviewPage(mixed, {
    audioDir: "/runs/x/audio",
    readFile: () => Buffer.from("x"),
  });
  assert.match(html, /data-has-alt="1"/);
  assert.match(html, /data-has-alt="0"/);
  assert.match(html, /<span class="empty">no alt<\/span>/);
});

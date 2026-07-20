import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "buffer";
import { renderDeckViewPage } from "../../src/review/renderDeckViewPage.js";

const sections = () => [
  {
    leaf: "Lesson 1",
    cards: [
      {
        english: "Hello",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        category: "Greetings",
        note: "",
        audioData: Buffer.from("clip1"),
      },
      {
        english: "Bye",
        target: "さようなら",
        pronunciation: "sayounara",
        category: "",
        note: "casual",
        audioData: null,
      },
    ],
  },
];

test("renderDeckViewPage embeds one player per card with audio, global numbering, and a font", () => {
  const html = renderDeckViewPage({
    title: "My Book",
    sections: sections(),
    startNumber: 5,
    fontBase64: "AAAA",
  });

  assert.match(html, /My Book/);
  assert.match(html, /Lesson 1/);
  assert.match(html, /こんにちは/);
  // each lesson is a collapsible <details>, collapsed by default (no `open` attribute)
  assert.match(html, /<details class="lesson">/);
  assert.doesNotMatch(html, /<details class="lesson" open>/);
  assert.match(html, /<summary>/);
  // expand/collapse-all controls are present
  assert.match(html, /Expand all/);
  assert.match(html, /Collapse all/);
  // only the card with audioData gets a player
  assert.equal((html.match(/<audio controls/g) || []).length, 1);
  assert.match(html, /data:audio\/mpeg;base64,Y2xpcDE=/); // base64("clip1")
  // the audio-less card shows a placeholder
  assert.match(html, /class="x">—/);
  // global numbering starts at startNumber and increments
  assert.match(html, /class="num">5</);
  assert.match(html, /class="num">6</);
  // embedded font
  assert.match(html, /@font-face/);
  assert.match(html, /data:font\/woff2;base64,AAAA/);
});

test("renderDeckViewPage omits the @font-face when no font is provided", () => {
  const html = renderDeckViewPage({ title: "My Book", sections: sections() });
  assert.doesNotMatch(html, /@font-face/);
  // numbering defaults to 1
  assert.match(html, /class="num">1</);
});

test("renderDeckViewPage shows a part label when given", () => {
  const html = renderDeckViewPage({
    title: "My Book",
    sections: sections(),
    partLabel: "Part 2 of 3",
  });
  assert.match(html, /Part 2 of 3/);
});

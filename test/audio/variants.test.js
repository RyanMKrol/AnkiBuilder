import test from "node:test";
import assert from "node:assert/strict";
import { cardAudioVariants } from "../../src/audio/variants.js";

const texts = (card) => cardAudioVariants(card, "ja").map((v) => v.ttsText);
const labels = (card) => cardAudioVariants(card, "ja").map((v) => v.label);

// There used to be a third axis offering each form with and without a trailing 。. It existed to work
// around ElevenLabs clipping and mis-rendering short clips; the end marker (src/audio/ttsMarker.js)
// covers both, and the 。 is now part of that marker rather than a choice about the card's text — so
// there is no longer a meaningful with-dot / without-dot take to pick between. What remains is the two
// axes that genuinely change WHICH WORDS are spoken.

test("a plain card offers a single take — there is nothing to choose between", () => {
  const card = { target: "ほん" };
  assert.deepEqual(texts(card), ["ほん"]);
  assert.deepEqual(labels(card), ["default"]);
});

test("comma card → 2 takes, with and without the 、", () => {
  const card = { target: "じゃ、また" };
  assert.deepEqual(texts(card), ["じゃ、また", "じゃまた"]);
  assert.deepEqual(labels(card), ["with 、", "no 、"]);
});

test("bracket card → 2 takes, labelled by the bracketed content", () => {
  const card = { target: "おつかれさま（でした）" };
  assert.deepEqual(texts(card), ["おつかれさまでした", "おつかれさま"]);
  assert.deepEqual(labels(card), ["with でした", "no でした"]);
});

test("bracket + comma card → 4 takes (the remaining Cartesian product)", () => {
  const card = { target: "（あ）い、ろ" };
  assert.equal(cardAudioVariants(card, "ja").length, 4);
});

test("editorial spaces are stripped from the spoken text", () => {
  assert.deepEqual(texts({ target: "これは ほん です" }), ["これはほんです"]);
});

test("speaks the kana ttsText when present, not the digit/kanji target", () => {
  assert.deepEqual(texts({ target: "２ほん", ttsText: "にほん" }), ["にほん"]);
});

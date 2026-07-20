import test from "node:test";
import assert from "node:assert/strict";
import { cardAudioVariants } from "../../src/audio/variants.js";

const texts = (card) => cardAudioVariants(card, "ja").map((v) => v.ttsText);
const labels = (card) => cardAudioVariants(card, "ja").map((v) => v.label);

test("plain ja card → 2 takes (no 。 / with 。)", () => {
  const card = { target: "ほん" };
  assert.deepEqual(texts(card), ["ほん", "ほん。"]);
  assert.deepEqual(labels(card), ["no 。", "。"]);
});

test("comma card → 4 takes (with/without 、 × dot)", () => {
  const card = { target: "じゃ、また" };
  assert.deepEqual(texts(card), ["じゃ、また", "じゃ、また。", "じゃまた", "じゃまた。"]);
  assert.deepEqual(labels(card), [
    "with 、 · no 。",
    "with 、 · 。",
    "no 、 · no 。",
    "no 、 · 。",
  ]);
});

test("bracket card → 4 takes (full/short × dot), labelled by the bracketed content", () => {
  const card = { target: "おつかれさま（でした）" };
  assert.deepEqual(texts(card), [
    "おつかれさまでした",
    "おつかれさまでした。",
    "おつかれさま",
    "おつかれさま。",
  ]);
  assert.deepEqual(labels(card), [
    "with でした · no 。",
    "with でした · 。",
    "no でした · no 。",
    "no でした · 。",
  ]);
});

test("bracket + comma card → 8 takes (full Cartesian)", () => {
  const card = { target: "（あ）い、ろ" };
  assert.equal(cardAudioVariants(card, "ja").length, 8);
});

test("editorial spaces are stripped from the spoken text", () => {
  assert.deepEqual(texts({ target: "これは ほん です" }), ["これはほんです", "これはほんです。"]);
});

test("speaks the kana reading when present, not the digit/kanji target", () => {
  assert.deepEqual(texts({ target: "２ほん", reading: "にほん" }), ["にほん", "にほん。"]);
});

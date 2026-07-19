import test from "node:test";
import assert from "node:assert";
import { normalizeTtsText, getTtsTextTransform } from "../../src/audio/ttsText.js";

test("ja: strips ASCII and fullwidth spaces so they aren't voiced as pauses", () => {
  assert.equal(
    normalizeTtsText("これは フランスの ワインです。", "ja"),
    "これはフランスのワインです。",
  );
  assert.equal(normalizeTtsText("レストランは ごかいです。", "ja"), "レストランはごかいです。");
  assert.equal(normalizeTtsText("ちか　いっかい", "ja"), "ちかいっかい"); // fullwidth space U+3000
});

test("ja: a string with no spaces is unchanged", () => {
  assert.equal(normalizeTtsText("ふたつ", "ja"), "ふたつ");
});

test("a language with no transform (spaces are real word boundaries) is left untouched", () => {
  assert.equal(normalizeTtsText("buenos días amigo", "es"), "buenos días amigo");
  assert.equal(getTtsTextTransform("es"), undefined);
});

test("getTtsTextTransform returns the ja transform", () => {
  assert.equal(typeof getTtsTextTransform("ja"), "function");
});

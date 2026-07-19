import test from "node:test";
import assert from "node:assert";
import { normalizeDisplayText, isSpaceFreeLanguage } from "../../src/model/scriptSpacing.js";

test("ja: strips editorial spaces AND the trailing 。 from display text", () => {
  assert.equal(
    normalizeDisplayText("あの あおい Tシャツは 3,000えんです。", "ja"),
    "あのあおいTシャツは3,000えんです",
  );
  assert.equal(normalizeDisplayText("ちか　いっかい", "ja"), "ちかいっかい"); // U+3000
});

test("ja: strips a trailing 。 but leaves a mid-string 。 (two sentences) intact", () => {
  assert.equal(
    normalizeDisplayText("はじめまして。ライアンです。", "ja"),
    "はじめまして。ライアンです",
  );
});

test("ja: text with no spaces or trailing 。 is unchanged", () => {
  assert.equal(normalizeDisplayText("ねこ", "ja"), "ねこ");
});

test("space-using languages are left untouched (spaces + terminal punctuation kept)", () => {
  assert.equal(normalizeDisplayText("buenos días.", "es"), "buenos días.");
  assert.equal(isSpaceFreeLanguage("es"), false);
});

test("isSpaceFreeLanguage is true for Japanese", () => {
  assert.equal(isSpaceFreeLanguage("ja"), true);
});

test("non-string input passes through", () => {
  assert.equal(normalizeDisplayText(null, "ja"), null);
  assert.equal(normalizeDisplayText(undefined, "ja"), undefined);
});

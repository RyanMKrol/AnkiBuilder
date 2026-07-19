import test from "node:test";
import assert from "node:assert";
import { stripEditorialSpaces, isSpaceFreeLanguage } from "../../src/model/scriptSpacing.js";

test("ja: strips editorial spaces (ASCII and fullwidth) from display text", () => {
  assert.equal(
    stripEditorialSpaces("あの あおい Tシャツは 3,000えんです。", "ja"),
    "あのあおいTシャツは3,000えんです。",
  );
  assert.equal(stripEditorialSpaces("ちか　いっかい", "ja"), "ちかいっかい"); // U+3000
});

test("ja: text without spaces is unchanged", () => {
  assert.equal(stripEditorialSpaces("ねこ", "ja"), "ねこ");
});

test("space-using languages are left untouched (spaces are real word boundaries)", () => {
  assert.equal(stripEditorialSpaces("buenos días", "es"), "buenos días");
  assert.equal(isSpaceFreeLanguage("es"), false);
});

test("isSpaceFreeLanguage is true for Japanese", () => {
  assert.equal(isSpaceFreeLanguage("ja"), true);
});

test("non-string input passes through", () => {
  assert.equal(stripEditorialSpaces(null, "ja"), null);
  assert.equal(stripEditorialSpaces(undefined, "ja"), undefined);
});

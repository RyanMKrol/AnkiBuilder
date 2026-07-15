import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/zh.js";

test("romanize() converts Mandarin hanzi to tone-marked pinyin", async () => {
  const result = await romanize("你好");
  assert.equal(result, "nǐ hǎo");
});

test("romanize() returns a Promise even though pinyin-pro's own API is synchronous", () => {
  const result = romanize("你好");
  assert.ok(typeof result.then === "function");
});

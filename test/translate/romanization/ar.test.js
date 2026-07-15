import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/ar.js";

test("romanize() converts Arabic text to IJMES transliteration", async () => {
  const result = await romanize("مرحبا");
  assert.equal(result, "mrḥba");
});

test("romanize() returns a Promise even though arabic-transliterate's own API is synchronous", () => {
  const result = romanize("مرحبا");
  assert.ok(typeof result.then === "function");
});

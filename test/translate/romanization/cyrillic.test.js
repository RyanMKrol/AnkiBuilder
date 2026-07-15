import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/cyrillic.js";

test("romanize() converts Russian Cyrillic text to Latin transliteration", async () => {
  const result = await romanize("Привет");
  assert.equal(result, "Privet");
});

test("romanize() returns a Promise even though cyrillic-to-translit-js's own API is synchronous", () => {
  const result = romanize("Привет");
  assert.ok(typeof result.then === "function");
});

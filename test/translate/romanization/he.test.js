import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/he.js";

test("romanize() converts niqqud-pointed Hebrew text to SBL transliteration", async () => {
  const result = await romanize("שָׁלוֹם");
  assert.equal(result, "šālôm");
});

test("romanize() returns a Promise even though hebrew-transliteration's own API is synchronous", () => {
  const result = romanize("שָׁלוֹם");
  assert.ok(typeof result.then === "function");
});

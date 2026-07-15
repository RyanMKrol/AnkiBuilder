import test from "node:test";
import assert from "node:assert";
import { romanize } from "../../../src/translate/romanization/indic.js";

test("romanize() converts Devanagari text to IAST transliteration", async () => {
  const result = await romanize("नमस्ते");
  assert.equal(result, "namaste");
});

test("romanize() returns a Promise even though sanscript's own API is synchronous", () => {
  const result = romanize("नमस्ते");
  assert.ok(typeof result.then === "function");
});

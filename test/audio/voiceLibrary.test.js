import test from "node:test";
import assert from "node:assert";
import { getDefaultVoice } from "../../src/audio/voiceLibrary.js";

test("getDefaultVoice() returns the configured default voice for a known language", () => {
  assert.equal(getDefaultVoice("ja"), "3JDquces8E8bkmvbh6Bc");
});

test("getDefaultVoice() returns undefined for a language with no configured default", () => {
  assert.equal(getDefaultVoice("es"), undefined);
  assert.equal(getDefaultVoice("fr"), undefined);
});

test("getDefaultVoice() returns undefined for null/undefined without throwing", () => {
  assert.equal(getDefaultVoice(null), undefined);
  assert.equal(getDefaultVoice(undefined), undefined);
});

import test from "node:test";
import assert from "node:assert";
import { ALT_AUDIO_TRANSFORMS, getAltAudioTransform } from "../../src/audio/altAudio.js";

test("Japanese appends a 。 to the spoken text", () => {
  const transform = getAltAudioTransform("ja");
  assert.equal(typeof transform, "function");
  assert.equal(transform("はちじ"), "はちじ。");
  assert.equal(transform("いま さんじです。"), "いま さんじです。。"); // idempotence isn't promised — always appends
});

test("returns undefined for a language with no alt-audio config", () => {
  assert.equal(getAltAudioTransform("en"), undefined);
  assert.equal(getAltAudioTransform("es"), undefined);
  assert.equal(getAltAudioTransform(null), undefined);
  assert.equal(getAltAudioTransform(undefined), undefined);
});

test("every configured transform is a function", () => {
  for (const [lang, transform] of Object.entries(ALT_AUDIO_TRANSFORMS)) {
    assert.equal(typeof transform, "function", `${lang} transform must be a function`);
    assert.equal(typeof transform("x"), "string", `${lang} transform must return a string`);
  }
});

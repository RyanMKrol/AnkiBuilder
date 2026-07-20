import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKanjiOrthographyPrompt,
  generateCardKanji,
} from "../../src/audio/kanjiOrthography.js";

test("buildKanjiOrthographyPrompt converts the reading (spoken form) and asks for a kanji object", () => {
  const p = buildKanjiOrthographyPrompt({
    id: "s",
    english: "10 to 6",
    reading: "じゅうじからろくじ",
    target: "１０じから６じ",
  });
  assert.match(p, /じゅうじからろくじ/); // the reading is what we convert
  assert.match(p, /"kanji"/);
});

test("buildKanjiOrthographyPrompt falls back to target when there's no reading", () => {
  const p = buildKanjiOrthographyPrompt({ id: "s", english: "hi", target: "こんにちは" });
  assert.match(p, /こんにちは/);
});

test("generateCardKanji parses the kanji string (and strips a code fence)", () => {
  const item = { id: "s", english: "x", reading: "じゅうじ", target: "１０じ" };
  assert.equal(generateCardKanji(item, { runClaude: () => '{ "kanji": "十時" }' }), "十時");
  assert.equal(
    generateCardKanji(item, { runClaude: () => '```json\n{ "kanji": "十時" }\n```' }),
    "十時",
  );
});

test("generateCardKanji throws on invalid JSON or a missing kanji field", () => {
  const item = { id: "s", english: "x", reading: "a", target: "a" };
  assert.throws(() => generateCardKanji(item, { runClaude: () => "not json" }), /not valid JSON/);
  assert.throws(() => generateCardKanji(item, { runClaude: () => "{}" }), /no `kanji`/);
});

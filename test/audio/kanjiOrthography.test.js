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
    ttsText: "じゅうじからろくじ",
    target: "１０じから６じ",
  });
  assert.match(p, /じゅうじからろくじ/); // the reading is what we convert
  assert.match(p, /"kanji"/);
});

test("buildKanjiOrthographyPrompt falls back to target when there's no reading", () => {
  const p = buildKanjiOrthographyPrompt({ id: "s", english: "hi", target: "こんにちは" });
  assert.match(p, /こんにちは/);
});

test("generateCardKanji parses the kanji string (and strips a code fence)", async () => {
  const item = { id: "s", english: "x", ttsText: "じゅうじ", target: "１０じ" };
  assert.equal(await generateCardKanji(item, { runClaude: () => '{ "kanji": "十時" }' }), "十時");
  // An async runner (the server-side default) works the same.
  assert.equal(
    await generateCardKanji(item, {
      runClaude: async () => '```json\n{ "kanji": "十時" }\n```',
    }),
    "十時",
  );
});

test("generateCardKanji throws on invalid JSON or a missing kanji field", async () => {
  const item = { id: "s", english: "x", ttsText: "a", target: "a" };
  await assert.rejects(
    () => generateCardKanji(item, { runClaude: () => "not json" }),
    /not valid JSON/,
  );
  await assert.rejects(() => generateCardKanji(item, { runClaude: () => "{}" }), /no `kanji`/);
});

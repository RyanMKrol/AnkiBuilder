import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { generateCardKanjiVariants } from "../../src/audio/generateKanjiVariants.js";

function runDir(items) {
  const dir = mkdtempSync(join(tmpdir(), "genkanji-"));
  writeFileSync(join(dir, "cards.json"), JSON.stringify({ meta: { targetLanguage: "ja" }, items }));
  return dir;
}
const card = (over = {}) => ({
  id: "a",
  english: "x",
  category: "Numbers",
  target: "x",
  pronunciation: "x",
  ...over,
});

test("kanji variants are Japanese-only (422 for any other language)", async () => {
  const dir = runDir([card()]);
  try {
    await assert.rejects(
      () =>
        generateCardKanjiVariants(dir, "a", {
          languageCode: "es",
          voiceId: "v",
          apiKey: "k",
          runClaude: () => '{"kanji":"x"}',
          fetchTts: async () => Buffer.from("z"),
        }),
      (e) => e.status === 422,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generates fresh -genkanji- takes from the kanji orthography and returns the kanji text", async () => {
  const dir = runDir([
    card({
      id: "a",
      english: "ten to six",
      reading: "じゅうじからろくじ",
      target: "１０じから６じ",
    }),
  ]);
  try {
    const calls = [];
    const out = await generateCardKanjiVariants(dir, "a", {
      languageCode: "ja",
      voiceId: "v",
      apiKey: "k",
      runClaude: () => '{ "kanji": "十時から六時" }',
      fetchTts: async (text) => {
        calls.push(text);
        return Buffer.from("clip:" + text);
      },
    });
    // two takes: no 。 and with 。, synthesized from the KANJI text (not the kana)
    assert.deepEqual(
      out.map((v) => v.label),
      ["kanji", "kanji · 。"],
    );
    assert.deepEqual(calls, ["十時から六時", "十時から六時。"]);
    assert.ok(out.every((v) => v.kanji === "十時から六時"));
    assert.ok(out.every((v) => /-genkanji-[0-9a-f]{8}\.mp3$/.test(v.audio)));
    assert.equal(readdirSync(join(dir, "audio")).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("404 when the card doesn't exist", async () => {
  const dir = runDir([card()]);
  try {
    await assert.rejects(
      () =>
        generateCardKanjiVariants(dir, "nope", {
          languageCode: "ja",
          voiceId: "v",
          apiKey: "k",
          runClaude: () => '{"kanji":"x"}',
          fetchTts: async () => Buffer.from("z"),
        }),
      (e) => e.status === 404,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

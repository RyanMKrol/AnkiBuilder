import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { join } from "path";
import {
  readingScheme,
  readingLanguageBlock,
  isSilentReadingCard,
  silentCardPredicate,
} from "../../src/reading/readingSchemes.js";
import { generateAudio } from "../../src/audio/index.js";
import { renderPromptTemplate } from "../../src/util/promptTemplate.js";
import { readingCardRules } from "../../src/util/readingCardRules.js";

// The reading deck's language plugin (docs/designs/reading-decks/05-japanese-plugin.md): Japanese
// declares kanji cards with no audio and kana readings for kanji words; any other language gets word
// cards only.

test("Japanese has a reading scheme; a language without one gets null", () => {
  assert.equal(readingScheme("ja").language, "Japanese");
  assert.equal(readingScheme("fr"), null);
});

test("the Japanese scheme tells characters, single kana and kanji words apart", () => {
  const ja = readingScheme("ja");
  assert.equal(ja.isCharacterTarget("日"), true);
  assert.equal(ja.isCharacterTarget("々"), true);
  assert.equal(ja.isCharacterTarget("映画"), false);
  assert.equal(ja.isCharacterTarget("あ"), false);
  assert.equal(ja.isSingleLetter("あ"), true);
  assert.equal(ja.isSingleLetter("ア"), true);
  assert.equal(ja.isSingleLetter("日"), false);
  assert.equal(ja.requiresReading("映画"), true);
  assert.equal(ja.requiresReading("見る"), true);
  assert.equal(ja.requiresReading("スポーツ"), false);
  assert.equal(ja.isValidReading("えいが"), true);
  assert.equal(ja.isValidReading("コーヒー"), true);
  assert.equal(ja.isValidReading("eiga"), false);
  assert.equal(ja.isValidReading("映が"), false);
});

test("a single kanji with no reading is silent; the same kanji taught as a word is voiced", () => {
  const ja = readingScheme("ja");
  assert.equal(isSilentReadingCard({ target: "日" }, ja), true);
  assert.equal(isSilentReadingCard({ target: "日", ttsText: "ひ" }, ja), false);
  assert.equal(isSilentReadingCard({ target: "映画", ttsText: "えいが" }, ja), false);
  assert.equal(isSilentReadingCard({ target: "日" }, null), false);
});

test("nothing is silent outside a reading collection, or in a language with no scheme", () => {
  const kanji = { target: "日" };
  assert.equal(silentCardPredicate({ targetLanguage: "ja", deckKind: "reading" })(kanji), true);
  assert.equal(silentCardPredicate({ targetLanguage: "ja" })(kanji), false);
  assert.equal(
    silentCardPredicate({ targetLanguage: "ja", deckKind: "speaking-listening" })(kanji),
    false,
  );
  assert.equal(silentCardPredicate({ targetLanguage: "zh", deckKind: "reading" })(kanji), false);
});

test("the prompt block carries the Japanese rules only for Japanese", () => {
  const ja = readingLanguageBlock("ja");
  assert.match(ja, /kanji spelling/);
  assert.match(ja, /COPIED from the book/);
  assert.match(ja, /Never a single hiragana or katakana/);
  const other = readingLanguageBlock("fr");
  assert.doesNotMatch(other, /kanji/i);
  assert.match(other, /no character cards/);
});

test("the audio stage spends nothing on a silent card and clears any clip it had", async () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  const dir = mkdtempSync(join(tmpdir(), "reading-audio-"));
  try {
    const cards = {
      meta: { targetLanguage: "ja" },
      items: [
        { id: "eiga", target: "映画", ttsText: "えいが", english: "Movie" },
        { id: "hi", target: "日", english: "Day; sun", audio: "stale.mp3" },
      ],
    };
    const calls = [];
    const result = await generateAudio(cards, {
      voiceId: "voice123",
      fetchTts: async (term) => {
        calls.push(term);
        return Buffer.from("audio data");
      },
      libraryHomeDir: dir,
      isSilent: silentCardPredicate({ targetLanguage: "ja", deckKind: "reading" }),
    });
    assert.deepEqual(calls, ["えいが。ででで"]);
    assert.ok(result.items[0].audio);
    assert.equal("audio" in result.items[1], false);
  } finally {
    if (originalKey) process.env.ELEVENLABS_API_KEY = originalKey;
    else delete process.env.ELEVENLABS_API_KEY;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a reading prompt gets the reading rules injected; a speaking one never asks for them", () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-rules-"));
  try {
    const path = join(dir, "reading-x-prompt.md");
    writeFileSync(path, "Rules:\n{{READING_CARD_RULES}}\nLanguage: {{TARGET_LANGUAGE}}\n");
    const rendered = renderPromptTemplate(path, { TARGET_LANGUAGE: "Japanese" });
    assert.ok(rendered.includes(readingCardRules()));
    assert.match(rendered, /One card per written form/);
    assert.doesNotMatch(readingCardRules(), /<!--/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reading romaji comes from the kana reading, reuses what is cached, and skips a silent card", async () => {
  const { romanizeReadingItems } = await import("../../src/reading/readingRomaji.js");
  const prompts = [];
  // The correction pass is a model call, faked; the library (kuroshiro) is real and local. On kana
  // alone the library splits えいが as "e iga", which is exactly what the correction pass is for, as
  // it is for the speaking decks.
  const runClaude = (prompt) => {
    prompts.push(prompt);
    return JSON.stringify([{ id: "eiga", pronunciation: "eiga" }]);
  };
  const result = await romanizeReadingItems(
    [
      { id: "eiga", target: "映画", ttsText: "えいが", english: "Movie" },
      { id: "hi", target: "日", english: "Day; sun" },
      { id: "kohii", target: "コーヒー", english: "Coffee" },
    ],
    {
      targetLanguage: "ja",
      isSilent: silentCardPredicate({ targetLanguage: "ja", deckKind: "reading" }),
      cached: { kohii: "kōhī" },
      runClaude,
    },
  );
  const byId = Object.fromEntries(result.items.map((i) => [i.id, i.pronunciation]));
  assert.equal(byId.eiga, "eiga");
  assert.equal(byId.hi, "");
  assert.equal(byId.kohii, "kōhī");
  assert.equal(result.reused, 1);
  assert.deepEqual(
    result.romanized.map((r) => r.id),
    ["eiga"],
  );
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /えいが/);
});

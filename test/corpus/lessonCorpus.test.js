import test from "node:test";
import assert from "node:assert";
import { assembleCorpusFromLessonWords } from "../../src/corpus/lessonCorpus.js";

test("assembleCorpusFromLessonWords() wraps a plain word list into a schema-valid, translate-ready corpus", () => {
  const corpus = assembleCorpusFromLessonWords({
    englishWords: ["Good morning", "China"],
    targetLanguage: "ja",
    runClaude: () =>
      JSON.stringify([
        { id: "good-morning", category: "Greetings" },
        { id: "china", category: "Nationalities & Countries" },
      ]),
  });

  assert.strictEqual(corpus.meta.targetLanguage, "ja");
  assert.strictEqual(corpus.meta.sourceType, "manual");
  assert.strictEqual(corpus.meta.reviewed, false);
  assert.strictEqual(corpus.items.length, 2);

  assert.strictEqual(corpus.items[0].english, "Good morning");
  assert.strictEqual(corpus.items[0].id, "good-morning");
  assert.strictEqual(corpus.items[0].category, "Greetings");
  assert.strictEqual(corpus.items[0].target, null);
  assert.strictEqual(corpus.items[0].notes, null);

  assert.strictEqual(corpus.items[1].english, "China");
  assert.strictEqual(corpus.items[1].category, "Nationalities & Countries");
});

test("assembleCorpusFromLessonWords() disambiguates two words that slugify to the same id", () => {
  const corpus = assembleCorpusFromLessonWords({
    englishWords: ["Good morning!", "good morning"],
    targetLanguage: "ja",
    runClaude: () => JSON.stringify([]),
  });

  assert.notEqual(corpus.items[0].id, corpus.items[1].id);
  assert.strictEqual(corpus.items[0].id, "good-morning");
  assert.strictEqual(corpus.items[1].id, "good-morning-2");
});

test("assembleCorpusFromLessonWords() defaults to 'Other' when the model omits an item's category", () => {
  const corpus = assembleCorpusFromLessonWords({
    englishWords: ["Good morning", "China"],
    targetLanguage: "ja",
    runClaude: () => JSON.stringify([{ id: "good-morning", category: "Greetings" }]),
    log: () => {},
  });

  assert.strictEqual(corpus.items[0].category, "Greetings");
  assert.strictEqual(corpus.items[1].category, "Other");
});

test("assembleCorpusFromLessonWords() defaults to 'Other' when the model returns an invalid category", () => {
  const corpus = assembleCorpusFromLessonWords({
    englishWords: ["Good morning"],
    targetLanguage: "ja",
    runClaude: () => JSON.stringify([{ id: "good-morning", category: "Not A Real Category" }]),
    log: () => {},
  });

  assert.strictEqual(corpus.items[0].category, "Other");
});

test("assembleCorpusFromLessonWords() fails open to 'Other' for a whole batch on unparseable model output", () => {
  const corpus = assembleCorpusFromLessonWords({
    englishWords: ["Good morning", "China"],
    targetLanguage: "ja",
    runClaude: () => "not json at all",
    log: () => {},
  });

  assert.strictEqual(corpus.items[0].category, "Other");
  assert.strictEqual(corpus.items[1].category, "Other");
});

test("assembleCorpusFromLessonWords() strips a markdown fence around the model's response", () => {
  const corpus = assembleCorpusFromLessonWords({
    englishWords: ["Good morning"],
    targetLanguage: "ja",
    runClaude: () => '```json\n[{"id": "good-morning", "category": "Greetings"}]\n```',
  });

  assert.strictEqual(corpus.items[0].category, "Greetings");
});

test("assembleCorpusFromLessonWords() categorizes the whole list in a single runClaude call", () => {
  const calls = [];
  assembleCorpusFromLessonWords({
    englishWords: Array.from({ length: 12 }, (_, i) => `word ${i}`),
    targetLanguage: "ja",
    runClaude: (prompt) => {
      calls.push(prompt);
      return JSON.stringify([]);
    },
  });

  // No chunking — one call covers all 12 words.
  assert.strictEqual(calls.length, 1);
});

test("assembleCorpusFromLessonWords() throws on an empty word list", () => {
  assert.throws(() => {
    assembleCorpusFromLessonWords({ englishWords: [], targetLanguage: "ja" });
  }, /non-empty array/);
});

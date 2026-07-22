import test from "node:test";
import assert from "node:assert";
import { assembleCorpusFromChapter } from "../../src/corpus/epubLlmCorpus.js";

test("assembleCorpusFromChapter() wraps extracted items into a schema-valid corpus", () => {
  const corpus = assembleCorpusFromChapter({
    chapterFilePath: "/tmp/chapter.xhtml",
    targetLanguage: "Japanese",
    runClaude: () =>
      JSON.stringify([
        { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
      ]),
  });

  assert.strictEqual(corpus.meta.targetLanguage, "Japanese");
  assert.strictEqual(corpus.meta.sourceType, "epub");
  assert.strictEqual(corpus.meta.reviewed, false);
  assert.strictEqual(corpus.items.length, 1);
  assert.strictEqual(corpus.items[0].target, "こんにちは");
  assert.strictEqual(corpus.items[0].cardNote, null);
  assert.strictEqual(corpus.items[0].reviewNote, null);
});

test("assembleCorpusFromChapter() carries cardNote/reviewNote; routes a legacy blended notes → reviewNote", () => {
  const corpus = assembleCorpusFromChapter({
    chapterFilePath: "/tmp/chapter.xhtml",
    targetLanguage: "Japanese",
    runClaude: () =>
      JSON.stringify([
        {
          id: "split",
          english: "Please",
          target: "おねがいします",
          category: "Greetings",
          cardNote: "polite request",
          reviewNote: "source shows 〜を おねがいします",
        },
        // A legacy extractor that still emits a blended `notes` → routed to reviewNote (never leaks).
        {
          id: "legacy",
          english: "Hello",
          target: "こんにちは",
          category: "Greetings",
          notes: "a hint",
        },
      ]),
  });

  assert.strictEqual(corpus.items[0].cardNote, "polite request");
  assert.strictEqual(corpus.items[0].reviewNote, "source shows 〜を おねがいします");
  assert.strictEqual(corpus.items[1].cardNote, null);
  assert.strictEqual(corpus.items[1].reviewNote, "a hint");
});

test("assembleCorpusFromChapter() preserves uncertain/aiSuggested flags when true, omits when false/absent", () => {
  const corpus = assembleCorpusFromChapter({
    chapterFilePath: "/tmp/chapter.xhtml",
    targetLanguage: "Japanese",
    runClaude: () =>
      JSON.stringify([
        {
          id: "guess",
          english: "Guessed word",
          target: "推測",
          category: "Other",
          uncertain: true,
        },
        {
          id: "gap",
          english: "Thank you",
          target: "ありがとう",
          category: "Greetings",
          aiSuggested: true,
        },
        {
          id: "plain",
          english: "Hello",
          target: "こんにちは",
          category: "Greetings",
          uncertain: false,
        },
      ]),
  });

  assert.strictEqual(corpus.items[0].uncertain, true);
  assert.strictEqual(corpus.items[0].aiSuggested, undefined);
  assert.strictEqual(corpus.items[1].aiSuggested, true);
  assert.strictEqual(corpus.items[1].uncertain, undefined);
  assert.strictEqual(corpus.items[2].uncertain, undefined);
});

test("assembleCorpusFromChapter() threads bookConventions into the extraction prompt", () => {
  let capturedPrompt = null;
  assembleCorpusFromChapter({
    chapterFilePath: "/tmp/chapter.xhtml",
    targetLanguage: "Japanese",
    bookConventions: "Placeholders in this book use 〜.",
    runClaude: (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify([
        { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
      ]);
    },
  });

  assert.match(capturedPrompt, /Placeholders in this book use 〜\./);
});

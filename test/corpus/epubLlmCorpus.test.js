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
  assert.strictEqual(corpus.items[0].notes, null);
});

test("assembleCorpusFromChapter() preserves a real notes string instead of nulling it", () => {
  const corpus = assembleCorpusFromChapter({
    chapterFilePath: "/tmp/chapter.xhtml",
    targetLanguage: "Japanese",
    runClaude: () =>
      JSON.stringify([
        {
          id: "hello",
          english: "Hello",
          target: "こんにちは",
          category: "Greetings",
          notes: "a hint",
        },
      ]),
  });

  assert.strictEqual(corpus.items[0].notes, "a hint");
});

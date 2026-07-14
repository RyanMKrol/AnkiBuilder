import test from "node:test";
import assert from "node:assert";
import { extractChapterViaLlm } from "../../src/corpus/epubLlmExtract.js";

const BASE_ARGS = { chapterFilePath: "/tmp/chapter.xhtml", targetLanguage: "Japanese" };

test("extractChapterViaLlm() parses a plain JSON array response", () => {
  const items = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify([
        { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
      ]),
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].target, "こんにちは");
});

test("extractChapterViaLlm() strips a markdown fence wrapping the whole response", () => {
  const items = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      '```json\n[{"id": "hello", "english": "Hello", "target": "こんにちは", "category": "Greetings"}]\n```',
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, "hello");
});

test("extractChapterViaLlm() extracts a fenced block even with prose commentary around it", () => {
  const items = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      "Now I'll extract the flashcards according to the specifications:\n\n" +
      '```json\n[{"id": "hello", "english": "Hello", "target": "こんにちは", "category": "Greetings"}]\n```\n\n' +
      "That covers the chapter.",
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, "hello");
});

test("extractChapterViaLlm() preserves optional notes/uncertain/aiSuggested fields", () => {
  const items = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify([
        {
          id: "nihonjin",
          english: "Japanese (person)",
          target: "にほんじん",
          category: "Nationalities & Countries",
          notes: "inferred, not separately glossed",
          uncertain: true,
        },
        {
          id: "arigatou",
          english: "thank you",
          target: "ありがとう",
          category: "Greetings",
          notes: "genuine gap",
          aiSuggested: true,
        },
      ]),
  });

  assert.strictEqual(items[0].uncertain, true);
  assert.strictEqual(items[1].aiSuggested, true);
});

test("extractChapterViaLlm() throws when category is not one of the canonical values", () => {
  assert.throws(() => {
    extractChapterViaLlm({
      ...BASE_ARGS,
      runClaude: () =>
        JSON.stringify([
          { id: "hello", english: "Hello", target: "こんにちは", category: "Not A Category" },
        ]),
    });
  }, /invalid "category"/);
});

test("extractChapterViaLlm() throws when the response is not valid JSON", () => {
  assert.throws(() => {
    extractChapterViaLlm({ ...BASE_ARGS, runClaude: () => "not json at all" });
  }, /not valid JSON/);
});

test("extractChapterViaLlm() throws when the response is a JSON object, not an array", () => {
  assert.throws(() => {
    extractChapterViaLlm({ ...BASE_ARGS, runClaude: () => JSON.stringify({ id: "hello" }) });
  }, /must be a JSON array/);
});

test("extractChapterViaLlm() throws when an item is missing a required field", () => {
  assert.throws(() => {
    extractChapterViaLlm({
      ...BASE_ARGS,
      runClaude: () => JSON.stringify([{ id: "hello", english: "Hello" }]),
    });
  }, /missing required string field "target"/);
});

test("extractChapterViaLlm() throws when uncertain is present but not a boolean", () => {
  assert.throws(() => {
    extractChapterViaLlm({
      ...BASE_ARGS,
      runClaude: () =>
        JSON.stringify([
          {
            id: "hello",
            english: "Hello",
            target: "こんにちは",
            category: "Greetings",
            uncertain: "yes",
          },
        ]),
    });
  }, /"uncertain" must be a boolean/);
});

test("extractChapterViaLlm() passes the rendered prompt (with resolved path) to runClaude", () => {
  let capturedPrompt = null;
  extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: (prompt) => {
      capturedPrompt = prompt;
      return "[]";
    },
  });

  assert.match(capturedPrompt, /Japanese-language textbook/);
  assert.match(capturedPrompt, /\/tmp\/chapter\.xhtml/);
});

test("extractChapterViaLlm() threads bookConventions into the rendered prompt", () => {
  let capturedPrompt = null;
  extractChapterViaLlm({
    ...BASE_ARGS,
    bookConventions: "Placeholders in this book use 〜.",
    runClaude: (prompt) => {
      capturedPrompt = prompt;
      return "[]";
    },
  });

  assert.match(capturedPrompt, /Placeholders in this book use 〜\./);
});

test("extractChapterViaLlm() falls back to the no-conventions string when bookConventions is omitted", () => {
  let capturedPrompt = null;
  extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: (prompt) => {
      capturedPrompt = prompt;
      return "[]";
    },
  });

  assert.match(capturedPrompt, /no book-wide conventions available/);
});

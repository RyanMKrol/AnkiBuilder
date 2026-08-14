import test from "node:test";
import assert from "node:assert";
import { extractChapterViaLlm } from "../../src/corpus/epubLlmExtract.js";

const BASE_ARGS = { chapterFilePath: "/tmp/chapter.xhtml", targetLanguage: "Japanese" };

test("extractChapterViaLlm() parses a plain JSON array response", () => {
  const { items } = extractChapterViaLlm({
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
  const { items } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      '```json\n[{"id": "hello", "english": "Hello", "target": "こんにちは", "category": "Greetings"}]\n```',
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, "hello");
});

test("extractChapterViaLlm() extracts a fenced block even with prose commentary around it", () => {
  const { items } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      "Now I'll extract the flashcards according to the specifications:\n\n" +
      '```json\n[{"id": "hello", "english": "Hello", "target": "こんにちは", "category": "Greetings"}]\n```\n\n' +
      "That covers the chapter.",
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, "hello");
});

test("extractChapterViaLlm() skips a non-array preamble fence and finds the real payload fence", () => {
  const { items } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      "The chapter mentions a pattern like:\n\n```\n〜を おねがいします\n```\n\nHere are the cards:\n\n" +
      '```json\n[{"id": "hello", "english": "Hello", "target": "こんにちは", "category": "Greetings"}]\n```',
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, "hello");
});

test("extractChapterViaLlm() falls back to the first-[ to last-] span when prose surrounds bare JSON", () => {
  const { items } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      "Confirmed — extracting now.\n" +
      '[{"id": "hello", "english": "Hello", "target": "こんにちは", "category": "Greetings"}]\n' +
      "That covers the chapter.",
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, "hello");
});

test("extractChapterViaLlm() preserves optional reviewNote/uncertain/aiSuggested fields", () => {
  const { items } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify([
        {
          id: "nihonjin",
          english: "Japanese (person)",
          target: "にほんじん",
          category: "Nationalities & Countries",
          reviewNote: "inferred, not separately glossed",
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

test("extractChapterViaLlm() throws when the response is an object with no items array", () => {
  assert.throws(() => {
    extractChapterViaLlm({ ...BASE_ARGS, runClaude: () => JSON.stringify({ id: "hello" }) });
  }, /must be a JSON array of items, or an object with an `items` array/);
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

test("extractChapterViaLlm() accepts an optional ttsText, throws when it is not a string", () => {
  const { items } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify([
        {
          id: "yen-2000",
          english: "2,000 yen",
          target: "2,000えん",
          category: "Money",
          ttsText: "にせんえん",
        },
      ]),
  });
  assert.strictEqual(items[0].ttsText, "にせんえん");

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
            ttsText: 42,
          },
        ]),
    });
  }, /"ttsText" must be a string/);
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

// --- the coverage envelope ---
//
// The gap it closes: a chapter the model could not read produced exactly the output shape of a
// chapter with nothing in it.

test("extractChapterViaLlm() accepts the { items, coverage } envelope", () => {
  const { items, coverage } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify({
        items: [{ id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" }],
        coverage: {
          imagesOpened: ["images/p1.jpg"],
          imagesSkippedAsDecorative: ["images/banner.png"],
          concerns: ["the kana chart is an image I could not read"],
        },
      }),
  });

  assert.strictEqual(items.length, 1);
  assert.deepStrictEqual(coverage.imagesOpened, ["images/p1.jpg"]);
  assert.deepStrictEqual(coverage.concerns, ["the kana chart is an image I could not read"]);
});

test("extractChapterViaLlm() still accepts a bare array, reporting no coverage", () => {
  const { items, coverage } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify([
        { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
      ]),
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(coverage, null);
});

test("a malformed coverage block loses the coverage, never the items", () => {
  const { items, coverage } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      JSON.stringify({
        items: [{ id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" }],
        coverage: "I opened everything",
      }),
  });

  assert.strictEqual(items.length, 1);
  assert.strictEqual(coverage, null);
});

test("the envelope survives a markdown fence and surrounding prose", () => {
  const { items, coverage } = extractChapterViaLlm({
    ...BASE_ARGS,
    runClaude: () =>
      "Here is the extraction:\n\n```json\n" +
      JSON.stringify({
        items: [{ id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" }],
        coverage: { imagesOpened: [], imagesSkippedAsDecorative: [], concerns: [] },
      }) +
      "\n```\n\nDone.",
  });

  assert.strictEqual(items.length, 1);
  assert.deepStrictEqual(coverage.imagesOpened, []);
});

test("the model's stated concerns are logged", () => {
  const logged = [];
  extractChapterViaLlm({
    ...BASE_ARGS,
    log: (line) => logged.push(line),
    runClaude: () =>
      JSON.stringify({
        items: [],
        coverage: {
          imagesOpened: [],
          imagesSkippedAsDecorative: [],
          concerns: ["chart unreadable"],
        },
      }),
  });

  assert.match(logged.join("\n"), /extraction concern: chart unreadable/);
});

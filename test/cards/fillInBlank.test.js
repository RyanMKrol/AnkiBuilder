import test from "node:test";
import assert from "node:assert/strict";
import { mineFillInBlankCards, renderFillInBlankPrompt } from "../../src/cards/fillInBlank.js";

const items = [
  {
    id: "shinkansen",
    english: "Bullet train",
    category: "Travel",
    target: "しんかんせん",
    pronunciation: "shinkansen",
  },
  {
    id: "ikimasu",
    english: "To go",
    category: "Travel",
    target: "いきます",
    pronunciation: "ikimasu",
  },
];

const reply = (cards) => () => JSON.stringify({ cards });

const drill = {
  id: "fib-1",
  english: "I'm going by Shinkansen.",
  category: "Travel",
  target: "しんかんせん で いきます。",
  pronunciation: "shinkansen de ikimasu",
  sourcePattern: "[transport] で いきます",
};

test("appends mined drills at the END, flagged as practice cards", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([drill]),
  });

  assert.equal(result.items.length, 3);
  // A drill only ever reuses vocabulary the lesson already introduced, so the block goes last.
  assert.equal(result.items[2].id, "fib-1");
  assert.equal(result.items[2].fillInBlank, true);
  assert.equal(result.items[2].aiSuggested, true);
  assert.deepEqual(result.items.slice(0, 2), items);
  assert.equal(result.patterns["fib-1"], "[transport] で いきます");
});

test("normalizes the target the way the deck writes it (no editorial spaces, no trailing 。)", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([drill]),
  });
  assert.equal(result.items[2].target, "しんかんせんでいきます");
});

test("drops a half-formed card rather than patching it", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([
      { id: "fib-a", english: "Only English" },
      { ...drill, id: "fib-b" },
    ]),
  });
  assert.deepEqual(
    result.added.map((c) => c.id),
    ["fib-b"],
  );
});

test("never collides with an existing card id", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ ...drill, id: "ikimasu" }]),
  });
  assert.equal(result.added.length, 0);
  assert.equal(result.items.length, 2);
});

test("snaps an unrecognized category back to one the lesson uses", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ ...drill, category: "Astrophysics" }]),
  });
  assert.equal(result.added[0].category, "Travel");
});

test("fails open on a malformed response, leaving the lesson untouched", () => {
  const logged = [];
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    log: (line) => logged.push(line),
    runClaude: () => "not json at all",
  });
  assert.deepEqual(result.items, items);
  assert.equal(result.added.length, 0);
  assert.match(logged.join("\n"), /fill-in-the-blank: failed/);
});

test("skips (without calling the model) when the named source file is missing", () => {
  let called = false;
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    chapterFilePath: "/nope/does-not-exist.xhtml",
    log: () => {},
    runClaude: () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.deepEqual(result.items, items);
});

test("the prompt tells the model to read the source file, or to compose from the lesson itself", () => {
  const withSource = renderFillInBlankPrompt({
    cards: items,
    targetLanguage: "ja",
    chapterFilePath: "/tmp/ch7.xhtml",
  });
  assert.match(withSource, /\/tmp\/ch7\.xhtml/);
  assert.match(withSource, /Read that file yourself/);

  const withoutSource = renderFillInBlankPrompt({ cards: items, targetLanguage: "ja" });
  assert.match(withoutSource, /no source document/);
  // Every placeholder resolves — renderPromptTemplate throws otherwise.
  assert.doesNotMatch(withoutSource, /\{\{[A-Z_]+\}\}/);
});

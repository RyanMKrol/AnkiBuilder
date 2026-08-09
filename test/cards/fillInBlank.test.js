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
  // The failure is REPORTED, not just logged — the caller must not set its done-marker.
  assert.equal(result.failed, true);
});

test("a source with no usable drills is a completed pass, not a failure", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    log: () => {},
    runClaude: () => JSON.stringify({ cards: [] }),
  });
  assert.deepEqual(result.items, items);
  assert.equal(result.failed, undefined);
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

test("the prompt injects the language's counter rules for ja, neutral text otherwise", () => {
  const ja = renderFillInBlankPrompt({ cards: items, targetLanguage: "ja" });
  assert.match(ja, /しがつ/); // irregular-counter examples
  assert.match(ja, /joined by a HYPHEN/); // shared hyphen convention

  const es = renderFillInBlankPrompt({ cards: items, targetLanguage: "Spanish" });
  assert.doesNotMatch(es, /しがつ/);
  assert.doesNotMatch(es, /HYPHEN/);
  assert.match(es, /standard romanization conventions/);
  assert.doesNotMatch(es, /\{\{[A-Z_]+\}\}/);
});

// A mined drill is half a Q/A pair, and the answer half is studied alone. Carrying the question as a
// front scene is the only thing that makes it answerable — and the pass used to drop it outright.
test("carries a scene through, so an answer card can name the question it replies to", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ ...drill, scene: "answering how you are getting to Osaka" }]),
  });
  assert.equal(result.items[2].scene, "answering how you are getting to Osaka");
});

// Cached/older prompt responses returned the question cue under `hint`; it still lands as the scene.
test("accepts a legacy hint-shaped response as the scene", () => {
  const result = mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ ...drill, hint: "answering how you are getting to Osaka" }]),
  });
  assert.equal(result.items[2].scene, "answering how you are getting to Osaka");
});

test("a card with no scene gets an explicit null, not a missing field", () => {
  const result = mineFillInBlankCards({ items, targetLanguage: "ja", runClaude: reply([drill]) });
  assert.equal(result.items[2].scene, null);
});

test("warns about answer-shaped cards that came back with no scene", () => {
  const logged = [];
  mineFillInBlankCards({
    items,
    targetLanguage: "ja",
    log: (line) => logged.push(line),
    runClaude: reply([
      { ...drill, id: "fib-bare", english: "It's at 5:00." },
      { ...drill, id: "fib-scened", english: "It's on Sunday.", scene: "answering what day it is" },
      { ...drill, id: "fib-standalone", english: "I'm going by Shinkansen." },
    ]),
  });
  const warning = logged.find((l) => l.includes("no scene naming the question"));
  assert.ok(warning, "expected a warning about the scene-less answer card");
  assert.match(warning, /fib-bare/);
  // The scened answer and the self-contained sentence are both fine.
  assert.doesNotMatch(warning, /fib-scened/);
  assert.doesNotMatch(warning, /fib-standalone/);
});

test("the prompt asks for the question as a scene on an answer card", () => {
  const prompt = renderFillInBlankPrompt({ cards: items, targetLanguage: "ja" });
  assert.match(prompt, /ANSWER card must carry its question as a `scene`/);
  assert.match(prompt, /must render the WHOLE `target`/);
});

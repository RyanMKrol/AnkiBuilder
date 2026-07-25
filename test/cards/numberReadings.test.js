import test from "node:test";
import assert from "node:assert/strict";
import { fillNumberReadings, renderNumberReadingPrompt } from "../../src/cards/numberReadings.js";

const numeric = () => [
  { id: "a", english: "In 2025", target: "2025ねんに", pronunciation: "2025-nen ni" },
  { id: "b", english: "Hello", target: "こんにちは", pronunciation: "konnichiwa" },
];
const reply = (fixes) => () => JSON.stringify({ fixes });

test("fills reading AND pronunciation together, and flags the card for the reviewer", () => {
  const items = numeric();
  const result = fillNumberReadings({
    items,
    targetLanguage: "ja",
    runClaude: reply([
      { id: "a", reading: "にせんにじゅうごねんに", pronunciation: "nisen nijūgonen ni" },
    ]),
  });

  const fixed = result.items.find((i) => i.id === "a");
  assert.equal(fixed.reading, "にせんにじゅうごねんに");
  assert.equal(fixed.pronunciation, "nisen nijūgonen ni");
  // Both symptoms of one cause — fixing only the reading leaves wrong romaji on screen.
  assert.equal(fixed.target, "2025ねんに", "the card face keeps its digits");
  assert.equal(fixed.uncertain, true);
  assert.match(fixed.reviewNote, /check the counter/);
  assert.deepEqual(result.remaining, []);
});

test("an untouched card is left exactly as it was", () => {
  const items = numeric();
  fillNumberReadings({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ id: "a", reading: "にせんにじゅうごねんに", pronunciation: "nisen ni" }]),
  });
  assert.deepEqual(
    items.find((i) => i.id === "b"),
    {
      id: "b",
      english: "Hello",
      target: "こんにちは",
      pronunciation: "konnichiwa",
    },
  );
});

// A "fix" that still carries a digit fixes nothing, and applying it would report success while the
// review gate went on blocking the lesson with no explanation.
test("a fix that still contains a digit is discarded", () => {
  const items = numeric();
  const result = fillNumberReadings({
    items,
    targetLanguage: "ja",
    runClaude: reply([{ id: "a", reading: "2025ねんに", pronunciation: "2025-nen ni" }]),
  });
  assert.deepEqual(result.fixed, []);
  assert.equal(result.remaining.length, 1);
  assert.equal(items[0].uncertain, undefined);
});

test("a card the model omitted is left for the review gate", () => {
  const items = numeric();
  const result = fillNumberReadings({ items, targetLanguage: "ja", runClaude: reply([]) });
  assert.equal(result.fixed.length, 0);
  assert.equal(result.remaining.length, 1);
});

test("no numerals means no model call at all", () => {
  let called = false;
  const result = fillNumberReadings({
    items: [{ id: "b", english: "Hello", target: "こんにちは", pronunciation: "konnichiwa" }],
    targetLanguage: "ja",
    runClaude: () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.deepEqual(result.fixed, []);
});

test("fails open on a malformed response", () => {
  const logged = [];
  const items = numeric();
  const result = fillNumberReadings({
    items,
    targetLanguage: "ja",
    log: (l) => logged.push(l),
    runClaude: () => "not json",
  });
  assert.deepEqual(result.fixed, []);
  assert.equal(result.remaining.length, 1);
  assert.match(logged.join("\n"), /number readings: failed/);
});

test("the prompt carries the card's current state and the irregular-counter warning", () => {
  const prompt = renderNumberReadingPrompt({ cards: numeric(), targetLanguage: "ja" });
  assert.match(prompt, /"currentPronunciation": "2025-nen ni"/);
  assert.match(prompt, /しがつ/);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
});

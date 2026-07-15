import test from "node:test";
import assert from "node:assert";
import { dedupBackward } from "../../src/corpus/epubDedup.js";

function candidate(id, english, target) {
  return { id, english, category: "Other", notes: null, target };
}

test("dedupBackward() flags a case-insensitive english match, without dropping it", () => {
  const candidates = [candidate("hello", "Hello", "こんにちは")];
  const prior = [
    {
      ...candidate("hello-old", "hello", "こんにちは"),
      __chapterNumber: 1,
      __chapterLabel: "Lesson 1",
    },
  ];

  const { items, flagged } = dedupBackward(candidates, prior);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "hello");
  assert.equal(items[0].uncertain, true);
  assert.match(items[0].notes, /Possibly already taught/);
  assert.match(items[0].notes, /Lesson 1/);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].matchedField, "english");
  assert.equal(flagged[0].matchedPriorItem.__chapterNumber, 1);
});

test("dedupBackward() flags an exact target match, without dropping it", () => {
  const candidates = [candidate("cheese", "Cheese", "チーズ")];
  const prior = [
    {
      ...candidate("cheese-old", "some cheese", "チーズ"),
      __chapterNumber: 2,
      __chapterLabel: "Lesson 2",
    },
  ];

  const { items, flagged } = dedupBackward(candidates, prior);

  assert.equal(items.length, 1);
  assert.equal(items[0].uncertain, true);
  assert.match(items[0].notes, /Possibly already taught/);
  assert.equal(flagged[0].matchedField, "target");
  assert.equal(flagged[0].matchedPriorItem.__chapterNumber, 2);
});

test("dedupBackward() appends to existing notes rather than overwriting them", () => {
  const candidates = [{ ...candidate("hello", "Hello", "こんにちは"), notes: "informal too" }];
  const prior = [
    {
      ...candidate("hello-old", "hello", "こんにちは"),
      __chapterNumber: 1,
      __chapterLabel: "Lesson 1",
    },
  ];

  const { items } = dedupBackward(candidates, prior);

  assert.equal(
    items[0].notes,
    "informal too | Possibly already taught — already introduced in Lesson 1 (matched on english)",
  );
});

test("dedupBackward() leaves an item with no overlap with any prior item unannotated", () => {
  const candidates = [candidate("new", "Brand new phrase", "新しいフレーズ")];
  const prior = [
    {
      ...candidate("old", "Something else", "何か他のもの"),
      __chapterNumber: 1,
      __chapterLabel: "Lesson 1",
    },
  ];

  const { items, flagged } = dedupBackward(candidates, prior);

  assert.equal(items.length, 1);
  assert.equal(items[0], candidates[0], "unmatched items pass through unchanged");
  assert.ok(!items[0].uncertain);
  assert.equal(flagged.length, 0);
});

test("dedupBackward() with an empty prior set flags nothing", () => {
  const candidates = [candidate("a", "A", "あ"), candidate("b", "B", "び")];

  const { items, flagged } = dedupBackward(candidates, []);

  assert.equal(items.length, 2);
  assert.deepEqual(items, candidates);
  assert.equal(flagged.length, 0);
});

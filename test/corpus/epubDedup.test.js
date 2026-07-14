import test from "node:test";
import assert from "node:assert";
import { dedupBackward } from "../../src/corpus/epubDedup.js";

function candidate(id, english, target) {
  return { id, english, category: "Other", notes: null, target };
}

test("dedupBackward() drops a case-insensitive english match", () => {
  const candidates = [candidate("hello", "Hello", "こんにちは")];
  const prior = [{ ...candidate("hello-old", "hello", "こんにちは"), __chapterNumber: 1 }];

  const { kept, dropped } = dedupBackward(candidates, prior);

  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].matchedField, "english");
  assert.equal(dropped[0].matchedPriorItem.__chapterNumber, 1);
});

test("dedupBackward() drops an exact target match", () => {
  const candidates = [candidate("cheese", "Cheese", "チーズ")];
  const prior = [{ ...candidate("cheese-old", "some cheese", "チーズ"), __chapterNumber: 2 }];

  const { kept, dropped } = dedupBackward(candidates, prior);

  assert.equal(kept.length, 0);
  assert.equal(dropped[0].matchedField, "target");
  assert.equal(dropped[0].matchedPriorItem.__chapterNumber, 2);
});

test("dedupBackward() keeps an item with no overlap with any prior item", () => {
  const candidates = [candidate("new", "Brand new phrase", "新しいフレーズ")];
  const prior = [{ ...candidate("old", "Something else", "何か他のもの"), __chapterNumber: 1 }];

  const { kept, dropped } = dedupBackward(candidates, prior);

  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
});

test("dedupBackward() with an empty prior set drops nothing", () => {
  const candidates = [candidate("a", "A", "あ"), candidate("b", "B", "び")];

  const { kept, dropped } = dedupBackward(candidates, []);

  assert.equal(kept.length, 2);
  assert.equal(dropped.length, 0);
});

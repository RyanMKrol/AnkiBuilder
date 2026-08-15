import test from "node:test";
import assert from "node:assert/strict";
import { mirrorExclusions } from "../../src/cards/corpusMirror.js";

test("an exclusion applied to a card lands in the corpus, with its provenance", () => {
  const cards = [
    { id: "a", excluded: true, excludedBy: "extras-duplicate-check", excludedReason: "dupe of x" },
    { id: "b" },
  ];
  const corpus = [{ id: "a" }, { id: "b" }];
  const { changed, ids } = mirrorExclusions(cards, corpus);
  assert.equal(changed, true);
  assert.deepEqual(ids, ["a"]);
  assert.deepEqual(corpus[0], {
    id: "a",
    excluded: true,
    excludedBy: "extras-duplicate-check",
    excludedReason: "dupe of x",
  });
  assert.deepEqual(corpus[1], { id: "b" }, "an unexcluded card is left alone");
});

test("an exclusion the corpus already carries is not rewritten", () => {
  const corpus = [{ id: "a", excluded: true, excludedBy: "human" }];
  const { changed } = mirrorExclusions(
    [{ id: "a", excluded: true, excludedBy: "a-script" }],
    corpus,
  );
  assert.equal(changed, false);
  assert.equal(
    corpus[0].excludedBy,
    "human",
    "a human's decision is never overwritten by a tool's",
  );
});

test("a corpus-only exclusion is never CLEARED — that is the review's normal output", () => {
  const corpus = [{ id: "a", excluded: true }];
  const { changed } = mirrorExclusions([], corpus);
  assert.equal(changed, false);
  assert.equal(corpus[0].excluded, true);
});

test("a card with no corpus row is skipped rather than invented", () => {
  const corpus = [];
  assert.deepEqual(mirrorExclusions([{ id: "fib-1", excluded: true }], corpus), {
    changed: false,
    ids: [],
  });
  assert.deepEqual(corpus, []);
});

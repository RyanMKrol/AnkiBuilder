import test from "node:test";
import assert from "node:assert/strict";
import { shippableCards, isPendingAddition, additionStage } from "../../src/deck/shippableCards.js";

// The per-card gate for retrofitted cards. These tests are about ONE property: a card that has not
// been through the additions review cannot reach either delivery path, and the reason it cannot is
// that both paths funnel through this function.

test("an addition ships only after BOTH gates, mirroring a lesson's two", () => {
  const cards = {
    items: [
      { id: "plain" },
      { id: "excluded", excluded: true },
      { id: "at-content", addition: "batch-1" },
      { id: "at-audio", addition: "batch-1", additionReviewed: true },
      { id: "through", addition: "batch-1", additionReviewed: true, additionDone: true },
    ],
  };
  assert.deepEqual(
    shippableCards(cards).map((c) => c.id),
    ["plain", "through"],
  );
});

test("additionStage names the gate a card is waiting at", () => {
  assert.equal(additionStage({}), null, "not an addition");
  assert.equal(additionStage({ addition: "b" }), "corpus");
  assert.equal(additionStage({ addition: "b", additionReviewed: true }), "audio");
  assert.equal(
    additionStage({ addition: "b", additionReviewed: true, additionDone: true }),
    null,
    "through both gates",
  );
});

test("a card with no `addition` is not an addition, so old decks are untouched", () => {
  // The whole reason this is safe to add to a deck that already exists: absence means "not an
  // addition", never "pending".
  assert.equal(isPendingAddition({}), false);
  assert.equal(isPendingAddition({ id: "x", english: "X" }), false);
  assert.equal(isPendingAddition(undefined), false);
  assert.equal(isPendingAddition(null), false);
});

test("only the literal `true` clears either gate", () => {
  // Anything truthy-but-not-true would let a half-written value ship a card nobody signed off.
  const through = { addition: "b", additionReviewed: true, additionDone: true };
  assert.equal(isPendingAddition({ addition: "b" }), true);
  assert.equal(isPendingAddition({ ...through, additionReviewed: "yes" }), true);
  assert.equal(isPendingAddition({ ...through, additionReviewed: 1 }), true);
  assert.equal(isPendingAddition({ ...through, additionDone: "yes" }), true);
  assert.equal(isPendingAddition({ ...through, additionDone: false }), true);
  assert.equal(isPendingAddition(through), false);
});

test("an addition id must be a string to count as one", () => {
  // The schema enforces this too, but the predicate must not be the place a malformed value turns
  // into "ships anyway" or "pending forever".
  assert.equal(isPendingAddition({ addition: "" }), true);
  assert.equal(isPendingAddition({ addition: 7 }), false);
  assert.equal(isPendingAddition({ addition: true }), false);
});

test("exclusion and pending-ness are independent reasons not to ship", () => {
  const cards = {
    items: [{ id: "both", excluded: true, addition: "b" }, { id: "neither" }],
  };
  assert.deepEqual(
    shippableCards(cards).map((c) => c.id),
    ["neither"],
  );
});

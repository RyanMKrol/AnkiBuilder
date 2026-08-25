import test from "node:test";
import assert from "node:assert/strict";
import { shippableCards, isPendingAddition } from "../../src/deck/shippableCards.js";

// The per-card gate for retrofitted cards. These tests are about ONE property: a card that has not
// been through the additions review cannot reach either delivery path, and the reason it cannot is
// that both paths funnel through this function.

test("a pending addition does not ship, and an approved one does", () => {
  const cards = {
    items: [
      { id: "plain" },
      { id: "excluded", excluded: true },
      { id: "pending", addition: "batch-1" },
      { id: "approved", addition: "batch-1", additionReviewed: true },
    ],
  };
  assert.deepEqual(
    shippableCards(cards).map((c) => c.id),
    ["plain", "approved"],
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

test("only `additionReviewed === true` clears the gate", () => {
  // Anything truthy-but-not-true would let a half-written value ship a card nobody approved.
  assert.equal(isPendingAddition({ addition: "b" }), true);
  assert.equal(isPendingAddition({ addition: "b", additionReviewed: false }), true);
  assert.equal(isPendingAddition({ addition: "b", additionReviewed: "yes" }), true);
  assert.equal(isPendingAddition({ addition: "b", additionReviewed: 1 }), true);
  assert.equal(isPendingAddition({ addition: "b", additionReviewed: true }), false);
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

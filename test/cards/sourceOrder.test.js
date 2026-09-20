import test from "node:test";
import assert from "node:assert/strict";
import { assignSourceOrder, inSourceOrder } from "../../src/cards/sourceOrder.js";

const ja = { languageCode: "ja" };

test("a card's position is where its target first appears in the chapter", () => {
  const html = "<p>いけばな</p><p>からて</p><p>ピアノ</p>";
  const at = assignSourceOrder(
    [
      { id: "piano", target: "ピアノ" },
      { id: "ikebana", target: "いけばな" },
    ],
    html,
    ja,
  );
  assert.ok(at.get("ikebana") < at.get("piano"), "the book's order, not the array's");
});

test("a short target does not take a position inside a longer card's word", () => {
  // The trap this module exists for. On Lesson 17 て (hand) matched inside からて (karate) and sorted
  // a hundred characters early, into the middle of the hobbies list, because a naive indexOf finds
  // the first occurrence anywhere. Longest-first with each match claimed puts て on the standalone
  // entry the book actually prints for it.
  const html = "<p>からて</p><p>ピアノ</p><p>て</p>";
  const at = assignSourceOrder(
    [
      { id: "te", target: "て" },
      { id: "karate", target: "からて" },
    ],
    html,
    ja,
  );
  assert.ok(at.get("te") > at.get("karate"), "て must land on its own entry, not inside からて");
});

test("editorial spacing in the book does not stop a match", () => {
  // The book prints はなみを します; the card stores はなみをします. Both sides are flattened.
  const at = assignSourceOrder(
    [{ id: "hanami", target: "はなみをします" }],
    "<p>はなみを します</p>",
    ja,
  );
  assert.equal(typeof at.get("hanami"), "number");
});

test("a target the chapter never prints gets null rather than a wrong position", () => {
  const at = assignSourceOrder([{ id: "absent", target: "ぜんぜんない" }], "<p>ねこ</p>", ja);
  assert.equal(at.get("absent"), null);
});

test("inSourceOrder keeps unplaced cards in their existing order, at the end", () => {
  // An extras unit carries no sourceOrder at all, and a unit built before the field existed carries
  // it on nothing. Either must render exactly as it does today rather than in some arbitrary order.
  const items = [
    { id: "c", sourceOrder: 30 },
    { id: "no1" },
    { id: "a", sourceOrder: 10 },
    { id: "no2" },
  ];
  assert.deepEqual(
    inSourceOrder(items).map((i) => i.id),
    ["a", "c", "no1", "no2"],
  );
});

test("inSourceOrder does not mutate its input", () => {
  const items = [
    { id: "b", sourceOrder: 2 },
    { id: "a", sourceOrder: 1 },
  ];
  const before = items.map((i) => i.id);
  inSourceOrder(items);
  assert.deepEqual(
    items.map((i) => i.id),
    before,
    "the stored order is the deck's and must survive a read",
  );
});

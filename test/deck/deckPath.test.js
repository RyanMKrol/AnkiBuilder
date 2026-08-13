import test from "node:test";
import assert from "node:assert/strict";
import { unitDeckSegments, groupingSegments } from "../../src/deck/deckPath.js";

test("unitDeckSegments splits a textbook label on its Lesson/Chapter/Unit prefix", () => {
  assert.deepEqual(unitDeckSegments("Lesson 1: Meeting: Nice to Meet You"), [
    "Lesson 01",
    "Meeting: Nice to Meet You",
  ]);
  // The title keeps every colon after the first — only the prefix is a grouping level.
  assert.deepEqual(unitDeckSegments("Lesson 5: Shopping (2): Two Bottles (Extras)"), [
    "Lesson 05",
    "Shopping (2): Two Bottles (Extras)",
  ]);
  assert.deepEqual(unitDeckSegments("Chapter 12: Whatever"), ["Chapter 12", "Whatever"]);
});

test("the deck's lesson number is zero-padded so Anki's text sort keeps lesson order", () => {
  // Anki files "Lesson 10" between "Lesson 1" and "Lesson 2" without this.
  assert.equal(unitDeckSegments("Lesson 9: Nine")[0], "Lesson 09");
  assert.equal(unitDeckSegments("Lesson 10: Ten")[0], "Lesson 10");
  const order = ["Lesson 9: A", "Lesson 10: B", "Lesson 2: C"]
    .map((l) => unitDeckSegments(l)[0])
    .sort();
  assert.deepEqual(order, ["Lesson 02", "Lesson 09", "Lesson 10"]);
  // Padding an already-padded label must not add a second zero.
  assert.equal(unitDeckSegments("Lesson 09: Nine")[0], "Lesson 09");
  // A number already wider than the pad is left alone.
  assert.equal(unitDeckSegments("Lesson 100: Hundred")[0], "Lesson 100");
});

test("unitDeckSegments leaves an ungrouped label alone", () => {
  // A course's bare "Lesson 1" has no title to group with, so it must not become a lone child —
  // but it is still a deck in a sorted list, so its number is padded like any other.
  assert.deepEqual(unitDeckSegments("Lesson 1"), ["Lesson 01"]);
  assert.deepEqual(unitDeckSegments("Lesson 12"), ["Lesson 12"]);
  assert.deepEqual(unitDeckSegments("Frequently Used Expressions"), [
    "Frequently Used Expressions",
  ]);
  assert.deepEqual(unitDeckSegments(""), [""]);
});

test("a lesson and its extras resolve to the same grouping deck", () => {
  const a = unitDeckSegments("Lesson 3: Asking the Time: What Time Is It?");
  const b = unitDeckSegments("Lesson 3: Asking the Time: What Time Is It? (Extras)");
  assert.equal(a[0], b[0]);
  assert.notEqual(a[1], b[1]);
});

test("groupingSegments lists each grouping deck once, in first-seen order", () => {
  assert.deepEqual(
    groupingSegments([
      "Frequently Used Expressions",
      "Lesson 2: B",
      "Lesson 1: A",
      "Lesson 1: A (Extras)",
    ]),
    ["Lesson 02", "Lesson 01"],
  );
  // A bare numbered label is padded but still ungrouped, so it contributes no grouping deck.
  assert.deepEqual(groupingSegments(["Lesson 1", "Plain"]), []);
});

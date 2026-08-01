import test from "node:test";
import assert from "node:assert/strict";
import { unitDeckSegments, groupingSegments } from "../../src/deck/deckPath.js";

test("unitDeckSegments splits a textbook label on its Lesson/Chapter/Unit prefix", () => {
  assert.deepEqual(unitDeckSegments("Lesson 1: Meeting: Nice to Meet You"), [
    "Lesson 1",
    "Meeting: Nice to Meet You",
  ]);
  // The title keeps every colon after the first — only the prefix is a grouping level.
  assert.deepEqual(unitDeckSegments("Lesson 5: Shopping (2): Two Bottles (Extras)"), [
    "Lesson 5",
    "Shopping (2): Two Bottles (Extras)",
  ]);
  assert.deepEqual(unitDeckSegments("Chapter 12: Whatever"), ["Chapter 12", "Whatever"]);
});

test("unitDeckSegments leaves an ungrouped label alone", () => {
  // A course's bare "Lesson 1" has no title to group with, so it must not become a lone child.
  assert.deepEqual(unitDeckSegments("Lesson 1"), ["Lesson 1"]);
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
    ["Lesson 2", "Lesson 1"],
  );
  assert.deepEqual(groupingSegments(["Lesson 1", "Plain"]), []);
});

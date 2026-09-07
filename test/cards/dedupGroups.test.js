import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateCandidates, describeGroupsForPrompt } from "../../src/cards/dedupGroups.js";

const item = (id, target, english, extra = {}) => ({ id, target, english, ...extra });

test("items sharing a target are grouped, whatever the gloss punctuation", () => {
  // The 19-in-83 case: reconcile keys on target AND gloss, so a comma against a semicolon survives
  // as two cards. This is the grouping that hands them to a judge.
  const groups = findDuplicateCandidates(
    [
      item("a", "とけい", "Watch, clock."),
      item("b", "とけい", "Watch; clock."),
      item("c", "ほん", "Book"),
    ],
    "ja",
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "same-target");
  assert.deepEqual(
    groups[0].items.map((i) => i.id),
    ["a", "b"],
  );
});

test("items sharing a gloss but not a target are grouped too", () => {
  const groups = findDuplicateCandidates(
    [item("a", "いちど", "One time."), item("b", "一度", "One time.")],
    "ja",
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "same-gloss");
});

test("a group sharing BOTH is reported once, not twice", () => {
  // Asking the judge the same question twice doubles the prompt for nothing.
  const groups = findDuplicateCandidates(
    [item("a", "とけい", "Watch"), item("b", "とけい", "Watch")],
    "ja",
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "same-target");
});

test("an excluded card is not a duplicate of anything", () => {
  // A human already decided. Re-litigating it spends a judgement on a settled question.
  const groups = findDuplicateCandidates(
    [
      item("a", "とけい", "Watch, clock."),
      item("b", "とけい", "Watch; clock.", { excluded: true }),
    ],
    "ja",
  );
  assert.deepEqual(groups, []);
});

test("the prompt shape carries note and scene, where a real sense split is usually written down", () => {
  const groups = findDuplicateCandidates(
    [
      item("hashi-bridge", "はし", "Bridge", { note: "the one you cross" }),
      item("hashi-chop", "はし", "Chopsticks"),
    ],
    "ja",
  );
  const described = describeGroupsForPrompt(groups);
  assert.equal(described[0].items[0].note, "the one you cross");
  assert.equal("note" in described[0].items[1], false, "absent rather than null");
  assert.equal(described[0].sharing, "same-target");
});

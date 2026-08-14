import test from "node:test";
import assert from "node:assert/strict";
import { planDuplicateExclusions } from "../../src/cards/duplicatePlan.js";
import { glossAlternatives, glossesAgree } from "../../src/cards/glossMatch.js";

const group = (target, keeper, duplicates) => ({
  target,
  keeper: { unit: "chapter-1", id: "keeper", english: keeper },
  duplicates: duplicates.map((d, i) => ({
    unit: `chapter-${i + 2}`,
    id: `dup${i}`,
    english: "",
    reviewed: false,
    done: false,
    isQuestion: false,
    ...d,
  })),
});

test("a duplicate glossed the same as the keeper is safe to exclude", () => {
  const { exclude, refuse } = planDuplicateExclusions([group("ペン", "Pen", [{ english: "Pen" }])]);
  assert.equal(exclude.length, 1);
  assert.equal(refuse.length, 0);
});

test("the live false positive: a particle sense is never excluded in favour of a number", () => {
  // Reproduced from the book: に groups all five particle senses with the NUMBER 2, and the number
  // is the earliest occurrence, so an unguarded --apply keeps it and drops every particle.
  const { exclude, refuse } = planDuplicateExclusions(
    [
      group("に", "2", [
        { english: "To (particle, indicates direction of movement)" },
        { english: "At, in, on (particle)" },
        { english: "From (particle)" },
      ]),
    ],
    { force: true },
  );
  assert.equal(exclude.length, 0);
  assert.equal(refuse.length, 3);
  for (const r of refuse) assert.match(r.reason, /two senses, not a duplicate/);
});

test("a question is refused even when its gloss agrees", () => {
  const { exclude, refuse } = planDuplicateExclusions([
    group("なんですか", "What is it?", [{ english: "What is it?", isQuestion: true }]),
  ]);
  assert.equal(exclude.length, 0);
  assert.match(refuse[0].reason, /strand an elliptical answer/);
});

test("a reviewed or done unit is refused without --force, and allowed with it", () => {
  const groups = [group("ペン", "Pen", [{ english: "Pen", reviewed: true }])];
  assert.equal(planDuplicateExclusions(groups).exclude.length, 0);
  assert.match(planDuplicateExclusions(groups).refuse[0].reason, /--force/);
  assert.equal(planDuplicateExclusions(groups, { force: true }).exclude.length, 1);
});

test("--force does NOT override the gloss guard — it only unlocks reviewed units", () => {
  const groups = [group("に", "2", [{ english: "To (particle)", reviewed: true }])];
  const { exclude, refuse } = planDuplicateExclusions(groups, { force: true });
  assert.equal(exclude.length, 0);
  assert.match(refuse[0].reason, /two senses/);
});

test("gloss normalization keeps ordinary wording differences from reading as a disagreement", () => {
  for (const [a, b] of [
    ["Big", "Big, large"],
    ["4th floor", "Fourth floor"],
    ["This one", "This one (polite for 'this person')"],
    ["Vegetables", "Vegetable"],
    ["Once more, please.", "Once more please"],
    ["The bag", "Bag"],
  ]) {
    assert.ok(glossesAgree(a, b), `${a} should agree with ${b}`);
  }
  // Deliberately shallow: a genuinely different English word still reads as a difference.
  assert.ok(!glossesAgree("Car park", "Parking lot"));
  assert.ok(!glossesAgree("2", "To (particle)"));
  // "this" must survive the plural strip, or every demonstrative stops matching itself.
  assert.ok(glossAlternatives("This one").has("this one"));
});

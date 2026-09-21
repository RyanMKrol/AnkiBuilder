import test from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateCandidates,
  describeGroupsForPrompt,
  interjectionFreeKey,
  GROUP_KIND,
} from "../../src/cards/dedupGroups.js";

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

const interjectionGroups = (items) =>
  findDuplicateCandidates(items, "ja").filter((g) => g.kind === GROUP_KIND.INTERJECTION);

test("a line mined with and without a leading interjection becomes a candidate group", () => {
  // Neither grouping above can see this pair: the targets differ and so do the glosses. It is the
  // shape three pairs had on Lesson 19, all reaching the review because the judge was never asked.
  const groups = interjectionGroups([
    item("a", "もうふをおねがいできますか", "May I ask for a blanket?"),
    item("b", "すみません。もうふをおねがいできますか", "Excuse me. May I ask for a blanket?"),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((i) => i.id).sort(), ["a", "b"]);
});

test("じゃ and はい are found too, with either punctuation", () => {
  assert.equal(
    interjectionGroups([
      item("a", "げつようびのかいぎでほうこくしてください", "Please report at the meeting."),
      item(
        "b",
        "じゃ、げつようびのかいぎでほうこくしてください",
        "Then, please report at the meeting.",
      ),
    ]).length,
    1,
  );
  assert.equal(
    interjectionGroups([
      item("a", "とてもおいしいです", "It's very delicious."),
      item("b", "はい、とてもおいしいです", "Yes, it's very delicious."),
    ]).length,
    1,
  );
});

test("it FINDS and never decides: the group is a question for the judge, not an exclusion", () => {
  const items = [
    item("a", "もういちどいってください", "Please say it one more time."),
    item("b", "すみません、もういちどいってください", "Excuse me, please say it again."),
  ];
  findDuplicateCandidates(items, "ja");
  // Deciding in code is how a sense gets deleted; this module's contract is that it only groups.
  assert.ok(items.every((i) => !i.excluded));
});

test("ちょっと is not an interjection here: ちょっとまってください is a different request", () => {
  assert.equal(
    interjectionGroups([
      item("a", "まってください", "Please wait."),
      item("b", "ちょっとまってください", "Please wait a moment."),
    ]).length,
    0,
  );
});

test("a bare interjection is a card of its own, not a prefix on another", () => {
  assert.equal(interjectionFreeKey(item("a", "すみません", "Excuse me."), "ja"), "");
  assert.equal(interjectionFreeKey(item("a", "はい", "Yes."), "ja"), "");
});

test("two cards that already share a full target are left to the same-target group", () => {
  const groups = findDuplicateCandidates(
    [item("a", "おちゃ", "Tea"), item("b", "おちゃ", "Green tea")],
    "ja",
  );
  assert.equal(groups.filter((g) => g.kind === GROUP_KIND.INTERJECTION).length, 0);
  assert.equal(groups.filter((g) => g.kind === GROUP_KIND.TARGET).length, 1);
});

test("an excluded card is not grouped, as with the other two groupings", () => {
  assert.equal(
    interjectionGroups([
      item("a", "もうふをおねがいできますか", "May I ask for a blanket?"),
      item("b", "すみません。もうふをおねがいできますか", "Excuse me…", { excluded: true }),
    ]).length,
    0,
  );
});

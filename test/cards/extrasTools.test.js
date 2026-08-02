import test from "node:test";
import assert from "node:assert/strict";
import {
  findCrossChapterDuplicates,
  findCollisions,
  orderExtrasUnit,
} from "../../src/cards/extrasTools.js";

const card = (id, english, target, over = {}) => ({ id, english, target, ...over });
const unit = (name, items, over = {}) => ({
  unit: name,
  label: name,
  reviewed: false,
  done: false,
  items,
  ...over,
});

test("cross-chapter duplicates: earliest occurrence is the keeper, later ones flagged", () => {
  const groups = findCrossChapterDuplicates([
    unit("chapter-2", [card("hello", "Hello", "こんにちは")]),
    unit("chapter-3-extras", [card("f-hello", "Hello there", "こんにちは")], { reviewed: true }),
    unit("chapter-4", [card("bye", "Goodbye", "さようなら")]),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].keeper.unit, "chapter-2");
  assert.deepEqual(
    groups[0].duplicates.map((d) => [d.unit, d.id, d.reviewed]),
    [["chapter-3-extras", "f-hello", true]],
  );
});

test("cross-chapter duplicates: excluded cards and same-unit repeats don't count", () => {
  const groups = findCrossChapterDuplicates([
    unit("chapter-2", [
      card("a", "One", "いち"),
      card("a2", "One again", "いち"), // same unit — the semantic dedup's business, not this gate's
    ]),
    unit("chapter-3", [card("a3", "One", "いち", { excluded: true })]),
  ]);
  assert.equal(groups.length, 0);
});

test("cross-chapter duplicates: a question is marked so --apply can refuse it", () => {
  const groups = findCrossChapterDuplicates([
    unit("chapter-2", [card("q", "Is this a pen?", "これはぺんですか")]),
    unit("chapter-5-extras", [card("q2", "Is this a pen?", "これはぺんですか")]),
  ]);
  assert.equal(groups[0].duplicates[0].isQuestion, true);
});

test("collision audit: groups with more than one distinct answer, flagging missing hints", () => {
  const { byEnglish, byTarget } = findCollisions([
    unit("chapter-2", [
      card("polite", "How many people?", "なんめいさまですか", { hint: "what staff ask" }),
      card("plain", "How many people?", "なんにん"),
      card("sore", "That one", "それ"),
    ]),
  ]);

  assert.equal(byEnglish.length, 1);
  assert.equal(byEnglish[0].key, "how many people");
  assert.deepEqual(
    byEnglish[0].members.map((m) => [m.id, m.hasHint]),
    [
      ["polite", true],
      ["plain", false],
    ],
  );
  assert.equal(byTarget.length, 0);
});

test("collision audit: trailing punctuation and case never split a group", () => {
  const { byEnglish } = findCollisions([
    unit("chapter-2", [card("a", "How much?", "いくら"), card("b", "how much", "おいくら")]),
  ]);
  assert.equal(byEnglish.length, 1);
});

test("ordering: seeded shuffle is stable, and foundations hoist shortest first", () => {
  const items = [
    card("s1", "Please tell me the phone number.", "でんわばんごうをおしえてください"),
    card("s2", "Please tell me the address.", "じゅうしょをおしえてください"),
    card("atom", "Please tell me.", "おしえてください"),
    card("other", "Good morning.", "おはようございます"),
    card("other2", "Good evening.", "こんばんは"),
  ];

  const first = orderExtrasUnit(items, { seed: "unit-5" });
  const second = orderExtrasUnit(items, { seed: "unit-5" });
  assert.deepEqual(
    first.items.map((i) => i.id),
    second.items.map((i) => i.id),
    "same seed → same order",
  );

  // おしえてください sits inside two other cards → foundational, hoisted to the front.
  assert.deepEqual(
    first.foundations.map((f) => f.id),
    ["atom"],
  );
  assert.equal(first.items[0].id, "atom");

  const other = orderExtrasUnit(items, { seed: "different" });
  assert.notDeepEqual(
    other.items.map((i) => i.id),
    first.items.map((i) => i.id),
    "a different seed produces a different order (with overwhelming probability)",
  );
});

test("ordering: elliptical answers and bare-particle fragments are never foundations", () => {
  const items = [
    card("ans", "It opens at 9:00.", "くじからです", { hint: "answering when it opens" }),
    card("s1", "The store is open from 9:00.", "みせはくじからですよ"),
    card("s2", "From 9:00, right?", "くじからですね"),
    card("frag", "Sasaki-san (topic)", "ささきさんは"),
    card("s3", "Sasaki-san is here.", "ささきさんはここです"),
    card("s4", "Sasaki-san is over there.", "ささきさんはあそこです"),
  ];

  const { foundations } = orderExtrasUnit(items, { seed: "x" });
  assert.deepEqual(foundations, []);
});

test("ordering: requires a seed", () => {
  assert.throws(() => orderExtrasUnit([], {}), /seed/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { findTaughtNeverUsed } from "../../src/cards/taughtNeverUsed.js";

const card = (id, target, english = id) => ({ id, target, english });

// The rule uses the lesson's MEDIAN target length to tell a word from a sentence, so it needs a
// lesson-shaped input to mean anything — a three-card fixture puts the median on top of one of the
// sentences and the answer is an artefact of the fixture, not of the rule. These mirror a real
// unit's mix: a handful of vocabulary cards against a handful of sentences.
const lesson = (...extra) => [
  card("golf", "ゴルフ"),
  card("dansu", "ダンス"),
  card("uta", "うた"),
  card("s1", "かとうさんはゴルフがじょうずです"),
  card("s2", "すずきさんはダンスがじょうずです"),
  card("s3", "かとうさんはうたがじょうずです"),
  ...extra,
];

test("a word used inside a sentence is not stranded", () => {
  const stranded = findTaughtNeverUsed(lesson());
  assert.deepEqual(
    stranded.map((c) => c.id),
    [],
    "every vocabulary card here appears inside one of the sentences",
  );
});

test("a word carded only on its own IS stranded", () => {
  // The real miss: lesson 15 shipped twelve dictionary forms exactly like this, on a chapter whose
  // whole grammar point is the ます↔dictionary correspondence.
  const stranded = findTaughtNeverUsed(lesson(card("kau", "かう"), card("matsu", "まつ")));
  assert.deepEqual(
    stranded.map((c) => c.id),
    ["kau", "matsu"],
  );
});

test("a sentence whose words are not individually carded is still never reported", () => {
  // The leak that containment alone has: such a sentence contains no other target, so it looks like
  // an atom. Being longer than the lesson's median is what keeps it out — on the live book that
  // distinction accounted for 68 of 186 findings, every one a set phrase or a full sentence.
  const stranded = findTaughtNeverUsed(
    lesson(card("orphan", "ながいぶんしょうをよむのがすきです")),
  );
  assert.deepEqual(
    stranded.map((c) => c.id),
    [],
    "a long unique target is a sentence, not a word taught in isolation",
  );
});

test("the base unit's word counts as used when only the EXTRAS unit uses it", () => {
  // Why the check groups a lesson with its extras sibling: the extras unit is precisely where the
  // base unit's bare vocabulary is meant to get put to work. Judging either alone is wrong for both
  // — the base looks full of stranded words, the extras looks like it teaches nothing new.
  const baseOnly = findTaughtNeverUsed([
    card("golf", "ゴルフ"),
    card("dansu", "ダンス"),
    card("uta", "うた"),
    card("sukii", "スキー"),
  ]);
  assert.ok(baseOnly.length > 0, "the base unit alone looks stranded, which is the wrong answer");

  const withExtras = findTaughtNeverUsed(lesson(card("sukii", "スキー")));
  assert.deepEqual(
    withExtras.map((c) => c.id),
    ["sukii"],
    "only the word no sentence uses survives once the pair is judged together",
  );
});

test("duplicate targets do not make a card look used by itself", () => {
  const stranded = findTaughtNeverUsed(lesson(card("uta2", "うた")));
  assert.deepEqual(
    stranded.map((c) => c.id),
    [],
    "うた is genuinely used by s3 — a second copy of it must not change that",
  );
});

test("a card with no target is ignored rather than crashing", () => {
  const stranded = findTaughtNeverUsed([{ id: "x", target: null }, ...lesson(card("kau", "かう"))]);
  assert.deepEqual(
    stranded.map((c) => c.id),
    ["kau"],
  );
});

test("an empty unit is not an error", () => {
  assert.deepEqual(findTaughtNeverUsed([]), []);
});

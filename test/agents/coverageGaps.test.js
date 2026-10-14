import test from "node:test";
import assert from "node:assert/strict";
import {
  computeGaps,
  underExampledForms,
  FUNCTION_CATEGORY,
} from "../../src/agents/coverageGaps.js";

test("a miner's short answer is a use of a word, never a gap of its own", () => {
  // Lesson 24: a yes/no reply the exercise miner mined is shorter than the lesson's median and
  // contained in no other card, so it read as a word never used. The gap author was handed ten of
  // those and copied each one out again. Only the base unit's cards can be gaps.
  const base = [
    { id: "yume", target: "ゆめ", english: "Dream.", category: "Other" },
    { id: "shumi", target: "しゅみ", english: "Hobby.", category: "Other" },
  ];
  const mined = [
    { id: "ans", target: "はい、わかります", english: "Yes, I understand.", category: "Other" },
    {
      id: "s1",
      target: "スミスさんのしゅみはほんをよむことです",
      english: "Smith-san's hobby is reading.",
      category: "Other",
    },
    {
      id: "s2",
      target: "わたしのしゅみはりょこうをすることです",
      english: "My hobby is traveling.",
      category: "Other",
    },
  ];
  const all = [...base, ...mined];
  assert.ok(
    computeGaps(all, { languageCode: "ja" }).neverUsed.some((g) => g.id === "ans"),
    "without gapIds the reply is reported, which is the bug being guarded",
  );
  const gaps = computeGaps(all, { languageCode: "ja", gapIds: new Set(base.map((c) => c.id)) });
  assert.deepEqual(
    gaps.neverUsed.map((g) => g.id),
    ["yume"],
  );
});

test("a SENTENCE categorised as a function word is not a gap awaiting examples", () => {
  // The chapter-9 failure, in one test. The example-sentence miner categorises a Key Sentence as
  // Grammar & Function Words because that is what it teaches, and this computation read the category
  // as "a form needing three sentences to demonstrate it". Nothing contains a whole sentence, so it
  // reported 0 examples forever, and the gap author was asked to demonstrate a sentence with
  // sentences. Six of chapter 9's thirty-eight gaps were that, and the phase died on them.
  const cards = [
    { id: "a", target: "あまり", english: "Not much.", category: FUNCTION_CATEGORY },
    {
      id: "b",
      target: "エマさんはあまりテレビをみません",
      english: "Emma-san doesn't watch television very much.",
      category: FUNCTION_CATEGORY,
    },
  ];
  const found = underExampledForms(cards, { languageCode: "ja" });
  assert.deepEqual(
    found.map((f) => f.target),
    ["あまり"],
    "the word is a gap; the sentence demonstrating it is not",
  );
});

test("an unconfigured language keeps the old behaviour rather than dropping gaps unseen", () => {
  // isPredicateShaped returns null where it has no markers, and `!== true` keeps the item. Silently
  // discarding gaps for a language nobody has verified would be the worse failure.
  const cards = [
    {
      id: "a",
      target: "el libro es rojo",
      english: "The book is red.",
      category: FUNCTION_CATEGORY,
    },
  ];
  assert.equal(underExampledForms(cards, { languageCode: "es" }).length, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  findBackwardCandidates,
  describeCandidatesForPrompt,
} from "../../src/cards/backwardCandidates.js";

const now = (target, english) => ({ id: target, target, english });
const prior = (unit, target, english) => ({ id: target, target, english, __unit: unit });

const find = (a, b) => findBackwardCandidates(a, b, { languageCode: "ja" });

test("an exact repeat is raised, naming where it was taught", () => {
  const [c] = find([now("から", "Because")], [prior("chapter-3", "から", "From")]);
  assert.equal(c.item.target, "から");
  assert.equal(c.matches[0].reason, "same-target");
  assert.equal(c.matches[0].prior.__unit, "chapter-3");
});

test("a polite prefix is raised: the case exact matching cannot see", () => {
  // おかし after かし is the whole reason this is fuzzy. Whether it is one word is the judge's call;
  // raising it is this module's.
  const [c] = find([now("おかし", "Sweets")], [prior("chapter-2", "かし", "Sweets")]);
  assert.equal(c.matches[0].reason, "one-target-contains-the-other");
});

test("a grammatical ending inside a longer form is NOT raised", () => {
  // Measured on a real chapter: plain substring matching proposed せん inside いきませんか and です
  // inside どうですか, because endings are substrings of everything built from them.
  assert.deepEqual(
    find([now("いきませんか", "Shall we go?")], [prior("chapter-4", "せん", "Line")]),
    [],
  );
  assert.deepEqual(
    find([now("どうですか", "How about?")], [prior("chapter-1", "です", "To be")]),
    [],
  );
});

test("a phrase merely containing an earlier word is NOT raised", () => {
  // ちょっと inside ちょっとまってください is 0.36 of it: two different cards.
  assert.deepEqual(
    find(
      [now("ちょっと", "A bit")],
      [prior("chapter-0", "ちょっとまってください", "Wait a moment")],
    ),
    [],
  );
});

test("agreeing glosses are raised even when the targets differ", () => {
  const [c] = find([now("つぎ", "Next")], [prior("chapter-9", "こんど", "Next, next time")]);
  assert.equal(c.matches[0].reason, "glosses-agree");
});

test("excluded cards are prior art for nothing, and are judged as nothing", () => {
  assert.deepEqual(
    findBackwardCandidates(
      [{ ...now("から", "Because"), excluded: true }],
      [prior("chapter-3", "から", "From")],
      { languageCode: "ja" },
    ),
    [],
  );
  assert.deepEqual(
    findBackwardCandidates(
      [now("から", "Because")],
      [{ ...prior("chapter-3", "から", "From"), excluded: true }],
      { languageCode: "ja" },
    ),
    [],
  );
});

test("a first chapter with no prior art raises nothing", () => {
  assert.deepEqual(find([now("これ", "This")], []), []);
});

test("skipExactMatches drops the repeats the v1 string matcher already flags", () => {
  // Set on the BASE path only, where `assemble` runs dedupBackward after the phase. Raising them
  // here too spends an Opus judgement to produce a second note saying what the first already said.
  const items = [now("から", "Because")];
  const priors = [prior("chapter-3", "から", "From")];
  assert.equal(find(items, priors).length, 1);
  assert.deepEqual(
    findBackwardCandidates(items, priors, { languageCode: "ja", skipExactMatches: true }),
    [],
  );
});

test("the extras path keeps them, because nothing else ever checks an extras unit", () => {
  const c = findBackwardCandidates([now("から", "Because")], [prior("chapter-3", "から", "From")], {
    languageCode: "ja",
  });
  assert.equal(c[0].matches[0].reason, "same-target");
});

test("matches shown per candidate are capped, strongest evidence first", () => {
  // One real chapter-16 card matched dozens of earlier cards on gloss overlap alone.
  const priors = [
    prior("chapter-1", "かし", "Sweets"),
    ...Array.from({ length: 12 }, (_, i) => prior(`chapter-${i + 2}`, `x${i}`, "Sweets")),
  ];
  const [c] = find([now("おかし", "Sweets")], priors);
  const [described] = describeCandidatesForPrompt([c]);
  assert.equal(described.alreadyInTheDeck.length, 5);
  assert.equal(described.alreadyInTheDeck[0].noticed, "one-target-contains-the-other");
});

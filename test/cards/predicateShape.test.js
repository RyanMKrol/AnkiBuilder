import test from "node:test";
import assert from "node:assert/strict";
import {
  isPredicateShaped,
  predicateMarkers,
  utteranceShapedCards,
} from "../../src/cards/predicateShape.js";

test("a clause is an utterance; a word that merely ends in a predicate is not", () => {
  const utterances = ["これはとけいです", "たなかさんはにほんじんです", "このはなはきれいです"];
  for (const t of utterances) assert.equal(isPredicateShaped(t, "ja"), true, t);

  // Verbs are carded in their polite ます form in this deck, so these are LEXICAL ENTRIES that end
  // in a predicate marker. Requiring clause structure is what keeps them out.
  const entries = [
    "とけい",
    "はし",
    "あるきます",
    "みせます",
    "あります",
    "いただきます",
    "すみません",
  ];
  for (const t of entries) assert.equal(isPredicateShaped(t, "ja"), false, t);
});

test("a target that IS a marker is the entry for that marker", () => {
  // です is a card in this deck: the copula, taught as vocabulary. Reading it as a sentence would be
  // reading the dictionary as prose.
  assert.equal(isPredicateShaped("です", "ja"), false);
  assert.equal(isPredicateShaped("ます", "ja"), false);
});

test("the predicate does not supply its own structure", () => {
  // です contains で. Testing the whole string for a particle meant the copula proved itself a
  // clause, and なんですか came back as a sentence.
  assert.equal(isPredicateShaped("なんですか", "ja"), false);
  assert.equal(isPredicateShaped("とけいです", "ja"), false);
  // But a real topic in front of it still reads as one.
  assert.equal(isPredicateShaped("これはにほんじんです", "ja"), true);
});

test("the known limit: a particle is an ordinary kana, and fires inside a word", () => {
  // にほんじん contains に, so this comes back as a clause when it is one noun plus the copula.
  // Pinned rather than hidden: the check that uses this is ACK for exactly this reason, and the
  // upgrade path is morphological analysis (kuromoji), not a longer regex.
  assert.equal(isPredicateShaped("にほんじんです", "ja"), true);
});

test("an unconfigured language is UNKNOWN, never clean", () => {
  // The failure this returns null to prevent: vocabCoverage matched one publisher's CSS class, found
  // nothing on any other book, and reported zero uncovered headwords.
  assert.equal(predicateMarkers("Spanish"), null);
  assert.equal(isPredicateShaped("el libro es rojo", "es"), null);
  assert.equal(utteranceShapedCards([{ target: "x" }], "es"), null);
});

test("excluded cards are not judged; they ship nowhere", () => {
  const items = [
    { id: "a", target: "これはとけいです" },
    { id: "b", target: "これはとけいです", excluded: true },
    { id: "c", target: "とけい" },
  ];
  assert.deepEqual(
    utteranceShapedCards(items, "ja").map((i) => i.id),
    ["a"],
  );
});

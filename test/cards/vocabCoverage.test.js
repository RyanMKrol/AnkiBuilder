import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVocaEntries,
  vocabTargetVariants,
  findUncoveredVocab,
} from "../../src/cards/vocabCoverage.js";

// The book's real shape: a two-column table, with component/derived forms on indented sub-rows.
const CHAPTER = `
<div class="voc-box"><h3 class="voc"><span class="voc"><b>VOCABULARY</b></span></h3>
<div class="voc-boxS"><table class="voca">
  <tr><td>おかし</td><td>sweets</td></tr>
  <tr><td class="sub">お〜</td><td class="sub">honorific prefix</td></tr>
  <tr><td class="sub2">かし</td><td class="sub2">sweets (plain)</td></tr>
  <tr><td>(お)てら</td><td>temple</td></tr>
  <tr><td>ぎんこう</td><td>bank</td></tr>
</table></div></div>
<table class="tab1"><tr><td>not vocabulary</td><td>ignored</td></tr></table>
`;

test("parseVocaEntries pulls every headword out of a voca table, sub-rows included", () => {
  const entries = parseVocaEntries(CHAPTER);
  assert.deepEqual(
    entries.map((e) => e.target),
    ["おかし", "お〜", "かし", "(お)てら", "ぎんこう"],
  );
  assert.equal(entries[0].english, "sweets");
  assert.equal(entries[1].sub, true, "an indented component row is flagged as a sub-row");
  assert.equal(entries[0].sub, false);
});

test("parseVocaEntries ignores tables that are not vocabulary", () => {
  const entries = parseVocaEntries(CHAPTER);
  assert.ok(!entries.some((e) => e.target === "not vocabulary"));
});

// The two conventions that make a bare string match report a word the deck already teaches.
test("vocabTargetVariants resolves the optional-prefix parenthesis both ways", () => {
  assert.deepEqual(vocabTargetVariants("(お)てら").sort(), ["おてら", "てら"].sort());
});

test("vocabTargetVariants drops the attachment-point wave dash and editorial spaces", () => {
  assert.deepEqual(vocabTargetVariants("〜さん"), ["さん"]);
  assert.deepEqual(vocabTargetVariants("お〜"), ["お"]);
  assert.deepEqual(vocabTargetVariants("これは ワインです"), ["これはワインです"]);
});

test("findUncoveredVocab reports only the headwords no card target contains", () => {
  const entries = parseVocaEntries(CHAPTER);
  const cards = [
    { id: "a", target: "おかし" },
    { id: "b", target: "おてら" }, // covers the (お)てら row
    { id: "c", target: "これはおかしです" },
  ];

  const misses = findUncoveredVocab(entries, cards);
  assert.deepEqual(
    misses.map((m) => m.target),
    ["ぎんこう"],
    "お〜 and かし are inside おかし; (お)てら is covered by its unparenthesized form",
  );
});

// The whole point of the nearest-match: a reviewer can dismiss a false positive without opening
// the deck, and a real miss is visibly different because it has no neighbour at all.
test("findUncoveredVocab names the nearest card target when there is one", () => {
  const entries = [{ target: "ぎんこうへいきます", english: "I go to the bank", sub: false }];
  const misses = findUncoveredVocab(entries, [{ id: "a", target: "ぎんこうにいきます" }]);
  assert.equal(misses.length, 1);
  assert.equal(misses[0].nearest, "ぎんこうにいきます");
});

test("findUncoveredVocab leaves `nearest` null for a word that is nowhere in the deck", () => {
  const misses = findUncoveredVocab(
    [{ target: "ぎんこう", english: "bank", sub: false }],
    [{ id: "a", target: "わたしです" }],
  );
  assert.equal(misses[0].nearest, null);
});

test("an excluded card still counts as coverage — the word is in the unit either way", () => {
  const misses = findUncoveredVocab(
    [{ target: "ぎんこう", english: "bank", sub: false }],
    [{ id: "a", target: "ぎんこう", excluded: true }],
  );
  assert.deepEqual(misses, []);
});

test("sub-rows can be left out when only headline entries are wanted", () => {
  const entries = parseVocaEntries(CHAPTER);
  const misses = findUncoveredVocab(entries, [], { includeSubRows: false });
  assert.deepEqual(
    misses.map((m) => m.target),
    ["おかし", "(お)てら", "ぎんこう"],
  );
});

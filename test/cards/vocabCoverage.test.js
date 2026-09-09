import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVocabularyEntries,
  vocabTargetVariants,
  findUncoveredVocab,
  splitAlternates,
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

// The selector is the BOOK's now, so every call names it. The "no selector" case is asserted
// separately below, because null and [] must never be confused.
const JBP = { tableClass: "voca", subRowClass: "sub" };

test("parseVocabularyEntries pulls every headword out of a voca table, sub-rows included", () => {
  const entries = parseVocabularyEntries(CHAPTER, JBP);
  assert.deepEqual(
    entries.map((e) => e.target),
    ["おかし", "お〜", "かし", "(お)てら", "ぎんこう"],
  );
  assert.equal(entries[0].english, "sweets");
  assert.equal(entries[1].sub, true, "an indented component row is flagged as a sub-row");
  assert.equal(entries[0].sub, false);
});

test("parseVocabularyEntries ignores tables that are not vocabulary", () => {
  const entries = parseVocabularyEntries(CHAPTER, JBP);
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
  const entries = parseVocabularyEntries(CHAPTER, JBP);
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
  const entries = parseVocabularyEntries(CHAPTER, JBP);
  const misses = findUncoveredVocab(entries, [], { includeSubRows: false });
  assert.deepEqual(
    misses.map((m) => m.target),
    ["おかし", "(お)てら", "ぎんこう"],
  );
});

test("splitAlternates splits a headword cell that holds several words for one gloss", () => {
  // The book writes つま ／ かない for "(my) wife" — two different words, one gloss, and each needs
  // its own card. Counter sound-variants (〜ほん ／ ぼん ／ ぽん) split the same way, and should: a
  // beginner cannot derive ろっぽん from にほん, so each shape has to appear somewhere.
  assert.deepEqual(splitAlternates("つま ／ かない"), ["つま", "かない"]);
  assert.deepEqual(splitAlternates("〜ほん ／ ぼん ／ ぽん"), ["〜ほん", "ぼん", "ぽん"]);
  assert.deepEqual(splitAlternates("おっと/しゅじん"), ["おっと", "しゅじん"]);
});

test("splitAlternates leaves an ordinary headword alone, including a parenthesised one", () => {
  assert.deepEqual(splitAlternates("ちち"), ["ちち"]);
  assert.deepEqual(splitAlternates("(お)てら"), ["(お)てら"]);
});

test("a half-covered alternates cell is reported as the MISSING half, not as the whole cell", () => {
  // The bug this fixes, and why it hid: reporting the whole cell "つま ／ かない" as missing produced
  // a `nearest` of つま — the half that IS carded — so the row read exactly like the documented
  // optional-parts false positive and was dismissed. Three words sat unreported that way, one of
  // them used by four sentence cards with nothing teaching it.
  const html = `<table class="voca"><tr><td>つま ／ かない</td><td>(my) wife</td></tr></table>`;
  const entries = parseVocabularyEntries(html, JBP);
  assert.deepEqual(
    entries.map((e) => e.target),
    ["つま", "かない"],
  );
  assert.equal(entries[1].english, "(my) wife", "both halves keep the shared gloss");

  const misses = findUncoveredVocab(entries, [{ target: "つま" }]);
  assert.deepEqual(
    misses.map((m) => m.target),
    ["かない"],
  );
});

test("no selector returns null, which is not the same as finding nothing", () => {
  // The failure this rewrite removes: a book that marks tables any other way used to yield [] here,
  // and the check reported zero uncovered headwords, which reads exactly like a fully carded
  // chapter. `null` forces every caller to say "nobody looked" instead.
  assert.equal(parseVocabularyEntries(CHAPTER), null);
  assert.equal(parseVocabularyEntries(CHAPTER, { tableClass: null }), null);
  assert.deepEqual(parseVocabularyEntries(CHAPTER, { tableClass: "not-this-book" }), []);
});

test("a selector with regex metacharacters is escaped, not interpreted", () => {
  const html = '<table class="a.b"><tr><td>ねこ</td><td>Cat</td></tr></table>';
  assert.equal(parseVocabularyEntries(html, { tableClass: "a.b" }).length, 1);
  assert.equal(parseVocabularyEntries(html, { tableClass: "axb" }).length, 0);
});

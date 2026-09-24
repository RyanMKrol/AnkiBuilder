import test from "node:test";
import assert from "node:assert/strict";
import { kanaUnits, kanaScript, selectKanaDeck } from "../../src/reading/kanaUnits.js";

// The kana deck's sound units and selection (src/reading/kanaUnits.js).

test("a small kana joins the kana before it into one sound", () => {
  assert.deepEqual(kanaUnits("にゃ"), ["にゃ"]);
  assert.deepEqual(kanaUnits("きょう"), ["きょ", "う"]);
  assert.deepEqual(kanaUnits("パーティー"), ["パ", "ー", "ティ", "ー"]);
  assert.deepEqual(kanaUnits("ファッション"), ["ファ", "ッ", "ショ", "ン"]);
  assert.deepEqual(kanaUnits("ヴァイオリン"), ["ヴァ", "イ", "オ", "リ", "ン"]);
});

test("small っ and ー are units of their own, and non-kana is skipped", () => {
  assert.deepEqual(kanaUnits("がっこう"), ["が", "っ", "こ", "う"]);
  assert.deepEqual(kanaUnits("コーヒー"), ["コ", "ー", "ヒ", "ー"]);
  assert.deepEqual(kanaUnits("じゃあ、また"), ["じゃ", "あ", "ま", "た"]);
  assert.deepEqual(kanaUnits("日本ご"), ["ご"]);
});

test("a word with any katakana counts against the katakana budget", () => {
  assert.equal(kanaScript("すし"), "hiragana");
  assert.equal(kanaScript("カナダ"), "katakana");
  assert.equal(kanaScript("アジアけんきゅう"), "katakana");
  assert.equal(kanaScript("すー"), "hiragana");
});

const word = (target, position) => ({ target, position });

test("coverage first: every sound reaches the minimum, even past a budget", () => {
  const pool = [
    word("あい", 1),
    word("あお", 2),
    word("いえ", 3),
    word("うえ", 4),
    word("にゃあ", 5),
  ];
  const { selected, coverage, short } = selectKanaDeck(pool, {
    budgets: { hiragana: 1, katakana: 0 },
    minPerUnit: 1,
  });
  // Budget 1, but every unit must appear once: あ い お え う にゃ need more than one word.
  for (const unit of ["あ", "い", "お", "え", "う", "にゃ"]) assert.ok(coverage[unit] >= 1, unit);
  assert.ok(selected.length > 1);
  assert.deepEqual(short, []);
});

test("then fill in book order up to the budget, and say why the rest is out", () => {
  const pool = [word("あ", 1), word("あああ", 2), word("ああ", 3), word("アア", 4)];
  const result = selectKanaDeck(pool, { budgets: { hiragana: 2, katakana: 0 }, minPerUnit: 1 });
  // Coverage takes あ (first, covers あ), then カタカナ アア for ア; fill adds あああ (book order).
  assert.deepEqual(
    result.selected.map((e) => e.target),
    ["あ", "あああ", "アア"],
  );
  assert.deepEqual(result.unselected, [
    { target: "ああ", reason: "the hiragana budget (2 words) was already full" },
  ]);
});

test("a sound the whole book has too few of is reported, and the result is deterministic", () => {
  const pool = [word("ぢ", 2), word("すし", 1), word("すし", 9)];
  const a = selectKanaDeck(pool, { budgets: { hiragana: 5, katakana: 5 }, minPerUnit: 3 });
  const b = selectKanaDeck([...pool].reverse(), {
    budgets: { hiragana: 5, katakana: 5 },
    minPerUnit: 3,
  });
  assert.deepEqual(a, b);
  assert.deepEqual(a.short.sort(), ["し", "す", "ぢ"].sort());
  // A written form is chosen once, at its first position.
  assert.deepEqual(
    a.selected.map((e) => e.target),
    ["すし", "ぢ"],
  );
});

test("a word with a digit is never chosen: it is not kana, and cannot be voiced reliably", () => {
  const { selected, unselected } = selectKanaDeck(
    [word("10ページをみてください", 1), word("すし", 2)],
    {
      budgets: { hiragana: 5, katakana: 5 },
      minPerUnit: 1,
    },
  );
  assert.deepEqual(
    selected.map((e) => e.target),
    ["すし"],
  );
  assert.match(unselected[0].reason, /digit/);
});

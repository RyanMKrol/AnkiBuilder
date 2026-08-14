import test from "node:test";
import assert from "node:assert/strict";
import {
  matchesInPredicatePosition,
  exclusionsForCell,
  auditParadigmGrid,
} from "../../src/cards/paradigmGrid.js";

// The exact false positive extras-pass.md names: います sits inside かいました, so a substring audit
// of あります/います reports near-full coverage of a paradigm the deck barely touches.
test("a form buried mid-word is not a hit", () => {
  assert.equal(matchesInPredicatePosition("パンをかいました", "います"), false);
});

test("a form after a particle, or at the start of the string, is a hit", () => {
  assert.equal(matchesInPredicatePosition("つくえのうえにあります", "あります"), true);
  assert.equal(matchesInPredicatePosition("あります", "あります"), true);
  assert.equal(matchesInPredicatePosition("ねこがいます", "います"), true);
});

// The other half: ありません contains あります' stem, and じゃありません contains ありません.
test("a longer form of the same paradigm never counts as a hit for the shorter one", () => {
  assert.equal(
    matchesInPredicatePosition("がくせいじゃありません", "ありません", {
      excludeForms: ["じゃありません"],
    }),
    false,
  );
});

test("exclusions are derived from the grid's own longer cells", () => {
  const cells = [{ form: "います" }, { form: "いません" }, { form: "いませんでした" }];
  assert.deepEqual(exclusionsForCell(cells[1], cells), ["いませんでした"]);
  assert.deepEqual(exclusionsForCell(cells[0], cells), [], "いません does not contain います");
});

test("a cell may name its own known confusables, which are excluded too", () => {
  const cells = [{ form: "います", notForms: ["ちがいます"] }];
  assert.deepEqual(exclusionsForCell(cells[0], cells), ["ちがいます"]);
  assert.equal(
    matchesInPredicatePosition("それはちがいます", "います", { excludeForms: ["ちがいます"] }),
    false,
    "ち + が + います defeats the particle rule; only a named confusable stops it",
  );
});

test("auditParadigmGrid reports every cell, its hits and the empty ones", () => {
  const grid = {
    name: "あります / います",
    cells: [
      { label: "inanimate affirmative", form: "あります" },
      { label: "inanimate negative", form: "ありません" },
      { label: "animate affirmative", form: "います" },
    ],
  };
  const cards = [
    { id: "a", target: "つくえのうえにあります", __unit: "chapter-13" },
    { id: "b", target: "ねこがいます", __unit: "chapter-13-extras" },
    { id: "c", target: "がくせいじゃありません", __unit: "chapter-11" },
  ];

  const result = auditParadigmGrid({ grid, cards });

  assert.deepEqual(result.missing, ["inanimate negative"]);
  assert.deepEqual(
    result.cells[0].hits.map((h) => h.id),
    ["a"],
  );
  assert.equal(
    result.cells[2].hits[0].unit,
    "chapter-13-extras",
    "hits name the unit they came from",
  );
});

test("auditParadigmGrid refuses a grid with no cells, or a cell with no form", () => {
  assert.throws(() => auditParadigmGrid({ grid: { cells: [] }, cards: [] }), /non-empty `cells`/);
  assert.throws(
    () => auditParadigmGrid({ grid: { cells: [{ label: "x" }] }, cards: [] }),
    /non-empty `form`/,
  );
});

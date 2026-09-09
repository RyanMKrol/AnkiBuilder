import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNumberedBlocks,
  chapterOutline,
  toRoman,
  fromRoman,
} from "../../src/corpus/chapterOutline.js";

const JBP = [
  { filenamePrefix: "enum", label: "EXERCISES" },
  { filenamePrefix: "wnum", label: "WORD POWER" },
];

const HTML = `
  <h2>EXERCISES</h2>
  <img src="images/enum-I.jpg"/> <img src="images/enum-II.jpg"/> <img src="images/enum-IV.jpg"/>
  <h2>WORD POWER</h2>
  <img src="images/wnum-I.jpg"/>
`;

test("a book with no markers gets no blocks, which is not a claim that it has none", () => {
  assert.deepEqual(parseNumberedBlocks(HTML), []);
  assert.deepEqual(parseNumberedBlocks(HTML, []), []);
  assert.deepEqual(chapterOutline(HTML).groups, []);
});

test("a book's own markers drive the kinds, and the labels are the book's words", () => {
  const blocks = parseNumberedBlocks(HTML, JBP);
  assert.deepEqual(
    blocks.map((b) => `${b.kind}:${b.numeral}`),
    ["EXERCISES:I", "EXERCISES:II", "EXERCISES:IV", "WORD POWER:I"],
  );
});

test("a marker this publisher never used works the same way", () => {
  const html = `<img src="figs/drill-III.png"/>`;
  const blocks = parseNumberedBlocks(html, [{ filenamePrefix: "drill", label: "PRACTICE" }]);
  assert.deepEqual(blocks, [{ kind: "PRACTICE", numeral: "III", at: blocks[0].at }]);
});

test("a gap in the run is still reported, which is the point of the checklist", () => {
  const { groups } = chapterOutline(HTML, { markers: JBP });
  const exercises = groups.find((g) => g.kind === "EXERCISES");
  assert.deepEqual(exercises.numerals, ["I", "II", "IV"]);
  assert.deepEqual(exercises.missing, ["III"], "III is the block nobody read");
});

test("numerals past the old XIV ceiling are handled, where the literal array silently could not", () => {
  // The previous implementation was an array stopping at XIV, so `expected` could never contain XV
  // and a missing XV was invisible in the check written to make a missed block visible.
  const html = Array.from({ length: 16 }, (_, i) =>
    i + 1 === 15 ? "" : `<img src="e-${toRoman(i + 1)}.jpg"/>`,
  ).join("");
  const { groups } = chapterOutline(html, { markers: [{ filenamePrefix: "e", label: "DRILLS" }] });
  assert.deepEqual(groups[0].missing, ["XV"]);
});

test("roman conversion round-trips and rejects nonsense", () => {
  for (const n of [1, 4, 9, 14, 15, 40, 90, 400, 1987]) {
    assert.equal(fromRoman(toRoman(n)), n, String(n));
  }
  assert.equal(fromRoman("IIII"), null, "not canonical");
  assert.equal(fromRoman("banana"), null);
  assert.equal(toRoman(0), null);
});

test("a marker prefix with regex metacharacters is escaped, not interpreted", () => {
  const html = `<img src="a.b-II.jpg"/><img src="axb-III.jpg"/>`;
  const blocks = parseNumberedBlocks(html, [{ filenamePrefix: "a.b", label: "X" }]);
  assert.deepEqual(
    blocks.map((b) => b.numeral),
    ["II"],
    "the dot matched literally, so axb-III did not match",
  );
});

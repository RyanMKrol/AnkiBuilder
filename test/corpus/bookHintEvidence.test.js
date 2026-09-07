import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleSpine,
  tableClassEvidence,
  imageStemEvidence,
  commonStemPrefix,
  labelWordEvidence,
  gatherHintEvidence,
  describeHintEvidence,
} from "../../src/corpus/bookHintEvidence.js";

test("the sample spreads across the book, because front matter is what does not look like a lesson", () => {
  const picked = sampleSpine(57, 12);
  assert.equal(picked.length, 12);
  assert.equal(picked[0], 1);
  assert.ok(picked[picked.length - 1] > 40, "the sample reaches the back of the book");
  // A short book is read whole rather than sampled.
  assert.deepEqual(sampleSpine(4, 12), [1, 2, 3, 4]);
  assert.deepEqual(sampleSpine(0), []);
});

test("table classes are counted on the table and inside it, separately", () => {
  // They answer different hints: one names the vocabulary table, the other the rows that continue
  // the entry above.
  const html = `
    <table class="voca"><tr><td class="sub">continued</td></tr></table>
    <table class="voca"><tr><td class="w30">x</td></tr></table>
    <table class="tab1"><tr><td>plain</td></tr></table>`;
  const e = tableClassEvidence(html);
  assert.equal(e.tables, 3);
  assert.equal(e.onTables.get("voca"), 2);
  assert.equal(e.onTables.get("tab1"), 1);
  assert.equal(e.insideTables.get("td.sub"), 1);
  assert.equal(e.onTables.has("td.sub"), false, "a class inside is not a class on");
});

test("a trailing counter is stripped, roman numerals included", () => {
  // Stripping only digits left enum-I, enum-II and enum-III as three stems of one instead of one
  // stem of three, and the pattern that jumps out of a frequency table is the one that got summed.
  const html = `
    <img src="im/enum-I.jpg"/><img src="im/enum-II.jpg"/><img src="im/enum-III.jpg"/>
    <img src="im/fig-3.png"/><img src="im/fig-11.png"/><img src="im/cover.png"/>`;
  const stems = imageStemEvidence(html);
  assert.equal(stems.get("enum"), 3);
  assert.equal(stems.get("fig"), 2);
  assert.equal(stems.get("cover"), 1);
});

test("the shared publisher prefix is reported once instead of on every row", () => {
  assert.equal(commonStemPrefix(["978_9_enum", "978_9_wnum", "978_9_audio"]), "978_9_");
  // Nothing shared, and a single stem, both mean there is no prefix to strip.
  assert.equal(commonStemPrefix(["enum", "wnum"]), "");
  assert.equal(commonStemPrefix(["enum"]), "");
});

test("label words are the FIRST word of each nav entry, punctuation trimmed", () => {
  const words = labelWordEvidence([
    "Lesson 1: Meeting",
    "Lesson 2: Shopping",
    "Unit 1",
    "Contents",
  ]);
  assert.equal(words.get("Lesson"), 2);
  assert.equal(words.get("Unit"), 1);
  assert.equal(words.get("Contents"), 1);
});

test("a spine file that will not read is skipped, and the report says which were read", () => {
  // A broken spine file is a fact about the book, not a reason to stop counting.
  const evidence = gatherHintEvidence("/nowhere.epub", {
    spineCount: 3,
    labels: ["Lesson 1"],
    readSpine: (n) => {
      if (n === 2) throw new Error("unreadable");
      return `<table class="voca"><tr><td class="sub">x</td></tr></table>`;
    },
  });
  assert.deepEqual(evidence.sampledSpine, [1, 3]);
  assert.equal(evidence.spineCount, 3);
  assert.equal(evidence.tables, 2);
  assert.equal(evidence.tableClasses[0].value, "voca");
});

test("the description says an absent signal is an answer, not a reason to guess", () => {
  // A wrong hint costs recall silently; a missing one makes the check report unknown, which is the
  // state that gets looked at.
  const text = describeHintEvidence(
    gatherHintEvidence("/nowhere.epub", {
      spineCount: 1,
      labels: [],
      readSpine: () => "<p>no tables, no images, no labels</p>",
    }),
  );
  assert.match(text, /class on <table>:\s+none/);
  assert.match(text, /counts, not conclusions/);
  assert.match(text, /leave the hint unset rather than guess/);
});

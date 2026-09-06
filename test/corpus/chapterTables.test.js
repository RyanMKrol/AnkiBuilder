import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTables,
  annotateWithHints,
  describeTables,
  classOf,
} from "../../src/corpus/chapterTables.js";

const HTML = `
  <h2>VOCABULARY</h2>
  <table class="voca"><tr><td>ねこ</td><td>Cat</td></tr></table>
  <h2>WORD POWER</h2>
  <table class="tab1 FS-95"><tr><td>0</td><td>ゼロ ／ れい</td></tr><tr><td>4</td><td>よん ／ し</td></tr></table>
  <table><tr><th>Present</th><th>Past</th></tr><tr><td>です</td><td>でした</td></tr></table>
`;

test("every table is dumped, whatever its class, including none at all", () => {
  const tables = parseTables(HTML);
  assert.equal(tables.length, 3);
  assert.deepEqual(
    tables.map((t) => t.className),
    ["voca", "tab1 FS-95", null],
  );
});

test("the table a class selector would miss carries the content that was lost", () => {
  // This is the real case: the numbers chart is class="tab1 FS-95", so a `class="voca"` selector
  // returned nothing for it, and the alternate readings れい and し are the target of no card in
  // the whole book.
  const chart = parseTables(HTML)[1];
  assert.ok(chart.cellText.includes("ゼロ ／ れい"));
  assert.ok(chart.cellText.includes("よん ／ し"));
});

test("a ragged table reports every column count, because the raggedness is the signal", () => {
  const [table] = parseTables(
    `<table><tr><td>a</td><td>b</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>`,
  );
  assert.deepEqual(table.columnCounts, [2, 3]);
});

test("header cells are marked, so a paradigm table is distinguishable from a word list", () => {
  const [, , paradigm] = parseTables(HTML);
  assert.deepEqual(
    paradigm.rows[0].map((c) => [c.text, c.header]),
    [
      ["Present", true],
      ["Past", true],
    ],
  );
});

test("hints annotate and never filter", () => {
  const annotated = annotateWithHints(parseTables(HTML), { vocabularyTableClass: "voca" });
  assert.equal(annotated.length, 3, "nothing was removed for failing to match the hint");
  assert.deepEqual(
    annotated.map((t) => t.hintMatch),
    [true, false, false],
  );
});

test("no hint means 'not asked', which is not the same as 'did not match'", () => {
  const annotated = annotateWithHints(parseTables(HTML));
  assert.deepEqual(
    annotated.map((t) => t.hintMatch),
    [null, null, null],
  );
});

test("a chapter with no tables says so, rather than printing nothing", () => {
  assert.equal(parseTables("<p>prose only</p>").length, 0);
  assert.match(describeTables([]), /NO TABLES/);
});

test("classOf reads the attribute and is null when there is none", () => {
  assert.equal(classOf(' class="voca FS-95"'), "voca FS-95");
  assert.equal(classOf(" id='x'"), null);
  assert.equal(classOf(undefined), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_ID,
  TABLE_VERDICTS,
  renderTableSpecialistPrompt,
  assertAccountedFor,
  judgeTables,
} from "../../src/agents/tableSpecialist.js";
import { parseTables } from "../../src/corpus/chapterTables.js";

const HTML = `
  <table class="voca"><tr><td>ねこ</td><td>Cat</td></tr></table>
  <table class="tab1 FS-95"><tr><td>0</td><td>ゼロ ／ れい</td></tr></table>
`;
const TABLES = parseTables(HTML);

// A stub runner: asserts nothing spawns, and returns whatever the test wants back.
const stub = (payload) => () => JSON.stringify(payload);

test("the prompt carries the tables, the book's hints and the categories", () => {
  const prompt = renderTableSpecialistPrompt({
    tables: TABLES,
    targetLanguage: "ja",
    meta: { hints: { vocabularyTableClass: "voca" } },
  });
  assert.match(prompt, /ゼロ ／ れい/, "the cell text reached the model");
  assert.match(prompt, /vocabularyTableClass/, "the book's hint reached the model");
  assert.match(prompt, /"index": 1/, "indexes are what the model must account for");
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/, "no placeholder left unresolved");
});

test("a book with no hints gets a sentence saying so, not an empty section", () => {
  const prompt = renderTableSpecialistPrompt({ tables: TABLES, targetLanguage: "ja" });
  assert.match(prompt, /no conventions recorded for this book/);
});

test("items are stamped with the role, so a reviewer's later edit is attributable", () => {
  const { items } = judgeTables({
    tables: TABLES,
    targetLanguage: "ja",
    runClaude: stub({
      items: [{ id: "neko", target: "ねこ", english: "Cat", category: "Animals", fromTable: 0 }],
      tables: [
        { index: 0, verdict: "vocabulary", reason: "glossed pairs" },
        { index: 1, verdict: "reference", reason: "numbers chart" },
      ],
    }),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].producedBy, ROLE_ID);
});

test("a response that skips a table is rejected, not merged", () => {
  // This is the failure the role replaces, in a new costume: a table nobody judged and a table
  // holding nothing must not look the same from the outside.
  assert.throws(
    () =>
      judgeTables({
        tables: TABLES,
        targetLanguage: "ja",
        runClaude: stub({ items: [], tables: [{ index: 0, verdict: "vocabulary", reason: "x" }] }),
      }),
    /did not account for table\(s\) 1/,
  );
});

test("a verdict for a table that was never sent is rejected", () => {
  assert.throws(
    () =>
      assertAccountedFor(TABLES, [
        { index: 0, verdict: "vocabulary" },
        { index: 9, verdict: "layout" },
      ]),
    /judged table 9, which it was not given/,
  );
});

test("an unknown verdict is a parse error, not a new category", () => {
  assert.throws(
    () => assertAccountedFor(TABLES, [{ index: 0, verdict: "probably words" }]),
    /unknown verdict/,
  );
  assert.ok(TABLE_VERDICTS.includes("unreadable"), "the honest 'could not tell' verdict exists");
});

test("a table judged twice is rejected", () => {
  assert.throws(
    () =>
      assertAccountedFor(TABLES, [
        { index: 0, verdict: "vocabulary" },
        { index: 0, verdict: "layout" },
      ]),
    /judged table 0 twice/,
  );
});

test("no tables means no call and no items", () => {
  const never = () => assert.fail("must not spawn a model for an empty chapter");
  assert.deepEqual(judgeTables({ tables: [], targetLanguage: "ja", runClaude: never }), {
    items: [],
    tables: [],
  });
});

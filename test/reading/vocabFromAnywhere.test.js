import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { reconcileReading, runReadingPhase } from "../../src/reading/readingPhase.js";
import { laterVocabulary, cellForms } from "../../src/reading/laterVocabulary.js";
import {
  scanRows,
  cardedForms,
  excludedForms,
  summarizeRows,
} from "../../src/reading/vocabScan.js";
import { renderReadingChapterPrompt } from "../../src/reading/readingAgents.js";
import { validateCards, validateCorpus } from "../../src/model/index.js";

// Card rules 1, widened (owner ruling, 2026-10-18): a reading deck cards every word the chapter puts
// in front of the learner, wherever it appears, except that a word a later chapter's vocabulary list
// introduces is carded there; English the book does not give is flagged AI-suggested.

const chapterWord = (target, extra = {}) => ({
  target,
  english: "X",
  kind: "word",
  producedBy: "readingChapterReader",
  ...extra,
});

test("a word only used here, that a later chapter's list introduces, is carded there", () => {
  const laterTaught = new Map([
    ["生け花", "Chapter 11: Lesson 9"],
    ["映画", "Chapter 11: Lesson 9"],
    ["音楽", "Chapter 11: Lesson 9"],
    ["電話", "Chapter 11: Lesson 9"],
  ]);
  const { items, dropped } = reconcileReading(
    [
      // The table reader's item is this chapter's own list: carded here whatever a later list does.
      [
        {
          target: "映画",
          reading: "えいが",
          english: "Movie",
          kind: "word",
          producedBy: "readingTableReader",
        },
      ],
      [
        chapterWord("生け花", { reading: "いけばな", where: "culture note", glossed: false }),
        // Listed by the chapter itself, outside a table: taught here.
        chapterWord("音楽", { reading: "おんがく", where: "vocabulary list", glossed: true }),
        // No `where`: a reply from before the field, when the reader carded only what was taught.
        chapterWord("電話", { reading: "でんわ" }),
        // A dialogue word no later list has: a card here, with its English flagged.
        chapterWord("天気", { reading: "てんき", where: "dialogue", glossed: false }),
      ],
    ],
    { targetLanguage: "ja", laterTaught },
  );
  assert.deepEqual(items.map((i) => i.target).sort(), ["天気", "映画", "電話", "音楽"].sort());
  const held = dropped.find((d) => d.target === "生け花");
  assert.equal(held.laterChapter, "Chapter 11: Lesson 9");
  assert.match(held.reason, /Chapter 11: Lesson 9's vocabulary list introduces it/);
});

test("a word an earlier chapter carded keeps the earlier reason, not the later one", () => {
  const { dropped } = reconcileReading(
    [[chapterWord("映画", { reading: "えいが", where: "dialogue" })]],
    {
      targetLanguage: "ja",
      earlier: [{ target: "映画", chapterLabel: "Chapter 05: Lesson 3" }],
      laterTaught: new Map([["映画", "Chapter 11: Lesson 9"]]),
    },
  );
  assert.equal(dropped.length, 1);
  assert.match(dropped[0].reason, /already carded in Chapter 05: Lesson 3/);
});

test("English the book does not give is flagged AI-suggested, on chapter and kana cards", () => {
  const { items, kanaPool } = reconcileReading(
    [
      [
        chapterWord("天気", { reading: "てんき", where: "dialogue", glossed: false }),
        chapterWord("映画", { reading: "えいが", where: "vocabulary list", glossed: true }),
        chapterWord("すぐ", { where: "dialogue", glossed: false }),
      ],
    ],
    { targetLanguage: "ja" },
  );
  const byTarget = Object.fromEntries(items.map((i) => [i.target, i]));
  assert.equal(byTarget["天気"].aiSuggested, true);
  assert.match(byTarget["天気"].reviewNote, /AI-suggested/);
  assert.equal(byTarget["映画"].aiSuggested, undefined);
  assert.equal(kanaPool.find((k) => k.target === "すぐ").aiSuggested, true);
  // The flag is a field of both schemas, so the unit still validates.
  const meta = { targetLanguage: "ja", sourceType: "epub", phase: "reading" };
  assert.doesNotThrow(() => validateCorpus({ meta, items }));
  assert.doesNotThrow(() =>
    validateCards({ meta, items: items.map((i) => ({ ...i, pronunciation: "" })) }),
  );
});

function fixtureBook(dir) {
  // Chapter A: built, so its table reader's verdicts say which table is the list.
  const unitA = join(dir, "collection", "chapter-11");
  mkdirSync(join(unitA, "candidates"), { recursive: true });
  const cell = (text) => ({ header: false, className: null, text });
  writeFileSync(
    join(unitA, "candidates", "tables-raw.json"),
    JSON.stringify([
      {
        index: 0,
        className: null,
        rows: [[cell("いけばな"), cell("生け花"), cell("flower arranging")]],
      },
      { index: 1, className: null, rows: [[cell("練習"), cell("drill")]] },
    ]),
  );
  writeFileSync(
    join(unitA, "candidates", "tables.json"),
    JSON.stringify({
      tables: [
        { index: 0, verdict: "vocabulary" },
        { index: 1, verdict: "other" },
      ],
      items: [{ target: "生け花", reading: "いけばな", english: "Flower arranging", table: 0 }],
    }),
  );
  // Chapter B: not built, read from its cached chapter file; a converted book's class names the list.
  const fileB = join(dir, "cache", "20.xhtml");
  mkdirSync(join(dir, "cache"), { recursive: true });
  writeFileSync(
    fileB,
    '<html><body><table class="vocabulary"><tr><td>てんき</td><td>天気</td><td>weather</td></tr>' +
      "<tr><td>えいが／映画</td><td>movie</td></tr></table>" +
      "<table><tr><td>宿題</td></tr></table></body></html>",
  );
  // Chapter C: a later chapter that lists 天気 again; the first chapter to list it wins.
  const fileC = join(dir, "cache", "30.xhtml");
  writeFileSync(
    fileC,
    '<html><body><table class="vocabulary"><tr><td>天気</td><td>weather</td></tr></table></body></html>',
  );
  return [
    {
      label: "Chapter 11: Lesson 9",
      chapterFilePath: join(dir, "cache", "11.xhtml"),
      unitDir: unitA,
    },
    { label: "Chapter 20: Lesson 12", chapterFilePath: fileB, unitDir: null },
    { label: "Chapter 30", chapterFilePath: fileC, unitDir: null },
  ];
}

test("the later lists come from the collection's own later chapters, vocabulary tables only", () => {
  const dir = mkdtempSync(join(tmpdir(), "later-vocab-"));
  try {
    const taught = laterVocabulary(fixtureBook(dir), { targetLanguage: "ja" });
    assert.equal(taught.get("生け花"), "Chapter 11: Lesson 9");
    assert.equal(taught.get("いけばな"), "Chapter 11: Lesson 9");
    assert.equal(taught.get("天気"), "Chapter 20: Lesson 12");
    assert.equal(taught.get("映画"), "Chapter 20: Lesson 12");
    // Not a vocabulary list: an `other` table, and a table the book gives no list class.
    assert.equal(taught.has("練習"), false);
    assert.equal(taught.has("宿題"), false);
    // A book hint names the list's class, and then only that class counts.
    const hinted = laterVocabulary(fixtureBook(dir), {
      targetLanguage: "ja",
      vocabularyTableClass: "voca-list",
    });
    assert.equal(hinted.has("天気"), false);
    assert.equal(hinted.get("生け花"), "Chapter 11: Lesson 9");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a cell's forms are the whole cell and each piece between separators", () => {
  assert.deepEqual(cellForms("えいが／映画", "ja"), ["えいが／映画", "えいが", "映画"]);
  assert.ok(cellForms("part-time job (more colloquially, バイト)", "ja").includes("バイト"));
});

test("the phase holds back a word a later list introduces, and says so in the report", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-later-"));
  try {
    const unitDir = join(dir, "chapter-5");
    const chapterFilePath = join(dir, "chapter.xhtml");
    writeFileSync(chapterFilePath, "<html><body><h2>Culture Note</h2><p>生け花</p></body></html>");
    const agents = {
      readTables: () => ({ items: [], tables: [] }),
      readChapterForReading: () => ({
        items: [
          chapterWord("生け花", { reading: "いけばな", where: "culture note", glossed: false }),
          chapterWord("天気", { reading: "てんき", where: "dialogue", glossed: false }),
        ],
        sections: [{ title: "Culture Note", read: true, items: 2 }],
        unread: [],
      }),
      readImagesForReading: () => ({ items: [], images: [] }),
      enumerateForReading: () => ({ items: [{ target: "生け花" }], coverage: null }),
      romanizeReadingItems: async (items) => ({
        items: items.map((i) => ({ ...i, pronunciation: `r:${i.target}` })),
        romanized: [],
        reused: 0,
        skipped: [],
        failed: false,
        reason: null,
      }),
    };
    const result = await runReadingPhase({
      unitDir,
      chapterFilePath,
      targetLanguage: "ja",
      unit: { epubHash: "abc", chapterNumber: 5, chapterLabel: "Chapter 05: Lesson 3" },
      laterTaught: new Map([["生け花", "Chapter 11: Lesson 9"]]),
      agents,
    });
    assert.equal(result.verdict.ok, true, result.verdict.problems.join("; "));
    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    assert.deepEqual(
      cards.items.map((i) => [i.target, i.aiSuggested]),
      [["天気", true]],
    );
    const report = JSON.parse(readFileSync(join(unitDir, "reading-report.json"), "utf-8"));
    assert.equal(
      report.dropped.find((d) => d.target === "生け花").laterChapter,
      "Chapter 11: Lesson 9",
    );
    // Held back for a later chapter is accounted for, so the adversary's listing is not a gap.
    assert.deepEqual(result.gaps.gaps, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the chapter prompt asks where each word was seen and whether the book glossed it", () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-prompt-"));
  try {
    const path = join(dir, "c.xhtml");
    writeFileSync(path, "<html></html>");
    const prompt = renderReadingChapterPrompt({
      chapterFilePath: path,
      sections: [],
      targetLanguage: "Japanese",
      meta: null,
    });
    assert.match(prompt, /`culture note`/);
    assert.match(prompt, /"glossed": false/);
    assert.match(prompt, /wherever it appears/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the vocab scan gives each candidate word one row and a decision", () => {
  const dir = mkdtempSync(join(tmpdir(), "vocab-scan-"));
  try {
    const unit = join(dir, "chapter-3");
    mkdirSync(unit);
    writeFileSync(
      join(unit, "cards.json"),
      JSON.stringify({
        meta: { chapterLabel: "Chapter 03: Lesson 1" },
        items: [
          { id: "a", target: "映画", english: "Movie" },
          {
            id: "b",
            target: "切手",
            english: "Stamp",
            excluded: true,
            excludedBy: "owner",
            excludedReason: "Not a word",
          },
        ],
      }),
    );
    const carded = cardedForms(dir, "ja");
    assert.deepEqual([...carded], [["映画", "Chapter 03: Lesson 1"]]);
    const excluded = excludedForms(dir, "ja");
    assert.deepEqual(
      [...excluded],
      [
        [
          "切手",
          { chapter: "Chapter 03: Lesson 1", excludedBy: "owner", excludedReason: "Not a word" },
        ],
      ],
    );
    const rows = scanRows({
      chapterLabel: "Chapter 05: Lesson 3",
      chapterNumber: 5,
      items: [
        chapterWord("映画", { where: "dialogue" }),
        chapterWord("生け花", { reading: "いけばな", where: "culture note", glossed: false }),
        chapterWord("生け花", { where: "culture note" }),
        chapterWord("切手", { reading: "きって", where: "exercise", glossed: false }),
        chapterWord("音楽", { reading: "おんがく", where: "vocabulary list" }),
      ],
      laterTaught: new Map([
        ["生け花", "Chapter 11: Lesson 9"],
        ["音楽", "Chapter 11: Lesson 9"],
      ]),
      carded,
      excluded,
      targetLanguage: "ja",
    });
    const byTarget = Object.fromEntries(rows.map((r) => [r.target, r]));
    assert.equal(rows.length, 4);
    assert.equal(byTarget["映画"].decision, "card exists");
    assert.equal(byTarget["映画"].cardIn, "Chapter 03: Lesson 1");
    assert.equal(byTarget["生け花"].decision, "skip, carded there");
    assert.equal(byTarget["生け花"].glossed, false);
    // Someone already decided against this exact form; the scan says so instead of asking again.
    assert.equal(byTarget["切手"].decision, "excluded");
    assert.equal(byTarget["切手"].excludedIn, "Chapter 03: Lesson 1");
    assert.equal(byTarget["切手"].excludedReason, "Not a word");
    assert.equal(byTarget["切手"].cardExists, false);
    // Its own list teaches it here, so a later list does not hold it back.
    assert.equal(byTarget["音楽"].decision, "candidate");
    assert.deepEqual(summarizeRows(rows), {
      "card exists": 1,
      excluded: 1,
      "skip, carded there": 1,
      candidate: 1,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

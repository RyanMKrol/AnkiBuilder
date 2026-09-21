import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { numberChapters, studyChapters } from "../../src/remaster/outline.js";
import { buildRemasteredEpub } from "../../src/remaster/epubWriter.js";
import { listLessons, resolveLesson, classifyLesson } from "../../src/corpus/epubLessons.js";
import { unitDeckSegments } from "../../src/deck/deckPath.js";

// The chapter rule every converted book follows (owner ruling 2026-09-21, DECISIONS.md): study
// units become "Chapter NN: <the book's own name>" in page order, and nothing else goes in the book.

const entry = (number, label, kind, firstPage, lastPage = firstPage) => ({
  number,
  label,
  kind,
  firstPage,
  lastPage,
});

const genkiLike = {
  printedPageOffset: 9,
  entries: [
    entry(1, "Cover and Title Pages", "front-matter", 1, 4),
    entry(2, "Greetings", "lesson", 5, 6),
    entry(3, "Lesson 1: New Friends", "lesson", 7, 9),
    entry(4, "Lesson 2: Shopping", "lesson", 10, 11),
    entry(5, "Reading and Writing 1: Hiragana", "lesson", 12, 13),
    entry(6, "Appendix: Vocabulary Index", "back-matter", 14, 15),
  ],
};

test("study units are numbered as chapters in page order, keeping the book's own name", () => {
  const chapters = studyChapters(genkiLike);
  assert.deepEqual(
    chapters.map((c) => c.chapterLabel),
    [
      "Chapter 01: Greetings",
      "Chapter 02: Lesson 1: New Friends",
      "Chapter 03: Lesson 2: Shopping",
      "Chapter 04: Reading and Writing 1: Hiragana",
    ],
  );
});

test("front and back matter stay in the outline but get no chapter", () => {
  const numbered = numberChapters(genkiLike).entries;
  assert.deepEqual(
    numbered.filter((e) => e.chapter === null).map((e) => e.label),
    ["Cover and Title Pages", "Appendix: Vocabulary Index"],
  );
});

test("numbering is deterministic, so an old outline gets the same chapters on load", () => {
  assert.deepEqual(numberChapters(numberChapters(genkiLike)), numberChapters(genkiLike));
});

test("the number is padded to the width the book needs", () => {
  const many = {
    entries: Array.from({ length: 105 }, (_, i) => entry(i + 1, `Unit ${i + 1}`, "lesson", i + 1)),
  };
  const labels = studyChapters(many).map((c) => c.chapterLabel);
  assert.equal(labels[0], "Chapter 001: Unit 1");
  assert.equal(labels[104], "Chapter 105: Unit 105");
});

test("a chapter label files as a grouped deck, like a lesson, with its extras beside it", () => {
  assert.deepEqual(unitDeckSegments("Chapter 02: Lesson 1: New Friends"), [
    "Chapter 02",
    "Lesson 1: New Friends",
  ]);
  assert.deepEqual(unitDeckSegments("Chapter 02: Lesson 1: New Friends (Extras)"), [
    "Chapter 02",
    "Lesson 1: New Friends (Extras)",
  ]);
  assert.equal(classifyLesson("Chapter 02: Lesson 1: New Friends"), "lesson");
});

test("in the converted book, chapter number, --lesson ordinal and spine position agree", () => {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-chapters-"));
  try {
    const chapters = studyChapters(genkiLike).map((c) => ({
      ...c,
      number: c.chapter,
      label: c.chapterLabel,
      pages: [{ number: c.firstPage, printed: "", body: "<p>あ</p>" }],
    }));
    const path = join(dir, "book.epub");
    writeFileSync(
      path,
      buildRemasteredEpub(chapters, {
        title: "T",
        language: "ja",
        sourceHash: "0123456789abcdef",
        modified: "2000-01-01T00:00:00Z",
      }),
    );
    const lessons = listLessons(path);
    for (const [i, lesson] of lessons.entries()) {
      const chapterNumber = i + 1;
      assert.equal(lesson.number, chapterNumber, "nav ordinal");
      assert.equal(lesson.firstChapterNumber, chapterNumber, "spine position");
      assert.ok(lesson.label.startsWith(`Chapter 0${chapterNumber}:`), lesson.label);
    }
    // Padding keeps a label selector unambiguous: "Chapter 01" is not a prefix of "Chapter 10".
    assert.equal(resolveLesson(path, "Chapter 01").label, "Chapter 01: Greetings");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

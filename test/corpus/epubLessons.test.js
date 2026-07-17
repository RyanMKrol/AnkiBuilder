import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listLessons, resolveLesson } from "../../src/corpus/epubLessons.js";
import { buildFixtureEpub } from "../support/epubFixtures.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-lessons-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function chapterFile(name, title) {
  return { name, content: `<html><head><title>${title}</title></head><body>x</body></html>` };
}

// entries: [{ href, label }] — a minimal nav.xhtml toc.
function navXhtml(entries) {
  const items = entries.map((e) => `<li><a href="${e.href}">${e.label}</a></li>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc"><ol>${items}</ol></nav>
  </body>
</html>`;
}

// A book whose nav mixes front matter, a unit divider, lessons, and a quiz — and where one
// lesson (Lesson 2) spans two spine files (there's no nav entry for the 2nd file).
function buildBook(dir) {
  return buildFixtureEpub(dir, {
    manifestItems: [
      { id: "cover", href: "xhtml/cover.xhtml" },
      { id: "u1", href: "xhtml/u1.xhtml" },
      { id: "l1", href: "xhtml/l1.xhtml" },
      { id: "l2a", href: "xhtml/l2a.xhtml" },
      { id: "l2b", href: "xhtml/l2b.xhtml" },
      { id: "q1", href: "xhtml/q1.xhtml" },
      { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
    ],
    spineIdrefs: ["cover", "u1", "l1", "l2a", "l2b", "q1"],
    extraFiles: [
      chapterFile("OEBPS/xhtml/cover.xhtml", "Cover"),
      chapterFile("OEBPS/xhtml/u1.xhtml", "Unit"),
      chapterFile("OEBPS/xhtml/l1.xhtml", "One"),
      chapterFile("OEBPS/xhtml/l2a.xhtml", "TwoA"),
      chapterFile("OEBPS/xhtml/l2b.xhtml", "TwoB"),
      chapterFile("OEBPS/xhtml/q1.xhtml", "Quiz"),
      {
        name: "OEBPS/xhtml/nav.xhtml",
        content: navXhtml([
          { href: "cover.xhtml", label: "Cover" },
          { href: "u1.xhtml", label: "Unit 1: At the Office" },
          { href: "l1.xhtml", label: "Lesson 1: Meeting" },
          { href: "l2a.xhtml", label: "Lesson 2: Possession" },
          { href: "q1.xhtml", label: "Quiz 1" },
        ]),
      },
    ],
  });
}

test("listLessons() numbers entries, classifies type, and carries the spine range", () => {
  withTempDir((dir) => {
    const lessons = listLessons(buildBook(dir));

    assert.deepEqual(
      lessons.map((l) => ({
        number: l.number,
        type: l.type,
        range: `${l.firstChapterNumber}-${l.lastChapterNumber}`,
        label: l.label,
      })),
      [
        { number: 1, type: "front-matter", range: "1-1", label: "Cover" },
        { number: 2, type: "unit", range: "2-2", label: "Unit 1: At the Office" },
        { number: 3, type: "lesson", range: "3-3", label: "Lesson 1: Meeting" },
        // Lesson 2 spans spine files 4 AND 5 (5 has no nav entry) — range widens to 4-5.
        { number: 4, type: "lesson", range: "4-5", label: "Lesson 2: Possession" },
        { number: 5, type: "quiz", range: "6-6", label: "Quiz 1" },
      ],
    );
  });
});

test("listLessons() returns [] for a book with no navigation document", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch1.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [chapterFile("OEBPS/xhtml/ch1.xhtml", "One")],
    });
    assert.deepEqual(listLessons(epubPath), []);
  });
});

test("resolveLesson() selects by nav-list ordinal", () => {
  withTempDir((dir) => {
    const lesson = resolveLesson(buildBook(dir), "3");
    assert.equal(lesson.label, "Lesson 1: Meeting");
    assert.equal(lesson.firstChapterNumber, 3);
  });
});

test("resolveLesson() selects by unique case-insensitive label substring, keeping a multi-file range", () => {
  withTempDir((dir) => {
    const lesson = resolveLesson(buildBook(dir), "possession");
    assert.equal(lesson.label, "Lesson 2: Possession");
    assert.equal(lesson.firstChapterNumber, 4);
    assert.equal(lesson.lastChapterNumber, 5);
  });
});

test("resolveLesson() throws (listing the candidates) when a label substring is ambiguous", () => {
  withTempDir((dir) => {
    assert.throws(() => resolveLesson(buildBook(dir), "Lesson"), /ambiguous/i);
  });
});

test("resolveLesson() throws when a label substring matches nothing", () => {
  withTempDir((dir) => {
    assert.throws(() => resolveLesson(buildBook(dir), "nonesuch"), /matched no lesson/i);
  });
});

test("resolveLesson() throws when the ordinal is out of range", () => {
  withTempDir((dir) => {
    assert.throws(() => resolveLesson(buildBook(dir), "99"), /out of range/i);
  });
});

test("resolveLesson() throws a --chapter-number hint when the book has no nav document", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch1.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [chapterFile("OEBPS/xhtml/ch1.xhtml", "One")],
    });
    assert.throws(() => resolveLesson(epubPath, "Lesson 1"), /--chapter-number/);
  });
});

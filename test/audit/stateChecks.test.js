import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CHECKS, audit } from "../../src/audit/index.js";
import { makeOutputRoot, writeUnit, writeMarker, card } from "./fixture.js";

/**
 * The report-only state checks.
 *
 * All four are INFO: they report through `notes`, never `findings`, so none of them can block a
 * review link. That is the whole point — the states they describe are legitimate, and what was
 * missing was any way to see them.
 */

function runOnly(root, id) {
  return audit({ outputRoot: root, checks: ALL_CHECKS, only: [id] }).results;
}
const notes = (results) => results.flatMap((r) => r.notes);
const findings = (results) => results.flatMap((r) => r.findings);

test("readiness exemptions: a done unit with no pass markers is named, not failed", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "courses/course/lesson-1", {
      meta: { reviewed: true, done: true, sourceType: "manual" },
      items: [card("a")],
    });
    writeUnit(root, "courses/course/lesson-2", {
      meta: { reviewed: true, done: true, enriched: true, notesEnhanced: true },
      items: [card("b")],
    });
    const results = runOnly(root, "readiness-exemptions");
    assert.deepEqual(findings(results), [], "INFO: never a finding");
    assert.match(notes(results)[0], /lesson-1 \(no enriched, notesEnhanced\)/);
    assert.doesNotMatch(notes(results).join(" "), /lesson-2/);
  } finally {
    cleanup();
  }
});

test("readiness exemptions: prepareDegraded is called out separately", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      meta: {
        done: true,
        enriched: true,
        notesEnhanced: true,
        prepareDegraded: { missing: ["chapter-0"] },
      },
      items: [card("a")],
    });
    assert.match(notes(runOnly(root, "readiness-exemptions")).join(" "), /prepareDegraded/);
  } finally {
    cleanup();
  }
});

test("unit vs marker: a unit whose provenance names another source is reported", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeMarker(root, "courses/course", "course.json", { name: "Course", slug: "course" });
    writeUnit(root, "courses/course/lesson-1", {
      meta: { courseSlug: "some-other-course", chapterNumber: 1 },
      items: [card("a")],
    });
    assert.match(notes(runOnly(root, "unit-marker"))[0], /some-other-course/);
  } finally {
    cleanup();
  }
});

test("unit vs marker: a missing provenance field is absence, not disagreement", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeMarker(root, "epubs/book", "book.json", { slug: "book", epubHash: "h1" });
    writeUnit(root, "epubs/book/chapter-1-extras", { meta: {}, items: [card("a")] });
    assert.deepEqual(notes(runOnly(root, "unit-marker")), []);
  } finally {
    cleanup();
  }
});

test("unit vs marker: a book's spine-index gaps are NOT reported, a course's lesson gaps are", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeMarker(root, "epubs/book", "book.json", { slug: "book", epubHash: "h1" });
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { epubHash: "h1", chapterNumber: 11 },
      items: [card("a")],
    });
    writeUnit(root, "epubs/book/chapter-2", {
      meta: { epubHash: "h1", chapterNumber: 14 },
      items: [card("b")],
    });
    writeMarker(root, "courses/course", "course.json", { name: "Course", slug: "course" });
    writeUnit(root, "courses/course/lesson-1", { meta: { chapterNumber: 1 }, items: [card("c")] });
    writeUnit(root, "courses/course/lesson-3", { meta: { chapterNumber: 3 }, items: [card("d")] });

    const reported = runOnly(root, "unit-marker");
    const book = reported.find((r) => r.target === "book");
    const course = reported.find((r) => r.target === "course");
    assert.deepEqual(book.notes, [], "spine indexes skip; that is the normal shape of a book");
    assert.match(course.notes.join(" "), /lesson number\(s\) 2 are missing/);
  } finally {
    cleanup();
  }
});

test("corpus drift: a corpus id with no card, and an unmirrored exclusion", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("a"), card("b", { excluded: true })],
      corpus: { meta: {}, items: [{ id: "a" }, { id: "b" }, { id: "gone" }] },
    });
    const reported = notes(runOnly(root, "corpus-drift")).join(" ");
    assert.match(reported, /1 corpus id\(s\) have no card: gone/);
    assert.match(reported, /1 exclusion\(s\) are not mirrored/);
  } finally {
    cleanup();
  }
});

test("corpus drift: an enrichment card missing from the corpus is NOT drift", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("a"), card("fib-1")],
      corpus: { meta: {}, items: [{ id: "a" }] },
    });
    assert.deepEqual(notes(runOnly(root, "corpus-drift")), []);
  } finally {
    cleanup();
  }
});

test("corpus drift: the shared ids' relative order has to match", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("a"), card("b")],
      corpus: { meta: {}, items: [{ id: "b" }, { id: "a" }] },
    });
    assert.match(notes(runOnly(root, "corpus-drift")).join(" "), /different order/);
  } finally {
    cleanup();
  }
});

test("state: a delivered collection says so, and says which units are live", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { meta: { done: true }, items: [card("a")] });
    writeUnit(root, "epubs/book/chapter-2", { items: [card("b")] });
    writeMarker(root, "epubs/book", "anki-delivered.json", { ankiParent: "Book" });
    const reported = notes(runOnly(root, "collection-state")).join(" ");
    assert.match(reported, /✓ delivered/);
    assert.match(reported, /1 of 2 unit\(s\) are in the live collection/);
  } finally {
    cleanup();
  }
});

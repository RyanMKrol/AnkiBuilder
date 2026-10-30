import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CHECKS, audit } from "../../src/audit/index.js";
import { makeOutputRoot, writeUnit, card } from "./fixture.js";

/** The finding messages of one check, run over a throwaway output root. */
function findingsOf(root, id) {
  return audit({ outputRoot: root, checks: ALL_CHECKS, only: [id] }).results.flatMap((r) =>
    r.findings.map((f) => f.message),
  );
}

/** Lesson 1 at spine 10 teaches これ, ペン and です; nothing teaches とけい ("watch"). */
function writeLessonOne(root, extra = []) {
  writeUnit(root, "epubs/book/chapter-1", {
    meta: { chapterNumber: 10 },
    items: [
      card("kore", { target: "これ" }),
      card("pen", { target: "ペン" }),
      card("kore-pen", { target: "これはペンです" }),
      ...extra,
    ],
  });
}

test("untaught words: a deck-written sentence using a word no earlier card teaches is named", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeLessonOne(root);
    writeUnit(root, "epubs/book/chapter-1-extras", {
      meta: { chapterNumber: 10 },
      items: [
        card("tokei", { target: "これはとけいです", aiSuggested: true }),
        // The book printed this one, so the check leaves it alone.
        card("book-line", { target: "これはかばんです" }),
      ],
    });
    const found = findingsOf(root, "untaught-words");
    assert.equal(found.length, 1);
    assert.match(found[0], /chapter-1-extras: "これはとけいです"/);
    assert.match(found[0], /"とけい"/);
    assert.deepEqual(findingsOf(root, "untaught-words-glossed"), []);
  } finally {
    cleanup();
  }
});

test("untaught words: taught means taught earlier in the BOOK, not built earlier", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeLessonOne(root);
    // A supplement built late (folder 3) that the book prints BEFORE lesson 1 teaches とけい ...
    writeUnit(root, "epubs/book/chapter-3", {
      meta: { chapterNumber: 5 },
      items: [card("tokei-word", { target: "とけい" })],
    });
    // ... and one the book prints AFTER the addition's unit teaches かばん, which does not count.
    writeUnit(root, "epubs/book/chapter-2", {
      meta: { chapterNumber: 30 },
      items: [card("kaban-word", { target: "かばん" })],
    });
    writeUnit(root, "epubs/book/chapter-1-extras", {
      meta: { chapterNumber: 10 },
      items: [
        card("tokei", { target: "これはとけいです", addition: "class-notes" }),
        card("kaban", { target: "これはかばんです", addition: "class-notes" }),
      ],
    });
    const found = findingsOf(root, "untaught-words");
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0], /"これはかばんです"/);
    assert.match(found[0], /addition class-notes/);
  } finally {
    cleanup();
  }
});

test("untaught words: a word card teaches itself, and a polite past of a taught verb is taught", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeLessonOne(root, [card("ikimasu", { target: "いきます" })]);
    writeUnit(root, "epubs/book/chapter-1-extras", {
      meta: { chapterNumber: 10 },
      items: [
        card("tokei-word", { target: "とけい", aiSuggested: true }),
        card("ikimashita", { target: "いきました", aiSuggested: true }),
      ],
    });
    assert.deepEqual(findingsOf(root, "untaught-words"), []);
  } finally {
    cleanup();
  }
});

test("untaught words: a word the note glosses moves to the INFO glossed check", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeLessonOne(root);
    writeUnit(root, "epubs/book/chapter-1-extras", {
      meta: { chapterNumber: 10 },
      items: [
        card("tokei", {
          target: "これはとけいです",
          aiSuggested: true,
          note: 'とけい (tokei, "watch") is new here.',
        }),
      ],
    });
    assert.deepEqual(findingsOf(root, "untaught-words"), []);
    const glossed = findingsOf(root, "untaught-words-glossed");
    assert.equal(glossed.length, 1);
    assert.match(glossed[0], /"とけい"/);
    assert.match(glossed[0], /The note glosses it/);
  } finally {
    cleanup();
  }
});

test("untaught words: a verb with no card is named even when its kana sit inside an earlier word", () => {
  // Busy People Lesson 9: two class-notes sentences used おきます ("get up") with no card for it,
  // and containment passed them because おき is inside おおきい ("big"). Owner review, 2026-10-30.
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { chapterNumber: 10 },
      items: [
        card("ookii", { target: "おおきい" }),
        card("watashi", { target: "わたし" }),
        card("hachiji", { target: "はちじ" }),
      ],
    });
    writeUnit(root, "epubs/book/chapter-1-extras", {
      meta: { chapterNumber: 10 },
      items: [card("okimasu", { target: "わたしは、はちじにおきます", addition: "class-notes" })],
    });
    const found = findingsOf(root, "untaught-words");
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0], /"おきます"/);
  } finally {
    cleanup();
  }
});

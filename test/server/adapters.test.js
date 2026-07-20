import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { bookAdapter } from "../../src/server/adapters/book.js";
import { courseAdapter } from "../../src/server/adapters/course.js";
import { templateAdapter } from "../../src/server/adapters/template.js";
import { listAllDecks } from "../../src/server/adapters/index.js";

function cardsJson(meta, items) {
  return JSON.stringify({ meta, items });
}
function writeUnit(dir, meta, items, audioFiles = {}) {
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "cards.json"), cardsJson(meta, items));
  for (const [name, bytes] of Object.entries(audioFiles)) {
    writeFileSync(join(dir, "audio", name), bytes);
  }
}

// A fixture output/ tree: a book whose folder-seq is DELIBERATELY out of order vs chapterNumber, with
// one unbuilt chapter; a course; a template.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deck-dash-"));
  const book = join(root, "epubs", "mybook");
  mkdirSync(book, { recursive: true });
  writeFileSync(
    join(book, "book.json"),
    JSON.stringify({ title: "My Book", targetLanguage: "ja" }),
  );
  // chapter-0 has the HIGHER chapterNumber (2); chapter-1 the lower (1) — sort must reorder.
  writeUnit(
    join(book, "chapter-0"),
    { targetLanguage: "ja", chapterNumber: 2, chapterLabel: "Second" },
    [
      {
        id: "b",
        english: "two",
        target: "に",
        pronunciation: "ni",
        category: "Numbers",
        notes: null,
      },
    ],
  );
  writeUnit(
    join(book, "chapter-1"),
    { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "First" },
    [
      {
        id: "a",
        english: "one",
        target: "いち",
        pronunciation: "ichi",
        category: "Numbers",
        audio: "a.mp3",
      },
    ],
    { "a.mp3": Buffer.from("CLIP-A") },
  );
  // chapter-2 exists but is unbuilt (no cards.json) — must be skipped, not thrown.
  mkdirSync(join(book, "chapter-2"), { recursive: true });

  const course = join(root, "courses", "mycourse");
  mkdirSync(course, { recursive: true });
  writeFileSync(
    join(course, "course.json"),
    JSON.stringify({ name: "My Course", targetLanguage: "ja" }),
  );
  writeUnit(
    join(course, "lesson-0"),
    { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson 1" },
    [{ id: "c", english: "three", target: "さん", pronunciation: "san", category: "Numbers" }],
  );

  const tmpl = join(root, "templates", "nums", "ja");
  writeUnit(
    tmpl,
    { targetLanguage: "ja", sourceType: "template" },
    [
      {
        id: "z",
        english: "zero",
        target: "ゼロ",
        pronunciation: "zero",
        category: "Numbers",
        audio: "z.mp3",
      },
    ],
    { "z.mp3": Buffer.from("CLIP-Z") },
  );
  return root;
}

test("bookAdapter: lists the book, skips the unbuilt chapter, orders units by chapterNumber", () => {
  const root = fixture();
  try {
    const decks = bookAdapter.listDecks(root);
    assert.equal(decks.length, 1);
    assert.deepEqual(
      {
        type: decks[0].type,
        id: decks[0].id,
        title: decks[0].title,
        unitCount: decks[0].unitCount,
      },
      { type: "book", id: "mybook", title: "My Book", unitCount: 2 },
    );

    const deck = bookAdapter.loadDeck(root, "mybook");
    // sorted by chapterNumber: "First" (num 1, folder seq 1) before "Second" (num 2, folder seq 0)
    assert.deepEqual(
      deck.units.map((u) => u.label),
      ["First", "Second"],
    );
    assert.deepEqual(
      deck.units.map((u) => u.seq),
      [1, 0],
    );
    assert.equal(deck.units[0].cards[0].audio, "a.mp3");
    assert.equal(deck.units[0].cards[0].note, ""); // notes:null -> ""
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bookAdapter.resolveMedia: resolves a real clip, rejects unsafe unit/file/missing", () => {
  const root = fixture();
  try {
    // chapter-1 is folder seq 1; its audio lives there
    assert.ok(bookAdapter.resolveMedia(root, "mybook", "1", "a.mp3"));
    assert.equal(bookAdapter.resolveMedia(root, "mybook", "0", "a.mp3"), null); // seq 0 has no a.mp3
    assert.equal(bookAdapter.resolveMedia(root, "mybook", "1", "../secret"), null); // path traversal
    assert.equal(bookAdapter.resolveMedia(root, "mybook", "x", "a.mp3"), null); // non-numeric unit
    assert.equal(bookAdapter.resolveMedia(root, "mybook", "1", "missing.mp3"), null); // not present
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("courseAdapter lists and loads a course", () => {
  const root = fixture();
  try {
    const decks = courseAdapter.listDecks(root);
    assert.deepEqual(
      decks.map((d) => ({ type: d.type, id: d.id, title: d.title, unitCount: d.unitCount })),
      [{ type: "course", id: "mycourse", title: "My Course", unitCount: 1 }],
    );
    assert.equal(courseAdapter.loadDeck(root, "mycourse").units[0].label, "Lesson 1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("templateAdapter encodes id as name__lang and resolves its single unit + media", () => {
  const root = fixture();
  try {
    const decks = templateAdapter.listDecks(root);
    assert.equal(decks.length, 1);
    assert.equal(decks[0].id, "nums__ja");
    const deck = templateAdapter.loadDeck(root, "nums__ja");
    assert.equal(deck.units.length, 1);
    assert.equal(deck.units[0].cards[0].target, "ゼロ");
    assert.ok(templateAdapter.resolveMedia(root, "nums__ja", "0", "z.mp3"));
    assert.equal(templateAdapter.loadDeck(root, "no-such__ja"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("listAllDecks aggregates every format", () => {
  const root = fixture();
  try {
    const all = listAllDecks(root);
    assert.deepEqual(all.map((d) => d.type).sort(), ["book", "course", "template"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

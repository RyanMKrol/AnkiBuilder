import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import { buildCollection, buildMultiDeckCollection } from "../../src/deck/collection.js";

function withTempDb(bytes, fn) {
  const dir = mkdtempSync(join(tmpdir(), "collection-test-"));
  const dbPath = join(dir, "collection.anki2");
  writeFileSync(dbPath, bytes);
  const db = new DatabaseSync(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function card(id, english) {
  return { id, target: `${english}-target`, pronunciation: `${english}-pron`, english };
}

function cardsOf(...englishWords) {
  return { items: englishWords.map((w, i) => card(`id-${i}`, w)) };
}

test("buildCollection produces a single named deck (plus an empty Default)", () => {
  const bytes = buildCollection(cardsOf("Hello"), { deckName: "My Deck", now: 1_700_000_000_000 });

  withTempDb(bytes, (db) => {
    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    const names = Object.values(decks)
      .map((d) => d.name)
      .sort();
    assert.deepEqual(names, ["Default", "My Deck"]);
  });
});

test("buildMultiDeckCollection produces Default + one book deck + one sub-deck per chapter", () => {
  const chapterDecks = [
    { name: "Lesson 1: Meeting", cards: cardsOf("Hello") },
    { name: "Lesson 2: Possession", cards: cardsOf("Pen") },
    { name: "Lesson 3: Time", cards: cardsOf("Clock") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "Japanese for Busy People",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    const names = Object.values(decks)
      .map((d) => d.name)
      .sort();
    assert.deepEqual(names, [
      "Default",
      "Japanese for Busy People",
      "Japanese for Busy People::Lesson 1: Meeting",
      "Japanese for Busy People::Lesson 2: Possession",
      "Japanese for Busy People::Lesson 3: Time",
    ]);
  });
});

test("buildMultiDeckCollection assigns every card's did to its own chapter's sub-deck, never the parent/Default", () => {
  const chapterDecks = [
    { name: "Lesson 1", cards: cardsOf("Hello", "Goodbye") },
    { name: "Lesson 2", cards: cardsOf("Pen") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "Book",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    const idByName = Object.fromEntries(Object.values(decks).map((d) => [d.name, d.id]));
    const defaultId = idByName["Default"];
    const bookId = idByName["Book"];
    const lesson1Id = idByName["Book::Lesson 1"];
    const lesson2Id = idByName["Book::Lesson 2"];

    const notes = db.prepare("SELECT id, flds FROM notes ORDER BY id").all();
    const lesson1NoteIds = notes
      .filter((n) => n.flds.includes("Hello") || n.flds.includes("Goodbye"))
      .map((n) => n.id);
    const lesson2NoteIds = notes.filter((n) => n.flds.includes("Pen")).map((n) => n.id);

    const cardRows = db.prepare("SELECT nid, did FROM cards").all();
    for (const row of cardRows) {
      if (lesson1NoteIds.includes(row.nid)) {
        assert.equal(row.did, lesson1Id);
      } else if (lesson2NoteIds.includes(row.nid)) {
        assert.equal(row.did, lesson2Id);
      } else {
        assert.fail(`card for unexpected note id ${row.nid}`);
      }
      assert.notEqual(row.did, defaultId);
      assert.notEqual(row.did, bookId);
    }
  });
});

test("buildMultiDeckCollection never collides note/card ids across chapters, even though each chapter's own items restart at index 0", () => {
  const chapterDecks = [
    { name: "Lesson 1", cards: cardsOf("A", "B", "C") },
    { name: "Lesson 2", cards: cardsOf("D", "E", "F") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "Book",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const noteIds = db
      .prepare("SELECT id FROM notes")
      .all()
      .map((n) => n.id);
    const cardIds = db
      .prepare("SELECT id FROM cards")
      .all()
      .map((c) => c.id);
    assert.equal(new Set(noteIds).size, noteIds.length, "note ids must be unique");
    assert.equal(new Set(cardIds).size, cardIds.length, "card ids must be unique");
    assert.equal(noteIds.length, 6);
    assert.equal(cardIds.length, 6);
  });
});

test("buildMultiDeckCollection's card position/due increases monotonically across chapter boundaries", () => {
  const chapterDecks = [
    { name: "Lesson 1", cards: cardsOf("A", "B") },
    { name: "Lesson 2", cards: cardsOf("C", "D") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "Book",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const dues = db
      .prepare("SELECT due FROM cards ORDER BY id")
      .all()
      .map((c) => c.due);
    const sorted = [...dues].sort((a, b) => a - b);
    assert.deepEqual(dues, sorted, "due/position must increase monotonically insertion order");
    assert.equal(new Set(dues).size, dues.length, "every card gets a distinct position");
  });
});

test("buildMultiDeckCollection sanitizes a literal '::' in the book name or a chapter label", () => {
  const chapterDecks = [{ name: "Weird::Chapter", cards: cardsOf("A") }];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "My::Book",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    const names = Object.values(decks).map((d) => d.name);
    assert.ok(names.includes("My-Book"));
    assert.ok(names.includes("My-Book::Weird-Chapter"));
    assert.ok(!names.some((n) => n.includes("My::Book")));
  });
});

test("buildMultiDeckCollection's total card count is the sum of each chapter's items.length (one card per note)", () => {
  const chapterDecks = [
    { name: "Lesson 1", cards: cardsOf("A", "B", "C") },
    { name: "Lesson 2", cards: cardsOf("D") },
    { name: "Lesson 3", cards: cardsOf("E", "F") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "Book",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const cardCount = db.prepare("SELECT COUNT(*) as c FROM cards").get().c;
    assert.equal(cardCount, 3 + 1 + 2);
  });
});

test("buildCollection stores col.crt in epoch SECONDS, not milliseconds", () => {
  const now = 1_700_000_000_000; // a millisecond epoch timestamp
  const bytes = buildCollection(cardsOf("Hello"), { deckName: "My Deck", now });

  withTempDb(bytes, (db) => {
    const col = db.prepare("SELECT crt, mod, scm FROM col").get();
    assert.equal(col.crt, Math.floor(now / 1000), "crt must be seconds, not milliseconds");
    assert.equal(col.mod, now, "mod stays milliseconds");
    assert.equal(col.scm, now, "scm stays milliseconds");
  });
});

test("buildCollection stores model/deck/note/card mod fields in epoch SECONDS", () => {
  const now = 1_700_000_000_000;
  const bytes = buildCollection(cardsOf("Hello"), { deckName: "My Deck", now });
  const nowSeconds = Math.floor(now / 1000);

  withTempDb(bytes, (db) => {
    const models = JSON.parse(db.prepare("SELECT models FROM col").get().models);
    const model = Object.values(models)[0];
    assert.equal(model.mod, nowSeconds);

    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    for (const deck of Object.values(decks)) {
      assert.equal(deck.mod, nowSeconds, `deck "${deck.name}" mod must be seconds`);
    }

    const note = db.prepare("SELECT mod FROM notes LIMIT 1").get();
    assert.equal(note.mod, nowSeconds);

    const card = db.prepare("SELECT mod FROM cards LIMIT 1").get();
    assert.equal(card.mod, nowSeconds);
  });
});

test("buildMultiDeckCollection also stores every mod field in epoch SECONDS", () => {
  const now = 1_700_000_000_000;
  const nowSeconds = Math.floor(now / 1000);
  const chapterDecks = [{ name: "Lesson 1", cards: cardsOf("Hello") }];
  const bytes = buildMultiDeckCollection(chapterDecks, { bookName: "Book", now });

  withTempDb(bytes, (db) => {
    const col = db.prepare("SELECT crt FROM col").get();
    assert.equal(col.crt, nowSeconds);

    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    for (const deck of Object.values(decks)) {
      assert.equal(deck.mod, nowSeconds);
    }

    const note = db.prepare("SELECT mod FROM notes LIMIT 1").get();
    assert.equal(note.mod, nowSeconds);
    const card = db.prepare("SELECT mod FROM cards LIMIT 1").get();
    assert.equal(card.mod, nowSeconds);
  });
});

test("buildCollection keeps every note's csum within signed 32-bit range", () => {
  // Sort fields chosen to exercise many different SHA1 prefixes — a real regression
  // would only show up probabilistically, so use enough distinct inputs to make a
  // silent reintroduction very unlikely to slip through.
  const words = Array.from({ length: 50 }, (_, i) => `word-${i}-with-some-variety-${i * 7}`);
  const bytes = buildCollection(cardsOf(...words), { deckName: "Deck", now: 1_700_000_000_000 });

  withTempDb(bytes, (db) => {
    const notes = db.prepare("SELECT csum FROM notes").all();
    const I32_MAX = 2147483647;
    for (const note of notes) {
      assert.ok(note.csum >= 0, "csum must be non-negative");
      assert.ok(note.csum <= I32_MAX, `csum ${note.csum} exceeds signed 32-bit range`);
    }
  });
});

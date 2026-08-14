import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import {
  buildCollection,
  buildMultiDeckCollection,
  languageModelId,
  noteTypeSpec,
  FIELD_NAMES,
} from "../../src/deck/collection.js";

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
    // Each "Lesson N: Title" label groups under its own "Lesson N" deck (see deckPath.js), so a
    // lesson and its extras unit can sit together. The grouping decks hold no cards.
    assert.deepEqual(names, [
      "Default",
      "Japanese for Busy People",
      "Japanese for Busy People::Lesson 01",
      "Japanese for Busy People::Lesson 01::Meeting",
      "Japanese for Busy People::Lesson 02",
      "Japanese for Busy People::Lesson 02::Possession",
      "Japanese for Busy People::Lesson 03",
      "Japanese for Busy People::Lesson 03::Time",
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
    const lesson1Id = idByName["Book::Lesson 01"];
    const lesson2Id = idByName["Book::Lesson 02"];

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
    assert.equal(cardIds.length, 12);
  });
});

test("new-card positions interleave within a chapter, and chapters stay in book order", () => {
  // `due` on a new card is its place in the new-card queue. A note's two cards used to be written
  // back to back, so a fresh import introduced both directions of the same note in one session and
  // the second was answered from working memory. Within a chapter the Recognition cards now come
  // first and the Production cards after, which puts the chapter's whole width between siblings.
  const chapterDecks = [
    { name: "Lesson 1", cards: cardsOf("A", "B") },
    { name: "Lesson 2", cards: cardsOf("C", "D") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "Book",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const cards = db.prepare("SELECT id, nid, ord, did, due FROM cards ORDER BY id").all();
    const dues = cards.map((c) => c.due);
    assert.equal(new Set(dues).size, dues.length, "every card gets a distinct position");

    // Chapter blocks do not overlap, and the earlier chapter comes first.
    const byDeck = new Map();
    for (const card of cards) {
      const block = byDeck.get(card.did) ?? { min: Infinity, max: -Infinity };
      byDeck.set(card.did, {
        min: Math.min(block.min, card.due),
        max: Math.max(block.max, card.due),
      });
    }
    const blocks = [...byDeck.entries()].sort((a, b) => a[0] - b[0]).map(([, block]) => block);
    assert.equal(blocks.length, 2);
    assert.ok(blocks[0].max < blocks[1].min, "chapter 1's whole block precedes chapter 2's");

    // A note's two directions are two items apart, not adjacent.
    for (const [, pair] of groupBy(cards, (c) => c.nid)) {
      const [recognition, production] = pair.sort((a, b) => a.ord - b.ord);
      assert.equal(production.due - recognition.due, 2, "separated by the chapter's item count");
    }
  });
});

function groupBy(items, key) {
  const out = new Map();
  for (const item of items) {
    const k = key(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

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

test("buildMultiDeckCollection's total card count is the sum of each chapter's items.length * 2", () => {
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
    assert.equal(cardCount, (3 + 1 + 2) * 2);
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

test("note type is per-language: ja → 'AnkiBuilder ja', a stable id, and the embedded scoped font", () => {
  const bytes = buildCollection(
    { meta: { targetLanguage: "ja" }, items: cardsOf("Hello").items },
    { deckName: "D", now: 1_700_000_000_000 },
  );
  withTempDb(bytes, (db) => {
    const models = JSON.parse(db.prepare("SELECT models FROM col").get().models);
    const [id, m] = Object.entries(models)[0];
    assert.equal(m.name, "AnkiBuilder ja");
    assert.equal(Number(id), languageModelId("ja"));
    assert.match(m.css, /@font-face/);
    assert.match(m.css, /unicode-range/);
    const mids = db
      .prepare("SELECT DISTINCT mid FROM notes")
      .all()
      .map((r) => r.mid);
    assert.deepEqual(mids, [languageModelId("ja")], "notes point at the per-language note type");
    const conf = JSON.parse(db.prepare("SELECT conf FROM col").get().conf);
    assert.equal(conf.curModel, languageModelId("ja"));
  });
});

test("noteTypeSpec exposes the fields in FIELD_NAMES order", () => {
  assert.deepEqual(noteTypeSpec("ja").fields, FIELD_NAMES);
});

test("noteTypeSpec matches what buildCollection embeds — the two consumers can't drift", () => {
  // The .apkg builder and the AnkiConnect deliverer both derive from noteTypeSpec's constants, so the
  // model embedded in a built collection must equal the spec (name, css, templates, field order).
  for (const lang of ["ja", "es"]) {
    const spec = noteTypeSpec(lang);
    const bytes = buildCollection(
      { meta: { targetLanguage: lang }, items: cardsOf("Hello").items },
      { deckName: "D", now: 1_700_000_000_000 },
    );
    withTempDb(bytes, (db) => {
      const m = Object.values(JSON.parse(db.prepare("SELECT models FROM col").get().models))[0];
      assert.equal(m.name, spec.modelName, `${lang} model name`);
      assert.equal(m.css, spec.css, `${lang} css`);
      assert.deepEqual(
        m.tmpls.map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
        spec.templates,
        `${lang} templates`,
      );
      assert.deepEqual(
        m.flds.map((f) => f.name),
        spec.fields,
        `${lang} field order`,
      );
    });
  }
});

test("note type is per-language: a language with no font → no @font-face and a distinct id", () => {
  const bytes = buildCollection(
    { meta: { targetLanguage: "es" }, items: cardsOf("Hello").items },
    { deckName: "D", now: 1_700_000_000_000 },
  );
  withTempDb(bytes, (db) => {
    const m = Object.values(JSON.parse(db.prepare("SELECT models FROM col").get().models))[0];
    assert.equal(m.name, "AnkiBuilder es");
    assert.doesNotMatch(m.css, /@font-face/);
  });
  assert.notEqual(
    languageModelId("es"),
    languageModelId("ja"),
    "different languages don't collide",
  );
});

test("buildMultiDeckCollection groups a lesson and its extras under a card-less grouping deck", () => {
  const chapterDecks = [
    { name: "Frequently Used Expressions", cards: cardsOf("Hello") },
    { name: "Lesson 1: Meeting: Nice to Meet You", cards: cardsOf("Pen") },
    { name: "Lesson 1: Meeting: Nice to Meet You (Extras)", cards: cardsOf("Clock") },
  ];

  const bytes = buildMultiDeckCollection(chapterDecks, {
    bookName: "JBP",
    now: 1_700_000_000_000,
  });

  withTempDb(bytes, (db) => {
    const decks = JSON.parse(db.prepare("SELECT decks FROM col").get().decks);
    const names = Object.values(decks)
      .map((d) => d.name)
      .sort();
    assert.deepEqual(names, [
      "Default",
      "JBP",
      "JBP::Frequently Used Expressions",
      "JBP::Lesson 01",
      "JBP::Lesson 01::Meeting: Nice to Meet You",
      "JBP::Lesson 01::Meeting: Nice to Meet You (Extras)",
    ]);

    // THE invariant: a deck that holds cards must have no children, or Anki cannot study it alone.
    const counts = new Map();
    for (const d of Object.values(decks)) {
      counts.set(d.name, db.prepare("SELECT COUNT(*) AS n FROM cards WHERE did = ?").get(d.id).n);
    }
    for (const [name, n] of counts) {
      if (n === 0) continue;
      const kids = [...counts.keys()].filter((o) => o.startsWith(`${name}::`));
      assert.deepEqual(kids, [], `${name} holds ${n} cards and must not have children`);
    }
    // The grouping deck itself is empty.
    assert.equal(counts.get("JBP::Lesson 01"), 0);
  });
});

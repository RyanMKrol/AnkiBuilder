import test from "node:test";
import assert from "node:assert/strict";
import { syncDeckContent } from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

/**
 * Pins the SCOPE of the delivery note lookup, now that it is two queries rather than one.
 *
 * The durable `abid:` key is read BOOK-WIDE; the first-run Target/Target+English fingerprint indexes
 * are read per UNIT (which closes a cross-bind on 17 confirmed repeated targets).
 *
 * These tests exist because narrowing the WRONG half is unrecoverable. `abid:<card.id>` is the only
 * durable link between a card on disk and a note in Anki. Narrow that query to a unit's sub-deck and
 * a note the learner moved, or one that lives under a differently-named sub-deck, falls out of the
 * index — the deliverer then sees an unmatched card and ADDS it, so the learner gets a fresh
 * duplicate with no scheduling while the matured original sits there orphaned. Nothing reports it.
 *
 * They were written against the single-query version, before the split, so the split had a guard
 * already in place rather than one written by whoever performed it.
 */

const SPEC = noteTypeSpec("ja");

const note = (noteId, { target = "", english = "", tags = [] } = {}) => ({
  noteId,
  tags,
  fields: {
    Target: { value: target },
    English: { value: english },
    Pronunciation: { value: "" },
    Category: { value: "" },
    Hint: { value: "" },
    Note: { value: "" },
    Image: { value: "" },
    Audio: { value: "" },
    Reading: { value: "" },
    Scene: { value: "" },
  },
});

function client(notes, { queries = [] } = {}) {
  const calls = [];
  return {
    calls,
    queries,
    client: {
      findNotes: async (q) => {
        queries.push(q);
        return notes.map((n) => n.noteId);
      },
      notesInfo: async (ids) => notes.filter((n) => ids.includes(n.noteId)),
      updateNoteFields: async (id) => calls.push(["updateNoteFields", id]),
      addTags: async (ids, tags) => calls.push(["addTags", ids, tags]),
      addNote: async (n) => {
        calls.push(["addNote", n.tags]);
        return 500;
      },
      storeMediaFile: async () => calls.push(["storeMediaFile"]),
    },
  };
}

const deck = (units) => ({
  type: "epub",
  id: "book",
  ankiParent: "My Book",
  spec: SPEC,
  units,
});

test("the DURABLE lookup is the book-wide one; the fingerprint lookups are per unit", async () => {
  const queries = [];
  const { client: c } = client([], { queries });
  await syncDeckContent(
    c,
    deck([
      { ankiDeck: "My Book::Lesson 01::Meeting", audioDir: null, cards: [] },
      { ankiDeck: "My Book::Lesson 02::Shopping", audioDir: null, cards: [] },
    ]),
    true,
  );
  // The FIRST query is the abid index's, and it sees the whole book. Anything narrower here is the
  // unrecoverable mistake this file exists to catch.
  assert.match(queries[0], /deck:"My Book"/);
  assert.doesNotMatch(queries[0], /Lesson 01/);
  assert.doesNotMatch(queries[0], /Lesson 02/);
  // Then one fingerprint query per unit, each scoped to that unit's own sub-deck.
  assert.equal(queries.length, 3, "one book-wide query plus one per unit");
  assert.match(queries[1], /deck:"My Book::Lesson 01::Meeting"/);
  assert.match(queries[2], /deck:"My Book::Lesson 02::Shopping"/);
});

test("a repeated target in another unit is NOT adopted by this unit's card", async () => {
  // The cross-bind the split closes: 17 targets repeat across this book's units, and a book-wide
  // fingerprint index let a unit's card claim another unit's note by spelling alone — silently
  // rebinding two units' cards to each other's notes on the first run.
  const notes = [
    note(1, { target: "はい", english: "Yes" }), // lives in Lesson 01
    note(2, { target: "はい", english: "Yes" }), // lives in Lesson 02
  ];
  const byDeck = {
    'deck:"My Book"': [1, 2],
    'deck:"My Book::Lesson 01"': [1],
    'deck:"My Book::Lesson 02"': [2],
  };
  const calls = [];
  const c = {
    findNotes: async (q) => byDeck[q.split(" note:")[0]] ?? [],
    notesInfo: async (ids) => notes.filter((n) => ids.includes(n.noteId)),
    updateNoteFields: async (id) => calls.push(["updateNoteFields", id]),
    addTags: async (ids, tags) => calls.push(["addTags", ids, tags]),
    addNote: async () => calls.push(["addNote"]),
    storeMediaFile: async () => {},
  };

  const report = await syncDeckContent(
    c,
    deck([
      {
        ankiDeck: "My Book::Lesson 01",
        audioDir: null,
        cards: [{ id: "yes-1", target: "はい", english: "Yes", note: "one" }],
      },
      {
        ankiDeck: "My Book::Lesson 02",
        audioDir: null,
        cards: [{ id: "yes-2", target: "はい", english: "Yes", note: "two" }],
      },
    ]),
    false,
  );

  assert.equal(report.added, 0);
  assert.equal(report.updated, 2, "each unit adopted the note in its OWN deck");
  assert.deepEqual(
    calls.filter((c) => c[0] === "addTags").map((c) => [c[1][0], c[2]]),
    [
      [1, "abid:yes-1"],
      [2, "abid:yes-2"],
    ],
  );
});

test("an abid-tagged note is matched even when it now lives under a DIFFERENT unit's sub-deck", async () => {
  // The learner moved the note, or the sub-deck was renamed. The book-wide query still sees it, so
  // the card updates in place. Narrow the abid half and this becomes an addNote: a duplicate with
  // fresh scheduling, beside a matured orphan.
  const notes = [note(42, { target: "ねこ", english: "Cat", tags: ["abid:cat"] })];
  const { client: c, calls } = client(notes);
  const report = await syncDeckContent(
    c,
    deck([
      {
        ankiDeck: "My Book::Lesson 07::Animals",
        audioDir: null,
        cards: [{ id: "cat", target: "ねこ", english: "Cat", note: "a pet" }],
      },
    ]),
    false,
  );
  assert.equal(report.added, 0, "never re-added");
  assert.equal(report.updated, 1);
  assert.ok(!calls.some((c) => c[0] === "addNote"));
});

test("the abid index spans units, so one unit's card can match a note tagged in another", async () => {
  const notes = [
    note(1, { target: "いぬ", english: "Dog", tags: ["abid:dog"] }),
    note(2, { target: "ねこ", english: "Cat", tags: ["abid:cat"] }),
  ];
  const { client: c } = client(notes);
  const report = await syncDeckContent(
    c,
    deck([
      {
        ankiDeck: "My Book::Lesson 01",
        audioDir: null,
        cards: [{ id: "dog", target: "いぬ", english: "Dog", note: "x" }],
      },
      {
        ankiDeck: "My Book::Lesson 02",
        audioDir: null,
        cards: [{ id: "cat", target: "ねこ", english: "Cat", note: "y" }],
      },
    ]),
    false,
  );
  assert.equal(report.updated, 2);
  assert.equal(report.added, 0);
});

test("a corpus card whose note vanished from the book is ORPHANED, never silently re-added", async () => {
  // The other half of the same invariant. An abid-tagged note that no corpus card claims is a
  // report line for a human; a corpus card whose note is gone must not turn into a fresh add
  // without anyone seeing it.
  const notes = [note(9, { target: "とり", english: "Bird", tags: ["abid:gone"] })];
  const { client: c } = client(notes);
  const report = await syncDeckContent(
    c,
    deck([{ ankiDeck: "My Book::Lesson 01", audioDir: null, cards: [] }]),
    true,
  );
  assert.deepEqual(
    report.orphaned.map((o) => o.card),
    ["gone"],
  );
});

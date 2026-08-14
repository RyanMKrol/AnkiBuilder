import test from "node:test";
import assert from "node:assert/strict";
import { syncDeckContent } from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

/**
 * Pins the SCOPE of the delivery note lookup, ahead of the change that splits it.
 *
 * The delivered-note index is built from ONE query, and the plan splits it in two: the durable
 * `abid:` key stays BOOK-WIDE, while the first-run Target/Target+English fingerprint indexes narrow
 * to the unit being delivered (which closes a cross-bind on 17 confirmed repeated targets).
 *
 * These tests exist because narrowing the WRONG half is unrecoverable. `abid:<card.id>` is the only
 * durable link between a card on disk and a note in Anki. Narrow that query to a unit's sub-deck and
 * a note the learner moved, or one that lives under a differently-named sub-deck, falls out of the
 * index — the deliverer then sees an unmatched card and ADDS it, so the learner gets a fresh
 * duplicate with no scheduling while the matured original sits there orphaned. Nothing reports it.
 *
 * Written now, against today's single book-wide query, so the split has a guard already in place
 * rather than one written by whoever performs it.
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

test("the note lookup is scoped to the BOOK's parent deck, never to one unit's sub-deck", async () => {
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
  assert.equal(queries.length, 1, "one query for the whole delivery, not one per unit");
  assert.match(queries[0], /deck:"My Book"/);
  assert.doesNotMatch(queries[0], /Lesson 01/);
  assert.doesNotMatch(queries[0], /Lesson 02/);
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

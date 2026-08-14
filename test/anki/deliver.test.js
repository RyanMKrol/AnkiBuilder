import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  syncStructure,
  syncDeckContent,
  ensureDecks,
  removeLegacyDeckShells,
  assertUniqueCardIds,
  pruneBackups,
} from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

const SPEC = noteTypeSpec("ja");
const templatesAsLive = (spec) =>
  Object.fromEntries(spec.templates.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }]));

// Stateful fake AnkiConnect client: reads reflect mutable model state; writes are recorded (and mutate
// state so idempotency is observable). `notes` are notesInfo-shaped records.
function fakeClient({
  models = [SPEC.modelName],
  fields = [...SPEC.fields],
  templates = templatesAsLive(SPEC),
  css = SPEC.css,
  notes = [],
} = {}) {
  const calls = [];
  const state = { fields: [...fields], templates: { ...templates }, css };
  const write = (name, ...args) => calls.push([name, ...args]);
  return {
    calls,
    state,
    client: {
      version: async () => 6,
      modelNames: async () => models,
      modelFieldNames: async () => [...state.fields],
      modelFieldAdd: async (_m, f, i) => {
        write("modelFieldAdd", f, i);
        state.fields.splice(i, 0, f);
      },
      modelFieldReposition: async (_m, f, i) => {
        write("modelFieldReposition", f, i);
        state.fields.splice(state.fields.indexOf(f), 1);
        state.fields.splice(i, 0, f);
      },
      modelTemplates: async () => state.templates,
      updateModelTemplates: async (_m, t) => {
        write("updateModelTemplates");
        state.templates = { ...t };
      },
      modelStyling: async () => ({ css: state.css }),
      updateModelStyling: async (_m, c) => {
        write("updateModelStyling");
        state.css = c;
      },
      createModel: async (p) => write("createModel", p.modelName),
      // Reads the model-change guard uses to measure the blast radius before a template/CSS write.
      findCards: async () => [11, 22],
      getDecks: async () => ({ "Book::Lesson 01": [11], "Course::Lesson 02": [22] }),
      findNotes: async () => notes.map((n) => n.noteId),
      notesInfo: async (ids) => notes.filter((n) => ids.includes(n.noteId)),
      updateNoteFields: async (id) => write("updateNoteFields", id),
      addTags: async (ids, tags) => write("addTags", ids, tags),
      addNote: async (note) => {
        write("addNote", note.deckName, note.tags);
        return 9000 + calls.length;
      },
      storeMediaFile: async (p) => write("storeMediaFile", p.filename),
      exportPackage: async (d) => write("exportPackage", d),
    },
  };
}

const names = (calls) => calls.map((c) => c[0]);

test("syncStructure adds the missing Note field, updates templates + CSS", async () => {
  const { client, calls, state } = fakeClient({
    fields: ["Target", "Pronunciation", "English", "Category", "Hint", "Image", "Audio"],
    templates: {
      Recognition: { Front: "old", Back: "old" },
      Production: { Front: "o", Back: "o" },
    },
    css: ".card{}",
  });
  const out = await syncStructure(client, SPEC, false, { allowModelChange: true });
  assert.deepEqual(out.addedFields, ["Note", "Reading", "Scene"]);
  assert.equal(out.templates, true);
  assert.equal(out.css, true);
  assert.deepEqual(state.fields, SPEC.fields, "Note landed at index 5 → order matches spec");
  assert.ok(!names(calls).includes("modelFieldReposition"), "clean insert needs no reposition");
  assert.deepEqual(names(calls).sort(), [
    "modelFieldAdd",
    "modelFieldAdd",
    "modelFieldAdd",
    "updateModelStyling",
    "updateModelTemplates",
  ]);
});

test("syncStructure is a no-op when the model already matches the spec", async () => {
  const { client, calls } = fakeClient();
  const out = await syncStructure(client, SPEC, false);
  assert.deepEqual(out, {
    model: SPEC.modelName,
    createModel: false,
    addedFields: [],
    templates: false,
    css: false,
    modelChange: null,
  });
  assert.equal(calls.length, 0, "no writes on a matched model");
});

test("syncStructure dry run writes nothing but reports the plan", async () => {
  const { client, calls } = fakeClient({
    fields: ["Target", "Pronunciation", "English", "Category", "Hint", "Image", "Audio"],
    css: ".card{}",
  });
  const out = await syncStructure(client, SPEC, true);
  assert.deepEqual(out.addedFields, ["Note", "Reading", "Scene"]);
  assert.equal(out.css, true);
  assert.equal(calls.length, 0, "dry = no writes");
});

test("syncStructure creates the model when absent", async () => {
  const { client, calls } = fakeClient({ models: [] });
  const out = await syncStructure(client, SPEC, false);
  assert.equal(out.createModel, true);
  assert.deepEqual(names(calls), ["createModel"]);
});

// Build a notesInfo-shaped record.
const note = (noteId, { target = "", english = "", note: nt = "", tags = [] } = {}) => ({
  noteId,
  tags,
  fields: {
    Target: { value: target },
    Pronunciation: { value: "" },
    English: { value: english },
    Category: { value: "" },
    Hint: { value: "" },
    Note: { value: nt },
    Image: { value: "" },
    Audio: { value: "" },
  },
});

function deckWith(cards) {
  return {
    type: "course",
    id: "c",
    ankiParent: "Course",
    spec: SPEC,
    units: [{ ankiDeck: "Course::L1", audioDir: null, cards }],
  };
}

test("syncDeckContent: update-by-tag, fingerprint-bootstrap+tag, add-new, skip-noop, ambiguous, orphan", async () => {
  const notes = [
    note(1, { target: "こんにちは", english: "Hello", note: "", tags: ["abid:a"] }), // A: differs → update
    note(2, { target: "さようなら", english: "Goodbye" }), // B: no tag → fingerprint → update+tag
    note(3, { target: "はい", english: "Yes", tags: ["abid:d"] }), // D: identical → skip
    note(7, { target: "みず", english: "Water" }), // E: fingerprint dup #1
    note(8, { target: "みず", english: "Water" }), // E: fingerprint dup #2 → ambiguous
    note(9, { target: "ねこ", english: "Cat", tags: ["abid:z"] }), // orphan (no corpus card z)
  ];
  const { client, calls } = fakeClient({ notes });
  const deck = deckWith([
    { id: "a", target: "こんにちは", english: "Hello", note: "A greeting" },
    { id: "b", target: "さようなら", english: "Goodbye", note: "A farewell" },
    { id: "c", target: "ありがとう", english: "Thanks" }, // new → add
    { id: "d", target: "はい", english: "Yes" }, // identical → skip
    { id: "e", target: "みず", english: "Water" }, // fingerprint matches 2 → ambiguous
  ]);

  const r = await syncDeckContent(client, deck, false);
  assert.equal(r.updated, 2, "A (by tag) + B (by fingerprint)");
  assert.equal(r.added, 1, "C");
  assert.equal(r.skipped, 1, "D");
  assert.equal(r.tagged, 1, "B stamped with abid");
  assert.deepEqual(
    r.ambiguous.map((x) => x.card),
    ["e"],
  );
  assert.deepEqual(
    r.orphaned.map((x) => x.card),
    ["z"],
  );
  assert.deepEqual(names(calls).sort(), [
    "addNote",
    "addTags",
    "updateNoteFields",
    "updateNoteFields",
  ]);
  const addTags = calls.find((c) => c[0] === "addTags");
  assert.deepEqual(addTags.slice(1), [[2], "abid:b"], "the fingerprint match is tagged");
  const addNote = calls.find((c) => c[0] === "addNote");
  assert.deepEqual(addNote.slice(1), ["Course::L1", ["abid:c"]]);
});

test("pruneBackups keeps the newest N plus one snapshot per older week", async () => {
  const root = mkdtempSync(join(tmpdir(), "backup-prune-"));
  try {
    // Three same-week older snapshots, one much older, plus four recent ones. keepRecent=3.
    const stamps = [
      "2026-07-28T10-00-00-000Z",
      "2026-07-27T10-00-00-000Z",
      "2026-07-26T10-00-00-000Z",
      "2026-07-20T10-00-00-000Z", // older: newest of its week → kept
      "2026-07-19T10-00-00-000Z", // same week → pruned
      "2026-07-18T09-00-00-000Z", // same week → pruned
      "2026-06-01T10-00-00-000Z", // its own week → kept
    ];
    for (const stamp of stamps) {
      mkdirSync(join(root, stamp), { recursive: true });
      writeFileSync(join(root, stamp, "deck.apkg"), "bytes");
    }
    mkdirSync(join(root, "not-a-snapshot"));

    const { deleted } = pruneBackups(root, { keepRecent: 3 });

    assert.deepEqual(deleted.sort(), ["2026-07-18T09-00-00-000Z", "2026-07-19T10-00-00-000Z"]);
    assert.ok(existsSync(join(root, "2026-07-20T10-00-00-000Z")));
    assert.ok(existsSync(join(root, "2026-06-01T10-00-00-000Z")));
    assert.ok(existsSync(join(root, "not-a-snapshot")), "non-snapshot dirs are never touched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("syncDeckContent escapes quotes and wildcards in the findNotes query", async () => {
  const queries = [];
  const { client } = fakeClient({ notes: [] });
  const rawFindNotes = client.findNotes;
  client.findNotes = async (query) => {
    queries.push(query);
    return rawFindNotes(query);
  };
  const deck = deckWith([{ id: "a", target: "あ", english: "Ah" }]);
  deck.ankiParent = 'My "Best" Book *2*';
  await syncDeckContent(client, deck, true);

  assert.equal(queries.length, 1);
  // `"` would end the quoted term early; `*`/`_` are wildcards even inside quotes.
  assert.match(queries[0], /deck:"My \\"Best\\" Book \\\*2\\\*"/);
});

test("syncDeckContent: a Target present in Anki is never added as a duplicate", async () => {
  // Two same-Target notes whose glosses were edited since import (parenthetical moved to the hint).
  // The corpus glosses are prefixes of the Anki glosses → each resolves uniquely, none is duplicated.
  const notes = [
    note(10, { target: "しつれいします", english: "Excuse me. (said when entering a room)" }),
    note(11, { target: "しつれいします", english: "Good-bye. (said on formal occasions)" }),
  ];
  const { client, calls } = fakeClient({ notes });
  const deck = deckWith([
    { id: "enter", target: "しつれいします", english: "Excuse me.", hint: "entering a room" },
    { id: "leave", target: "しつれいします", english: "Good-bye.", hint: "formal occasions" },
  ]);
  const r = await syncDeckContent(client, deck, false);
  assert.equal(r.added, 0, "no duplicates added for a Target already in Anki");
  assert.equal(r.updated, 2, "both resolved by prefix and updated");
  assert.equal(r.tagged, 2, "both stamped with their abid");
  assert.ok(!names(calls).includes("addNote"));
});

test("syncDeckContent: unresolvable same-Target collision is ambiguous, not added", async () => {
  const notes = [
    note(20, { target: "ひゃく", english: "100" }),
    note(21, { target: "ひゃく", english: "100" }),
  ];
  const { client, calls } = fakeClient({ notes });
  const deck = deckWith([{ id: "num-100", target: "ひゃく", english: "100" }]);
  const r = await syncDeckContent(client, deck, false);
  assert.equal(r.added, 0);
  assert.deepEqual(
    r.ambiguous.map((x) => x.card),
    ["num-100"],
  );
  assert.equal(calls.length, 0, "nothing written for an ambiguous card");
});

test("syncDeckContent dry run writes nothing", async () => {
  const notes = [note(1, { target: "こんにちは", english: "Hello", tags: ["abid:a"] })];
  const { client, calls } = fakeClient({ notes });
  const deck = deckWith([{ id: "a", target: "こんにちは", english: "Hello", note: "changed" }]);
  const r = await syncDeckContent(client, deck, true);
  assert.equal(r.updated, 1);
  assert.equal(calls.length, 0, "dry = no writes");
});

// addNote does not create its target deck — it fails with "deck was not found". Every lesson delivered
// before this landed in a deck an earlier .apkg import had already created, so the gap only appeared
// the first time a genuinely NEW lesson went through Deliver rather than a manual import.
test("ensureDecks creates only the sub-decks Anki is missing", async () => {
  const created = [];
  const client = {
    deckNames: async () => ["Book", "Book::Lesson 01"],
    createDeck: async (name) => created.push(name),
  };
  const decks = [
    {
      units: [
        { ankiDeck: "Book::Lesson 01" },
        { ankiDeck: "Book::Lesson 02" },
        { ankiDeck: "Book::Lesson 02" },
      ],
    },
  ];

  const missing = await ensureDecks(client, decks, false);
  assert.deepEqual(
    missing,
    ["Book::Lesson 02"],
    "existing decks are left alone, duplicates collapsed",
  );
  assert.deepEqual(created, ["Book::Lesson 02"]);
});

test("ensureDecks reports but does not create on a dry run", async () => {
  const created = [];
  const client = {
    deckNames: async () => ["Book"],
    createDeck: async (name) => created.push(name),
  };
  const missing = await ensureDecks(client, [{ units: [{ ankiDeck: "Book::Lesson 08" }] }], true);
  assert.deepEqual(missing, ["Book::Lesson 08"]);
  assert.deepEqual(created, [], "a dry run performs only reads");
});

// `abid:<card.id>` is the note key deck-wide, so a repeated id maps two cards onto ONE note and the
// later one silently wins. Refusing is the only safe move: whether the pair is one card taught twice
// or two cards that collided is a judgment about the source, not something the code can infer.
test("assertUniqueCardIds refuses a deck whose card ids repeat across units", () => {
  const deck = {
    type: "book",
    id: "b",
    units: [
      { ankiDeck: "Book::Lesson 06", cards: [{ id: "ni-particle" }, { id: "kara-particle" }] },
      { ankiDeck: "Book::Lesson 07", cards: [{ id: "ni-particle" }] },
    ],
  };
  assert.throws(
    () => assertUniqueCardIds(deck),
    (e) => {
      assert.match(e.message, /duplicate card ids/);
      assert.match(e.message, /ni-particle \(Book::Lesson 06, Book::Lesson 07\)/);
      // Only the repeated id is named.
      assert.doesNotMatch(e.message, /kara-particle/);
      return true;
    },
  );
});

test("assertUniqueCardIds passes a deck with distinct ids", () => {
  const deck = {
    type: "book",
    id: "b",
    units: [
      { ankiDeck: "Book::Lesson 06", cards: [{ id: "ni-particle" }] },
      { ankiDeck: "Book::Lesson 07", cards: [{ id: "ni-particle-time" }] },
    ],
  };
  assert.doesNotThrow(() => assertUniqueCardIds(deck));
});

test("syncDeckContent refuses before touching Anki when ids repeat", async () => {
  const deck = deckWith([{ id: "dup" }, { id: "dup" }]);
  const calls = [];
  const client = new Proxy(
    {},
    {
      get: (_t, name) => () => (calls.push(name), []),
    },
  );
  await assert.rejects(() => syncDeckContent(client, deck, true), /duplicate card ids/);
  assert.deepEqual(calls, []); // nothing was asked of Anki
});

test("resolveDecks groups a lesson and its extras under the same grouping deck", async () => {
  const { resolveDecks } = await import("../../src/anki/deliver.js");
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");

  const root = mkdtempSync(join(tmpdir(), "deliver-extras-"));
  try {
    const bookDir = join(root, "epubs", "bk");
    mkdirSync(bookDir, { recursive: true });
    writeFileSync(
      join(bookDir, "book.json"),
      JSON.stringify({ title: "Bk", slug: "bk", epubHash: null, targetLanguage: "ja" }),
    );
    const unit = (name, meta, id) => {
      mkdirSync(join(bookDir, name), { recursive: true });
      writeFileSync(
        join(bookDir, name, "cards.json"),
        JSON.stringify({
          meta: { done: true, targetLanguage: "ja", ...meta },
          items: [
            {
              id,
              english: "One",
              target: "\u3044\u3061",
              pronunciation: "ichi",
              category: "Numbers",
            },
          ],
        }),
      );
    };
    unit("chapter-0", { chapterNumber: 1, chapterLabel: "Lesson 1: Meeting" }, "a");
    unit(
      "chapter-0-extras",
      {
        chapterNumber: 1,
        chapterLabel: "Lesson 1: Meeting (Extras)",
        baseChapterLabel: "Lesson 1: Meeting",
      },
      "b",
    );

    const decks = resolveDecks(root, [{ type: "book", id: "bk" }]);
    const names = decks[0].units.map((u) => u.ankiDeck);
    assert.deepEqual(
      names.map((n) => n.split("::").slice(1).join("::")),
      ["Lesson 01::Meeting", "Lesson 01::Meeting (Extras)"],
    );
    // Both units are LEAVES: neither is a prefix of the other, so neither can swallow the other.
    for (const a of names) for (const b of names) assert.ok(a === b || !b.startsWith(`${a}::`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("removeLegacyDeckShells deletes only empty, unmanaged, legacy-named decks", async () => {
  const existing = [
    "Book",
    "Book::Lesson 05",
    "Book::Lesson 05::Shopping (2)", // managed (grouped) — holds the real cards
    "Book::Lesson 5: Shopping (2)", // legacy flat shell — empty
    "Book::Lesson 5: Shopping (2)::Extras", // oldest-scheme child — empty
    "Book::Lesson 6: Going Places", // legacy shell that somehow still holds cards
    "Book::Frequently Used Expressions", // ungrouped label — flat IS the real deck
  ];
  const deleted = [];
  const queries = [];
  const client = {
    deckNames: async () => existing,
    findCards: async (query) => {
      queries.push(query);
      return query.includes("Lesson 6") ? [111] : [];
    },
    invoke: async (action, params) => {
      assert.equal(action, "deleteDecks");
      assert.equal(params.cardsToo, true);
      deleted.push(...params.decks);
    },
  };
  const decks = [
    {
      ankiParent: "Book",
      units: [
        { ankiDeck: "Book::Lesson 05::Shopping (2)", label: "Lesson 5: Shopping (2)" },
        { ankiDeck: "Book::Lesson 06::Going Places", label: "Lesson 6: Going Places" },
        {
          ankiDeck: "Book::Frequently Used Expressions",
          label: "Frequently Used Expressions",
        },
      ],
    },
  ];

  const logs = [];
  const removed = await removeLegacyDeckShells(client, decks, { log: (m) => logs.push(m) });

  // Child shell first, then the flat shell; the card-holding Lesson 6 shell is left alone,
  // and the ungrouped-label deck is never treated as legacy.
  assert.deepEqual(removed, [
    "Book::Lesson 5: Shopping (2)::Extras",
    "Book::Lesson 5: Shopping (2)",
  ]);
  assert.deepEqual(deleted, removed);
  assert.ok(logs.some((m) => m.includes("still holds 1 card(s)")));
  // Emptiness was actually checked, with the deck name escaped into the query.
  assert.ok(queries.every((q) => q.startsWith('deck:"')));
});

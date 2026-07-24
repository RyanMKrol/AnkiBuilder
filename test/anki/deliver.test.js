import test from "node:test";
import assert from "node:assert";
import { syncStructure, syncDeckContent } from "../../src/anki/deliver.js";
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
  const out = await syncStructure(client, SPEC, false);
  assert.deepEqual(out.addedFields, ["Note"]);
  assert.equal(out.templates, true);
  assert.equal(out.css, true);
  assert.deepEqual(state.fields, SPEC.fields, "Note landed at index 5 → order matches spec");
  assert.ok(!names(calls).includes("modelFieldReposition"), "clean insert needs no reposition");
  assert.deepEqual(names(calls).sort(), [
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
  });
  assert.equal(calls.length, 0, "no writes on a matched model");
});

test("syncStructure dry run writes nothing but reports the plan", async () => {
  const { client, calls } = fakeClient({
    fields: ["Target", "Pronunciation", "English", "Category", "Hint", "Image", "Audio"],
    css: ".card{}",
  });
  const out = await syncStructure(client, SPEC, true);
  assert.deepEqual(out.addedFields, ["Note"]);
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

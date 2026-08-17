import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deliverToAnki } from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

const SPEC = noteTypeSpec("ja");

// A minimal on-disk course with one done+reviewed lesson, so deliverToAnki's real deck resolution runs.
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "deliver-sync-"));
  const lesson = join(root, "courses", "my-course", "lesson-0");
  mkdirSync(lesson, { recursive: true });
  writeFileSync(
    join(root, "courses", "my-course", "course.json"),
    JSON.stringify({ name: "My Course", targetLanguage: "ja" }),
  );
  const cards = {
    meta: {
      targetLanguage: "ja",
      sourceType: "manual",
      reviewed: true,
      chapterNumber: 1,
      chapterLabel: "Lesson 1",
      courseSlug: "my-course",
      done: true,
    },
    items: [{ id: "cat", target: "猫", english: "Cat", category: "Animals" }],
  };
  writeFileSync(join(lesson, "cards.json"), JSON.stringify(cards));
  writeFileSync(join(lesson, "corpus.json"), JSON.stringify(cards));
  return root;
}

// Fake client that records the ORDER of every call and starts from a note type missing the Note field
// (so a schema change is planned). findNotes returns nothing → the one card is "added".
function orderingClient() {
  const calls = [];
  const fields = ["Target", "Pronunciation", "English", "Category", "Hint", "Image", "Audio"];
  const rec = (name, ret) => {
    calls.push(name);
    return ret;
  };
  return {
    calls,
    client: {
      version: async () => rec("version", 6),
      sync: async () => rec("sync"),
      exportPackage: async () => rec("exportPackage", true),
      deckNames: async () => rec("deckNames", []),
      createDeck: async (name) => rec("createDeck", name),
      modelNames: async () => rec("modelNames", [SPEC.modelName]),
      modelFieldNames: async () => rec("modelFieldNames", [...fields]),
      modelFieldAdd: async (_m, f, i) => {
        rec("modelFieldAdd");
        fields.splice(i, 0, f);
      },
      modelFieldReposition: async () => rec("modelFieldReposition"),
      // Both template rows exist and both are stale — a template EDIT. (A live note type MISSING a
      // row is a different case entirely: the deliver refuses it, because AnkiConnect cannot add
      // one. See test/anki/templateAdd.test.js.)
      modelTemplates: async () =>
        rec("modelTemplates", {
          Recognition: { Front: "x", Back: "x" },
          Production: { Front: "x", Back: "x" },
        }),
      updateModelTemplates: async () => rec("updateModelTemplates"),
      modelStyling: async () => rec("modelStyling", { css: "old" }),
      updateModelStyling: async () => rec("updateModelStyling"),
      findCards: async () => rec("findCards", [1, 2, 3]),
      getDecks: async () => rec("getDecks", { "My Course::Lesson 01": [1, 2, 3] }),
      findNotes: async () => rec("findNotes", []),
      notesInfo: async () => rec("notesInfo", []),
      addNote: async () => rec("addNote", 1),
      addTags: async () => rec("addTags"),
      updateNoteFields: async () => rec("updateNoteFields"),
      storeMediaFile: async () => rec("storeMediaFile"),
    },
  };
}

test("deliverToAnki syncs before backup and after content, and flags the schema change", async () => {
  const root = makeFixture();
  try {
    const { client, calls } = orderingClient();
    const report = await deliverToAnki(root, "all", {
      client,
      dry: false,
      // This fixture starts from a note type whose templates and CSS differ from the spec, so the
      // model-change guard applies. These tests are about sync ORDER, not about consent.
      allowModelChange: true,
      now: () => 0,
      backupRoot: join(root, "backups"),
    });

    const firstSync = calls.indexOf("sync");
    const lastSync = calls.lastIndexOf("sync");
    const backup = calls.indexOf("exportPackage");
    const content = calls.indexOf("addNote");
    assert.ok(firstSync !== -1 && lastSync !== firstSync, "syncs at both ends");
    assert.ok(firstSync < backup, "sync-before precedes the backup");
    assert.ok(backup < content, "backup precedes content");
    assert.ok(content < lastSync, "sync-after follows content");

    assert.equal(report.syncedBefore, true);
    assert.equal(report.syncedAfter, true);
    assert.equal(report.schemaChanged, true, "adding the Note field is a schema change");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a template/CSS EDIT is not a schema change, so no Upload click is claimed", async () => {
  // Measured against the live collection on 2026-08-17: a delivery that rewrote both templates and the
  // whole stylesheet synced incrementally and Anki never showed its Upload/Download dialog. Only ADDING
  // a field or a template reshapes existing notes and forces the full sync. This asserts the narrower
  // rule, because the previous one told the owner to click a button that never appeared.
  const root = makeFixture();
  try {
    const { client } = orderingClient();
    // Start from a note type that already has every field, so the only structural work is the stale
    // template HTML and the stale CSS the fake reports.
    client.modelFieldNames = async () => [...SPEC.fields];
    const report = await deliverToAnki(root, "all", { client, dry: true, now: () => 0 });
    const structure = report.structure[0];
    assert.deepEqual(structure.addedFields, [], "no field was added");
    assert.deepEqual(structure.addedTemplates, [], "no template was added");
    assert.ok(structure.templates || structure.css, "the templates or CSS did need rewriting");
    assert.equal(report.schemaChanged, false, "an edit must not claim a full sync is needed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverToAnki dry run does not sync (but still detects the schema change)", async () => {
  const root = makeFixture();
  try {
    const { client, calls } = orderingClient();
    const report = await deliverToAnki(root, "all", { client, dry: true, now: () => 0 });
    assert.ok(!calls.includes("sync"), "no sync on a dry run");
    assert.ok(!calls.includes("exportPackage"), "no backup on a dry run");
    assert.equal(report.syncedBefore, null);
    assert.equal(report.schemaChanged, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deliverToAnki honours sync:false", async () => {
  const root = makeFixture();
  try {
    const { client, calls } = orderingClient();
    const report = await deliverToAnki(root, "all", {
      client,
      dry: false,
      sync: false,
      allowModelChange: true,
      now: () => 0,
      backupRoot: join(root, "backups"),
    });
    assert.ok(!calls.includes("sync"), "sync suppressed");
    assert.ok(calls.includes("exportPackage"), "delivery still runs (backup taken)");
    assert.equal(report.syncedBefore, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

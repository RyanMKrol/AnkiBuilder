import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { deliverToAnki, syncDeckContent, DEFAULT_MAX_ADDS } from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

/**
 * The guards on the largest unbounded-damage path in the delivery layer:
 *
 *   - the RENAME guard (marker present, lookup finds nothing);
 *   - the fail-closed BASELINE (previously-delivered cards that no longer resolve), and its
 *     bootstrap rule;
 *   - the ADD CEILING;
 *   - the backup's falsy `exportPackage` result;
 *   - the marker write, which records the baseline and must fail loudly without throwing.
 */

const SPEC = noteTypeSpec("ja");

const note = (noteId, { target = "", english = "", tags = [] } = {}) => ({
  noteId,
  tags,
  fields: Object.fromEntries(
    SPEC.fields.map((f) => [
      f,
      { value: f === "Target" ? target : f === "English" ? english : "" },
    ]),
  ),
});

function client(notes = []) {
  const calls = [];
  return {
    calls,
    client: {
      findNotes: async () => notes.map((n) => n.noteId),
      notesInfo: async (ids) => notes.filter((n) => ids.includes(n.noteId)),
      updateNoteFields: async (id) => calls.push(["updateNoteFields", id]),
      addTags: async (ids, tags) => calls.push(["addTags", ids, tags]),
      addNote: async (n) => calls.push(["addNote", n.tags]),
      storeMediaFile: async () => {},
    },
  };
}

const deck = (cards, marker = null) => ({
  type: "epub",
  id: "book",
  ankiParent: "My Book",
  spec: SPEC,
  marker,
  units: [{ ankiDeck: "My Book::Lesson 01", audioDir: null, cards }],
});

const cards = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    target: `t${i}`,
    english: `e${i}`,
  }));

test("marker present and ZERO notes found aborts, naming the rename", async () => {
  const { client: c, calls } = client([]);
  await assert.rejects(
    () =>
      syncDeckContent(
        c,
        deck(cards(3), { ankiParent: "My Book", lastDeliveredAt: "2026-08-01" }),
        false,
      ),
    (error) => {
      assert.match(error.message, /has been delivered before/);
      assert.match(error.message, /RENAMED in Anki/);
      assert.match(error.message, /"My Book"/);
      return true;
    },
  );
  assert.deepEqual(calls, [], "nothing was written");
});

test("no marker and zero notes is an ordinary first delivery", async () => {
  const { client: c } = client([]);
  const report = await syncDeckContent(c, deck(cards(3)), true);
  assert.equal(report.added, 3);
});

test("the baseline is INACTIVE on a marker that records none, and this run records one", async () => {
  const { client: c } = client([note(1, { target: "t0", english: "e0", tags: ["abid:c0"] })]);
  const report = await syncDeckContent(
    c,
    deck(cards(1), { ankiParent: "My Book" }), // pre-baseline marker: three keys, no card ids
    true,
  );
  assert.equal(report.baseline.armed, false);
  assert.match(report.baseline.reason, /no baseline recorded yet/);
  assert.deepEqual(report.deliveredCardIds, ["c0"], "what the next run will assert against");
});

test("a baseline that mostly fails to resolve aborts before anything is written", async () => {
  const delivered = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const { client: c, calls } = client([
    note(1, { target: "t0", english: "e0", tags: ["abid:c0"] }),
  ]);
  await assert.rejects(
    () => syncDeckContent(c, deck(cards(20), { deliveredCardIds: delivered }), false),
    (error) => {
      assert.match(error.message, /19 of 20 previously-delivered card\(s\)/);
      assert.match(error.message, /re-add them as new notes with no scheduling/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

test("one hand-deleted note is under the threshold and does not abort", async () => {
  const delivered = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const notes = delivered
    .slice(0, 19)
    .map((id, i) => note(i + 1, { target: `t${i}`, english: `e${i}`, tags: [`abid:${id}`] }));
  const { client: c } = client(notes);
  const report = await syncDeckContent(c, deck(cards(20), { deliveredCardIds: delivered }), true);
  assert.equal(report.baseline.armed, true);
  assert.equal(report.baseline.unresolved, 1);
});

test("the add ceiling refuses a run this size unless it is asked for", async () => {
  const many = cards(DEFAULT_MAX_ADDS + 1);
  const { client: c } = client([]);
  await assert.rejects(() => syncDeckContent(c, deck(many), false), /over the ceiling/);

  const lines = [];
  const dryReport = await syncDeckContent(c, deck(many), true, { log: (m) => lines.push(m) });
  assert.equal(dryReport.added, many.length, "a dry run previews it instead of refusing");
  assert.match(lines.join(" "), /over the ceiling/);

  const allowed = await syncDeckContent(c, deck(many), false, { allowBulkAdd: true });
  assert.equal(allowed.added, many.length);
});

// ── the two guards that need a real deliverToAnki run ───────────────────────────────────────────

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deliver-guards-"));
  const dir = join(root, "courses", "my-course");
  mkdirSync(join(dir, "lesson-0"), { recursive: true });
  writeFileSync(
    join(dir, "course.json"),
    JSON.stringify({ name: "My Course", targetLanguage: "ja" }),
  );
  const cardsJson = {
    meta: {
      targetLanguage: "ja",
      sourceType: "manual",
      reviewed: true,
      done: true,
      chapterNumber: 1,
      chapterLabel: "Lesson 1",
      courseSlug: "my-course",
    },
    items: [{ id: "cat", target: "猫", english: "Cat", category: "Animals" }],
  };
  writeFileSync(join(dir, "lesson-0", "cards.json"), JSON.stringify(cardsJson));
  writeFileSync(join(dir, "lesson-0", "corpus.json"), JSON.stringify(cardsJson));
  return { root, dir };
}

function liveClient({ exportResult = true } = {}) {
  return {
    version: async () => 6,
    sync: async () => {},
    exportPackage: async () => exportResult,
    deckNames: async () => ["My Course", "My Course::Lesson 01"],
    createDeck: async () => {},
    modelNames: async () => [SPEC.modelName],
    modelFieldNames: async () => [...SPEC.fields],
    modelTemplates: async () =>
      Object.fromEntries(SPEC.templates.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }])),
    modelStyling: async () => ({ css: SPEC.css }),
    findCards: async () => [],
    getDecks: async () => ({}),
    findNotes: async () => [],
    notesInfo: async () => [],
    addNote: async () => 1,
    addTags: async () => {},
    updateNoteFields: async () => {},
    storeMediaFile: async () => {},
    invoke: async () => {},
  };
}

test("a falsy exportPackage on a DELIVERED collection is a backup FAILURE, not a success", async () => {
  const { root, dir } = fixture();
  const backupRoot = mkdtempSync(join(tmpdir(), "deliver-guards-backup-"));
  try {
    // Delivered before, so the deck must exist. `{result: false}` here means it was renamed or
    // deleted, and the backup this delivery relies on does not exist.
    writeFileSync(
      join(dir, "anki-delivered.json"),
      JSON.stringify({ ankiParent: "My Course", deliveredCardIds: ["cat"] }),
    );
    await assert.rejects(
      () =>
        deliverToAnki(root, "all", {
          client: liveClient({ exportResult: false }),
          backupRoot,
          sync: false,
        }),
      (error) => {
        assert.match(error.message, /backup failed for "My Course"/);
        assert.match(error.message, /aborting before any changes were made/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
  }
});

test("a falsy exportPackage on a NEVER-delivered collection is just an absent deck", async () => {
  // The first delivery of any new collection hits this: the backup runs before the decks are
  // created, so AnkiConnect answers `{result: false}` for a parent deck that does not exist yet.
  // Treating that as a failed backup made a first delivery impossible, with no flag to get past it.
  const { root } = fixture();
  const backupRoot = mkdtempSync(join(tmpdir(), "deliver-guards-backup-"));
  const lines = [];
  try {
    const report = await deliverToAnki(root, "all", {
      client: liveClient({ exportResult: false }),
      backupRoot,
      sync: false,
      log: (m) => lines.push(m),
    });
    assert.deepEqual(report.backedUp, [], "nothing existed to back up");
    assert.equal(report.content[0].added, 1, "and the delivery went ahead");
    assert.match(lines.join("\n"), /never been delivered/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
  }
});

test("a real deliver records the delivered card ids as the next run's baseline", async () => {
  const { root, dir } = fixture();
  const backupRoot = mkdtempSync(join(tmpdir(), "deliver-guards-backup-"));
  try {
    const report = await deliverToAnki(root, "all", {
      client: liveClient(),
      backupRoot,
      sync: false,
    });
    assert.deepEqual(
      report.markerWrites.map((m) => [m.armed, m.count]),
      [[true, 1]],
    );
    const marker = JSON.parse(readFileSync(join(dir, "anki-delivered.json"), "utf-8"));
    assert.deepEqual(marker.deliveredCardIds, ["cat"]);
    assert.equal(marker.ankiParent, "My Course");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
  }
});

test("an unreadable delivered marker stops the deliver rather than disabling both guards", async () => {
  const { root, dir } = fixture();
  const backupRoot = mkdtempSync(join(tmpdir(), "deliver-guards-backup-"));
  try {
    writeFileSync(join(dir, "anki-delivered.json"), "{ not json");
    await assert.rejects(
      () => deliverToAnki(root, "all", { client: liveClient(), backupRoot, sync: false }),
      (error) => {
        assert.match(error.message, /will not parse/);
        assert.match(error.message, /Both delivery guards read that file/);
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
  }
});

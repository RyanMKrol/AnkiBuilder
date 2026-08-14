import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import { buildCollection, buildMultiDeckCollection } from "../../src/deck/collection.js";

/**
 * The deck-options presets the package ships, and which one our decks point at.
 *
 * The preset our decks use must never be the importing collection's `Default`: id 1 is a preset
 * every collection already has, so writing our scheduling choices into it would push them onto every
 * deck the owner has that we did not build.
 */

const ANKI_BUILDER_DCONF_ID = 1_000_001;

function withTempDb(bytes, fn) {
  const dir = mkdtempSync(join(tmpdir(), "dconf-test-"));
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

const cards = { items: [{ id: "a", target: "あ", pronunciation: "a", english: "Ah" }] };

function read(bytes) {
  return withTempDb(bytes, (db) => {
    const row = db.prepare("SELECT decks, dconf FROM col").get();
    return { decks: JSON.parse(row.decks), dconf: JSON.parse(row.dconf) };
  });
}

test("the package ships a deck-scoped preset beside an untouched stock Default", () => {
  const { dconf } = read(buildCollection(cards, { deckName: "Deck", now: 1_700_000_000_000 }));

  assert.deepEqual(Object.keys(dconf).sort(), ["1", String(ANKI_BUILDER_DCONF_ID)].sort());
  assert.equal(dconf[1].name, "Default");
  assert.equal(dconf[1].new.bury, false, "the stock Default carries no opinion of ours");
  assert.equal(dconf[1].rev.bury, false);
  assert.equal(dconf[ANKI_BUILDER_DCONF_ID].name, "anki-builder");
});

test("our preset buries siblings, so the two directions of a note are not asked together", () => {
  const { dconf } = read(buildCollection(cards, { deckName: "Deck", now: 1_700_000_000_000 }));
  assert.equal(dconf[ANKI_BUILDER_DCONF_ID].new.bury, true);
  assert.equal(dconf[ANKI_BUILDER_DCONF_ID].rev.bury, true);
});

test("every deck we build points at our preset; the Default deck row keeps preset 1", () => {
  const { decks } = read(
    buildMultiDeckCollection([{ name: "Lesson 1", cards }], {
      bookName: "Book",
      now: 1_700_000_000_000,
    }),
  );

  for (const deck of Object.values(decks)) {
    assert.equal(
      deck.conf,
      deck.name === "Default" ? 1 : ANKI_BUILDER_DCONF_ID,
      `deck "${deck.name}" points at the wrong options preset`,
    );
  }
});

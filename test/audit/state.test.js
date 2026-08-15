import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, utimesSync } from "fs";
import { join } from "path";
import {
  assertMutationAllowed,
  collectionState,
  describeState,
  MutationRefused,
  unitState,
} from "../../src/audit/state.js";
import { makeOutputRoot, card, writeMarker, writeRaw, writeUnit } from "./fixture.js";

/**
 * The five states, and the two consents.
 *
 * Everything here runs against a throwaway output root; nothing reads the repo's own `output/`.
 */

const bookDir = (root) => join(root, "epubs", "book");

/** A built package for a collection, stamped NEWER than everything written before it. */
function writePackage(root, dir, name = "book.apkg") {
  const path = writeRaw(root, join(dir, name), "not really a zip");
  const later = new Date(Date.now() + 60_000);
  utimesSync(path, later, later);
  return path;
}

test("a fresh unit is authored and nothing else", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const dir = writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const state = unitState(dir);
    assert.deepEqual(
      {
        authored: state.authored,
        reviewed: state.reviewed,
        done: state.done,
        packaged: state.packaged,
        delivered: state.delivered,
      },
      { authored: true, reviewed: false, done: false, packaged: false, delivered: false },
    );
    assert.equal(describeState(state), "authored");
  } finally {
    cleanup();
  }
});

test("packaged needs a package that is NOT older than the unit's cards.json", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const dir = writeUnit(root, "epubs/book/chapter-1", {
      meta: { reviewed: true, done: true },
      items: [card("a")],
    });
    assert.equal(unitState(dir).packaged, false, "no package built yet");

    writePackage(root, "epubs/book");
    assert.equal(unitState(dir).packaged, true);

    // An edit after the build makes the package stale, and a stale package is not "packaged".
    const later = new Date(Date.now() + 120_000);
    utimesSync(join(dir, "cards.json"), later, later);
    assert.equal(unitState(dir).packaged, false);
  } finally {
    cleanup();
  }
});

test("delivered is the marker, narrowed to the units that actually shipped", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const done = writeUnit(root, "epubs/book/chapter-1", {
      meta: { reviewed: true, done: true },
      items: [card("a")],
    });
    const inProgress = writeUnit(root, "epubs/book/chapter-2", { items: [card("b")] });
    writePackage(root, "epubs/book");
    writeMarker(root, "epubs/book", "anki-delivered.json", { ankiParent: "Book" });

    assert.equal(unitState(done).delivered, true);
    assert.equal(unitState(inProgress).delivered, false, "not done → never in the package");
    assert.equal(collectionState(bookDir(root)).delivered, true);
    assert.equal(collectionState(bookDir(root)).done, false, "one unit is still in progress");
  } finally {
    cleanup();
  }
});

test("with deliveredCardIds recorded, delivered is answered per unit", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const first = writeUnit(root, "epubs/book/chapter-1", {
      meta: { reviewed: true, done: true },
      items: [card("a")],
    });
    const second = writeUnit(root, "epubs/book/chapter-2", {
      meta: { reviewed: true, done: true },
      items: [card("b")],
    });
    writePackage(root, "epubs/book");
    writeMarker(root, "epubs/book", "anki-delivered.json", {
      ankiParent: "Book",
      deliveredCardIds: ["a"],
    });

    assert.equal(unitState(first).delivered, true);
    assert.equal(unitState(second).delivered, false, "its cards are not in the recorded baseline");
  } finally {
    cleanup();
  }
});

test("clearing meta.done does NOT launder away the delivered consent", () => {
  // undone-unit asks for --force-delivered once, correctly, and clears `done`. If `delivered` were
  // gated on `done`, that single consent would permanently downgrade the unit and every later tool
  // would rewrite live cards asking only for --force. The recorded baseline is the fact, not the flag.
  const { root, cleanup } = makeOutputRoot();
  try {
    const dir = writeUnit(root, "epubs/book/chapter-1", {
      meta: { reviewed: true, done: false }, // just un-doned
      items: [card("a")],
    });
    writeMarker(root, "epubs/book", "anki-delivered.json", {
      ankiParent: "Book",
      deliveredCardIds: ["a"],
    });

    assert.equal(unitState(dir).done, false);
    assert.equal(unitState(dir).delivered, true, "the cards are still in Anki");
    assert.throws(() => assertMutationAllowed(dir, { force: true }), /--force-delivered/);
  } finally {
    cleanup();
  }
});

test("an unreadable marker is refused, never read as 'never delivered' or as delivered", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const dir = writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeFileSync(join(bookDir(root), "anki-delivered.json"), "{ not json");
    const state = unitState(dir);
    assert.equal(state.collection.markerUnreadable, true);
    assert.equal(
      state.collection.delivered,
      false,
      "an unparseable file is a question, not a delivery record — markerUnreadable is the answer",
    );
    assert.throws(
      () => assertMutationAllowed(state, { force: true, forceDelivered: true }),
      MutationRefused,
    );
  } finally {
    cleanup();
  }
});

test("the two consents are separate: --force does not grant the delivered one", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const dir = writeUnit(root, "epubs/book/chapter-1", {
      meta: { reviewed: true, done: true },
      items: [card("a")],
    });
    writePackage(root, "epubs/book");
    writeMarker(root, "epubs/book", "anki-delivered.json", { ankiParent: "Book" });

    assert.throws(
      () => assertMutationAllowed(dir, { force: true }),
      (error) => {
        assert.ok(error instanceof MutationRefused);
        assert.match(error.message, /DELIVERED/);
        assert.match(error.message, /--force-delivered/);
        return true;
      },
    );
    assert.throws(() => assertMutationAllowed(dir, { forceDelivered: true }), /signed off/);
    const state = assertMutationAllowed(dir, { force: true, forceDelivered: true });
    assert.equal(state.delivered, true);
  } finally {
    cleanup();
  }
});

test("a template collection is its own unit, and is packaged without a done gate", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const dir = writeUnit(root, "templates/numbers/ja", { items: [card("a")] });
    assert.equal(unitState(dir).collectionDir, dir, "the language folder IS the collection");
    assert.equal(unitState(dir).packaged, false);
    writePackage(root, "templates/numbers/ja", "numbers-ja.apkg");
    assert.equal(unitState(dir).packaged, true, "no done gate on a template");
  } finally {
    cleanup();
  }
});

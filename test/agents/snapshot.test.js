import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  SNAPSHOT_FILE,
  writeSnapshot,
  readSnapshot,
  hasSnapshot,
  rolesFor,
} from "../../src/agents/snapshot.js";

function withUnitDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "snapshot-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const items = [{ id: "neko" }, { id: "inu" }, { id: "tori" }];

test("a snapshot captures the corpus and who produced each item", () => {
  withUnitDir((dir) => {
    assert.equal(hasSnapshot(dir), false);
    writeSnapshot(dir, {
      phase: "base",
      items,
      // Overlapping roles are unioned, so an item can legitimately have two producers.
      provenance: { neko: ["tableSpecialist", "chapterReader"], inu: ["imageSpecialist"] },
    });
    assert.ok(hasSnapshot(dir));

    const snap = readSnapshot(dir);
    assert.equal(snap.phase, "base");
    assert.equal(snap.counts.items, 3);
    assert.equal(snap.counts.attributed, 2);
    assert.deepEqual(rolesFor(snap, "neko"), ["tableSpecialist", "chapterReader"]);
    assert.deepEqual(rolesFor(snap, "tori"), [], "an unclaimed item reports nobody, not a guess");
    assert.ok(readFileSync(join(dir, SNAPSHOT_FILE), "utf-8").endsWith("\n"));
  });
});

test("the baseline is written once: a second write is refused", () => {
  withUnitDir((dir) => {
    writeSnapshot(dir, { phase: "base", items });
    assert.throws(
      () => writeSnapshot(dir, { phase: "base", items: [] }),
      /written once; overwriting it would make the learning pass report that the reviewer changed nothing/,
    );
    assert.equal(readSnapshot(dir).counts.items, 3, "the original baseline survived");
  });
});

test("force exists for repairing a baseline, and actually replaces it", () => {
  withUnitDir((dir) => {
    writeSnapshot(dir, { phase: "base", items });
    writeSnapshot(dir, { phase: "base", items: [{ id: "neko" }] }, { force: true });
    assert.equal(readSnapshot(dir).counts.items, 1);
  });
});

test("provenance naming a card that does not exist is refused", () => {
  withUnitDir((dir) => {
    assert.throws(
      () => writeSnapshot(dir, { phase: "base", items, provenance: { ghost: ["gapAuthor"] } }),
      /absent from items \(ghost\)/,
    );
    assert.equal(hasSnapshot(dir), false, "nothing was written");
  });
});

test("readSnapshot is null when no phase captured one", () => {
  withUnitDir((dir) => assert.equal(readSnapshot(dir), null));
});

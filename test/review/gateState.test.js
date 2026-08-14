import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  gateState,
  packageDirForUnit,
  parseDuration,
  readUnitCards,
  GATE_EXIT,
} from "../../src/review/gateState.js";
import { deckPathForDir } from "../../src/deck/deckFileName.js";

// Everything here runs against a throwaway tmpdir tree — never output/, which holds reviewed units.
function collection(name = "mybook") {
  const root = mkdtempSync(join(tmpdir(), "anki-gate-"));
  const dir = join(root, "epubs", name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function unit(collectionDir, name, meta) {
  const dir = join(collectionDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cards.json"), JSON.stringify({ meta, items: [] }));
  return dir;
}

// The package the collection's rebuild would publish, aged relative to now.
function packageFile(collectionDir, ageMs = 0) {
  const path = deckPathForDir(collectionDir);
  writeFileSync(path, "not really a zip");
  const at = (Date.now() + ageMs) / 1000;
  utimesSync(path, at, at);
  return path;
}

test("a unit that cannot be read is its own state, never 'not signed off yet'", () => {
  const dir = collection();
  const missing = gateState(join(dir, "chapter-9"), 1);
  assert.equal(missing.status, "unreadable");
  assert.equal(missing.exitCode, GATE_EXIT.unreadable);

  const broken = unit(dir, "chapter-1", {});
  writeFileSync(join(broken, "cards.json"), "{ not json");
  assert.equal(gateState(broken, 1).status, "unreadable");
  assert.match(readUnitCards(broken).error, /cannot read/);
});

test("gate 1 waits for meta.reviewed and nothing else", () => {
  const dir = collection();
  assert.equal(gateState(unit(dir, "chapter-1", {}), 1).status, "waiting");
  assert.equal(gateState(unit(dir, "chapter-2", { done: true }), 1).status, "waiting");
  const signed = gateState(unit(dir, "chapter-3", { reviewed: true }), 1);
  assert.equal(signed.status, "signed-off");
  assert.equal(signed.exitCode, GATE_EXIT.signedOff);
});

test("gate 2 confirms the ARTIFACT, not the checkbox: no package means the rebuild failed", () => {
  const dir = collection();
  const runDir = unit(dir, "chapter-1", { reviewed: true, done: true });
  const state = gateState(runDir, 2);
  assert.equal(state.status, "stale-package");
  assert.equal(state.exitCode, GATE_EXIT.stalePackage);
  assert.match(state.message, /rebuild FAILED/);
});

test("gate 2 fails a package OLDER than cards.json, and passes a rebuilt one", () => {
  const dir = collection();
  const runDir = unit(dir, "chapter-1", { reviewed: true, done: true });

  packageFile(dir, -60_000);
  assert.equal(gateState(runDir, 2).status, "stale-package");

  packageFile(dir, 60_000);
  const fresh = gateState(runDir, 2);
  assert.equal(fresh.status, "signed-off");
  assert.match(fresh.message, /rebuilt/);
});

test("gate 2 still waits when the flag is unset, however fresh the package is", () => {
  const dir = collection();
  const runDir = unit(dir, "chapter-1", { reviewed: true });
  packageFile(dir, 60_000);
  assert.equal(gateState(runDir, 2).status, "waiting");
});

test("a unit ships in its COLLECTION's package; a template dir is its own", () => {
  assert.equal(packageDirForUnit("/x/epubs/book/chapter-3"), "/x/epubs/book");
  assert.equal(packageDirForUnit("/x/epubs/book/chapter-3-extras"), "/x/epubs/book");
  assert.equal(packageDirForUnit("/x/courses/c/lesson-12"), "/x/courses/c");
  assert.equal(packageDirForUnit("/x/templates/numbers/ja"), "/x/templates/numbers/ja");
});

test("a relative run dir is resolved before anything reads it", () => {
  // The bug this whole module exists for: a relative path stops resolving the moment the shell's
  // cwd drifts, and every poll then fails in a way that looks exactly like patience.
  assert.equal(packageDirForUnit("chapter-3"), process.cwd());
});

test("durations default to MINUTES, because every documented wait here is in minutes", () => {
  assert.equal(parseDuration("30m"), 30 * 60_000);
  assert.equal(parseDuration("30"), 30 * 60_000);
  assert.equal(parseDuration("15s"), 15_000);
  assert.equal(parseDuration("2h"), 2 * 3_600_000);
  assert.throws(() => parseDuration("soon"), /cannot read/);
  assert.throws(() => parseDuration("0m"), /positive/);
});

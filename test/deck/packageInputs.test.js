import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  packageInputsPath,
  readPackageInputs,
  unitPackageFreshness,
} from "../../src/deck/packageInputs.js";
import { rebuildBookDir } from "../../src/deck/rebuild.js";
import { deckPathForDir } from "../../src/deck/deckFileName.js";
import { gateState } from "../../src/review/gateState.js";
import { collectionState } from "../../src/audit/state.js";

// "Is the package current?" judged by content, not file times. Every test runs in a throwaway
// tmpdir; nothing here reads or writes output/ or .anki-builder/.

function book() {
  const dir = join(mkdtempSync(join(tmpdir(), "anki-pkg-inputs-")), "epubs", "mybook");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCards(bookDir, name, cards, { pretty = false } = {}) {
  const dir = join(bookDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cards.json"), JSON.stringify(cards, null, pretty ? 2 : 0));
  return dir;
}

const doneCards = (ids) => ({
  meta: { reviewed: true, done: true, chapterLabel: "Lesson 1" },
  items: ids.map((id) => ({ id, english: id, target: id })),
});

// A stub builder that writes a package file, so the rebuild's sidecar lands next to a real path.
const stubBuild = (_decks, opts) => {
  writeFileSync(opts.outPath, "not really a zip");
  return { outPath: opts.outPath, noteCount: 1, chapterCount: _decks.length };
};

const age = (path, ms) => {
  const at = new Date(Date.now() + ms);
  utimesSync(path, at, at);
};

const verdict = (bookDir, unitDir) =>
  unitPackageFreshness({
    packagePath: deckPathForDir(bookDir),
    collectionDir: bookDir,
    unitDir,
  });

test("a rebuild records a digest of every unit it packaged, beside the package", async () => {
  const dir = book();
  writeCards(dir, "chapter-1", doneCards(["a"]));
  writeCards(dir, "chapter-2", doneCards(["b"]));
  writeCards(dir, "chapter-3", { meta: {}, items: [{ id: "c" }] }); // not done: not packaged

  await rebuildBookDir(dir, { buildBookDeck: stubBuild });

  const inputs = readPackageInputs(deckPathForDir(dir));
  assert.deepEqual(Object.keys(inputs.units).sort(), ["chapter-1", "chapter-2"]);
  assert.ok(existsSync(packageInputsPath(deckPathForDir(dir))));
});

test("a touch that changes nothing, or only the formatting, leaves the package current", async () => {
  const dir = book();
  const unit = writeCards(dir, "chapter-1", doneCards(["a"]));
  await rebuildBookDir(dir, { buildBookDeck: stubBuild });
  age(deckPathForDir(dir), -60_000);

  // A checkout that rewrites the same bytes, newer than the package: the old check failed this.
  age(join(unit, "cards.json"), 60_000);
  assert.deepEqual(verdict(dir, unit), {
    status: "current",
    basis: "content",
    packageAt: verdict(dir, unit).packageAt,
  });

  // The dashboard and the CLI indent differently; that is not a content change either.
  writeCards(dir, "chapter-1", doneCards(["a"]), { pretty: true });
  assert.equal(verdict(dir, unit).status, "current");
});

test("a real edit makes the package stale, however old the edit's file time is", async () => {
  const dir = book();
  const unit = writeCards(dir, "chapter-1", doneCards(["a"]));
  await rebuildBookDir(dir, { buildBookDeck: stubBuild });

  writeCards(dir, "chapter-1", doneCards(["a", "b"]));
  age(join(unit, "cards.json"), -120_000); // older than the package, and still stale
  const v = verdict(dir, unit);
  assert.equal(v.status, "stale");
  assert.equal(v.basis, "content");
});

test("a unit marked done after the build is stale until the next rebuild picks it up", async () => {
  const dir = book();
  writeCards(dir, "chapter-1", doneCards(["a"]));
  const later = writeCards(dir, "chapter-2", { meta: { reviewed: true }, items: [{ id: "b" }] });
  await rebuildBookDir(dir, { buildBookDeck: stubBuild });

  writeCards(dir, "chapter-2", doneCards(["b"]));
  assert.equal(verdict(dir, later).status, "stale");
  // This is the gate 2 watcher's question too: Mark done wrote the flag, the rebuild has not landed.
  assert.equal(gateState(later, 2).status, "stale-package");

  await rebuildBookDir(dir, { buildBookDeck: stubBuild });
  assert.equal(verdict(dir, later).status, "current");
  assert.equal(gateState(later, 2).status, "signed-off");
});

test("a package with no record falls back to file times, and says so", () => {
  const dir = book();
  const unit = writeCards(dir, "chapter-1", doneCards(["a"]));
  writeFileSync(deckPathForDir(dir), "built before the record existed");

  age(deckPathForDir(dir), 60_000);
  assert.deepEqual(
    { status: verdict(dir, unit).status, basis: verdict(dir, unit).basis },
    { status: "current", basis: "mtime" },
  );

  age(join(unit, "cards.json"), 120_000);
  assert.deepEqual(
    { status: verdict(dir, unit).status, basis: verdict(dir, unit).basis },
    { status: "stale", basis: "mtime" },
  );
});

test("the collection state line agrees with the same judgement", async () => {
  const dir = book();
  const unit = writeCards(dir, "chapter-1", doneCards(["a"]));
  await rebuildBookDir(dir, { buildBookDeck: stubBuild });
  age(join(unit, "cards.json"), 60_000);
  assert.equal(collectionState(dir).packaged, true, "a touch is not an edit");

  writeCards(dir, "chapter-1", doneCards(["a", "b"]));
  assert.equal(collectionState(dir).packaged, false);
});

test("an unreadable record is no record: the mtime basis answers instead", () => {
  const dir = book();
  const unit = writeCards(dir, "chapter-1", doneCards(["a"]));
  writeFileSync(deckPathForDir(dir), "zip");
  writeFileSync(packageInputsPath(deckPathForDir(dir)), "{ not json");
  assert.equal(readPackageInputs(deckPathForDir(dir)), null);
  assert.equal(verdict(dir, unit).basis, "mtime");
  assert.ok(readFileSync(packageInputsPath(deckPathForDir(dir)), "utf-8").startsWith("{"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { undoneUnit, undoneBackupPath } from "../../src/review/undoneUnit.js";

// tmpdir only — this function clears a shipping flag, so it must never be pointed at real units.
function unitDir(meta, items = []) {
  const dir = join(mkdtempSync(join(tmpdir(), "anki-undone-")), "chapter-1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({ meta: { targetLanguage: "ja", sourceType: "epub", ...meta }, items }, null, 2),
  );
  return dir;
}

const card = {
  id: "hon",
  english: "Book",
  target: "ほん",
  category: "Everyday Objects",
  pronunciation: "hon",
};

test("clearing done backs the file up first, then removes only that key", () => {
  const dir = unitDir({ reviewed: true, done: true, chapterLabel: "Lesson 1" }, [card]);
  const result = undoneUnit(dir);

  assert.equal(result.changed, true);
  assert.ok(existsSync(result.backupPath), "the pre-change state must survive");

  const after = JSON.parse(readFileSync(result.cardsPath, "utf-8"));
  assert.equal(after.meta.done, undefined);
  assert.equal(after.meta.reviewed, true, "the corpus sign-off is untouched");
  assert.equal(after.items.length, 1);

  const backup = JSON.parse(readFileSync(result.backupPath, "utf-8"));
  assert.equal(backup.meta.done, true);
});

test("a unit that is not done is a no-op, so a re-run cannot damage anything", () => {
  const dir = unitDir({ reviewed: true }, [card]);
  const result = undoneUnit(dir);
  assert.equal(result.changed, false);
  assert.equal(result.backupPath, null);
});

test("the result is validated before it is published, so a broken unit is never written", () => {
  const dir = unitDir({ reviewed: true, done: true }, [{ ...card, target: 42 }]);
  assert.throws(() => undoneUnit(dir), /target/);
});

test("backups are stamped, so two runs keep two restore points", () => {
  const first = undoneBackupPath("/x/cards.json", new Date("2026-08-14T10:00:00Z"));
  const second = undoneBackupPath("/x/cards.json", new Date("2026-08-14T11:00:00Z"));
  assert.notEqual(first, second);
  assert.match(first, /cards\.json\.pre-undone-.*\.bak$/);
});

test("an unreadable unit fails loudly rather than reporting nothing to do", () => {
  const dir = unitDir({ done: true }, [card]);
  writeFileSync(join(dir, "cards.json"), "{ not json");
  assert.throws(() => undoneUnit(dir), /cannot read/);
});

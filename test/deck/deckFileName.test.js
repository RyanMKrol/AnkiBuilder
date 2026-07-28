import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  deckIdentityForDir,
  deckFileNameForDir,
  deckPathForDir,
  resolveDeckPathForDir,
  LEGACY_DECK_FILENAME,
} from "../../src/deck/deckFileName.js";

test("a book or course dir is named after its own folder", () => {
  assert.equal(
    deckFileNameForDir("/out/epubs/japanese-for-busy-people-book-1-kana"),
    "japanese-for-busy-people-book-1-kana.apkg",
  );
  assert.equal(
    deckFileNameForDir("/out/courses/nihongo-101-course-n5"),
    "nihongo-101-course-n5.apkg",
  );
});

// `lesson-3` and `ja` identify nothing on their own — every course has a lesson-3, every template a ja.
test("a unit dir folds in its parent, so lesson-3 of one course can't collide with another's", () => {
  assert.equal(
    deckIdentityForDir("/out/courses/nihongo-101-course-n5/lesson-3"),
    "nihongo-101-course-n5-lesson-3",
  );
  assert.equal(deckIdentityForDir("/out/epubs/mybook/chapter-12"), "mybook-chapter-12");
});

test("a template language dir folds in the template name", () => {
  assert.equal(deckFileNameForDir("/out/templates/numbers/ja"), "numbers-ja.apkg");
  assert.equal(
    deckFileNameForDir("/out/templates/travel-essentials/es"),
    "travel-essentials-es.apkg",
  );
});

// Only the templates/ tree folds its parent in — a folder that merely happens to be two deep must not.
test("a plain nested run dir is named after itself alone", () => {
  assert.equal(deckFileNameForDir("/out/scratch/myrun"), "myrun.apkg");
});

test("the name is filesystem-safe", () => {
  assert.equal(deckFileNameForDir("/out/epubs/Cafés & Crème!"), "cafes-creme.apkg");
});

test("resolveDeckPathForDir prefers the named package", () => {
  const dir = mkdtempSync(join(tmpdir(), "dfn-"));
  try {
    const book = join(dir, "epubs", "mybook");
    mkdirSync(book, { recursive: true });
    writeFileSync(join(book, "mybook.apkg"), "named");
    writeFileSync(join(book, LEGACY_DECK_FILENAME), "legacy");
    assert.equal(resolveDeckPathForDir(book), join(book, "mybook.apkg"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A deck built before this convention must stay readable without a migration having been run.
test("resolveDeckPathForDir falls back to a pre-existing deck.apkg", () => {
  const dir = mkdtempSync(join(tmpdir(), "dfn-"));
  try {
    const book = join(dir, "epubs", "mybook");
    mkdirSync(book, { recursive: true });
    writeFileSync(join(book, LEGACY_DECK_FILENAME), "legacy");
    assert.equal(resolveDeckPathForDir(book), join(book, LEGACY_DECK_FILENAME));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// "where would it go?" and "where is it?" must agree when nothing exists yet, or a build would write
// one path while the dashboard looked at another.
test("with neither present it returns the path a build would write", () => {
  const dir = mkdtempSync(join(tmpdir(), "dfn-"));
  try {
    const book = join(dir, "epubs", "mybook");
    mkdirSync(book, { recursive: true });
    assert.equal(resolveDeckPathForDir(book), deckPathForDir(book));
    assert.equal(resolveDeckPathForDir(book), join(book, "mybook.apkg"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

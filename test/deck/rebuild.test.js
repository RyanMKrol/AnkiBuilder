import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { rebuildBookDir, rebuildRunDir } from "../../src/deck/rebuild.js";
import { readApkg } from "../../src/deck/readApkg.js";

// Units default to `done: true` (the merge only ships finished lessons); pass `done: false` to model an
// in-progress lesson.
function writeUnit(dir, meta, items, audio = {}) {
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "cards.json"), JSON.stringify({ meta: { done: true, ...meta }, items }));
  for (const [name, bytes] of Object.entries(audio)) writeFileSync(join(dir, "audio", name), bytes);
}

test("rebuildBookDir assembles chapters by FOLDER SEQ, names from chapterLabel, resolves bookName", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-book-"));
  try {
    // chapter-0 has the higher chapterNumber; folder-seq order must still be chapter-0 then chapter-1
    writeUnit(
      join(dir, "chapter-0"),
      { targetLanguage: "ja", chapterNumber: 9, chapterLabel: "Alpha", epubHash: "h1" },
      [{ id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" }],
    );
    writeUnit(
      join(dir, "chapter-1"),
      { targetLanguage: "ja", chapterNumber: 2, chapterLabel: "Beta", epubHash: "h1" },
      [{ id: "b", english: "two", target: "に", pronunciation: "ni", category: "Numbers" }],
    );

    let received;
    const result = rebuildBookDir(dir, {
      buildBookDeck: (chapterDecks, opts) => {
        received = { chapterDecks, opts };
        return {
          outPath: opts.outPath,
          noteCount: 2,
          chapterCount: chapterDecks.length,
          mediaCount: 0,
        };
      },
      loadBookMeta: (hash) => (hash === "h1" ? { title: "My Book" } : null),
      loadCourseMeta: () => null,
    });

    assert.deepEqual(
      received.chapterDecks.map((c) => c.name),
      ["Alpha", "Beta"],
    ); // folder seq, not chapterNumber
    assert.equal(received.opts.bookName, "My Book");
    assert.equal(received.opts.outPath, join(dir, "deck.apkg"));
    assert.equal(result.chapterCount, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir uses loadCourseMeta for a lesson-sourced course (no epubHash)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-course-"));
  try {
    writeUnit(
      join(dir, "lesson-0"),
      { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson 1" },
      [{ id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" }],
    );
    let bookName;
    rebuildBookDir(dir, {
      buildBookDeck: (_c, opts) => ((bookName = opts.bookName), { noteCount: 1, chapterCount: 1 }),
      loadBookMeta: () => null,
      loadCourseMeta: () => ({ name: "My Course" }),
    });
    assert.equal(bookName, "My Course");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir throws for no unit dirs, and for no finished (done) lessons", () => {
  const empty = mkdtempSync(join(tmpdir(), "rb-empty-"));
  try {
    assert.throws(
      () => rebuildBookDir(empty, { buildBookDeck: () => {} }),
      /no chapter-\*\/ or lesson-\*\//,
    );
    // a unit dir with no cards.json is skipped (in progress) → nothing finished to build
    mkdirSync(join(empty, "chapter-0"));
    assert.throws(
      () => rebuildBookDir(empty, { buildBookDeck: () => {} }),
      /no finished lessons to build/,
    );
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("rebuildBookDir merges only lessons marked done, skipping in-progress ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-done-"));
  try {
    writeUnit(join(dir, "chapter-0"), { targetLanguage: "ja", chapterLabel: "Done", done: true }, [
      { id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" },
    ]);
    writeUnit(
      join(dir, "chapter-1"),
      { targetLanguage: "ja", chapterLabel: "InProgress", done: false },
      [{ id: "b", english: "two", target: "に", pronunciation: "ni", category: "Numbers" }],
    );
    let received;
    rebuildBookDir(dir, {
      buildBookDeck: (chapterDecks) => (
        (received = chapterDecks),
        { noteCount: 1, chapterCount: chapterDecks.length }
      ),
      loadBookMeta: () => null,
      loadCourseMeta: () => ({ name: "C" }),
    });
    assert.deepEqual(
      received.map((c) => c.name),
      ["Done"],
    ); // the un-done lesson is excluded from the merge
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildRunDir builds a single run dir (template)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-run-"));
  try {
    writeUnit(dir, { targetLanguage: "ja" }, [
      { id: "a", english: "zero", target: "ゼロ", pronunciation: "zero", category: "Numbers" },
    ]);
    let received;
    rebuildRunDir(dir, {
      buildDeck: (cards, opts) => ((received = { cards, opts }), { noteCount: 1, mediaCount: 0 }),
    });
    assert.equal(received.opts.outPath, join(dir, "deck.apkg"));
    assert.equal(received.opts.audioDir, join(dir, "audio"));
    assert.equal(received.cards.items[0].target, "ゼロ");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir end-to-end embeds an updated clip in the real .apkg", () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-e2e-"));
  try {
    const clip = Buffer.from("NEW-CLIP-BYTES");
    writeUnit(
      join(dir, "chapter-0"),
      { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "One" },
      [
        {
          id: "a",
          english: "hi",
          target: "こんにちは",
          pronunciation: "konnichiwa",
          category: "Greetings",
          audio: "hi.mp3",
        },
      ],
      { "hi.mp3": clip },
    );
    const result = rebuildBookDir(dir, {
      loadBookMeta: () => null,
      loadCourseMeta: () => ({ name: "E2E" }),
    });
    assert.equal(result.noteCount, 1);
    assert.ok(existsSync(join(dir, "deck.apkg")));
    const deck = readApkg(join(dir, "deck.apkg"));
    const card = deck.sections[0].cards.find((c) => c.english === "hi");
    assert.deepEqual(Buffer.from(card.audioData), clip);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

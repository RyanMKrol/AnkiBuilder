import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { rebuildBookDir, rebuildRunDir } from "../../src/deck/rebuild.js";
import { readApkg } from "../../src/deck/readApkg.js";
import { deckPathForDir } from "../../src/deck/deckFileName.js";

// Units default to `done: true` (the merge only ships finished lessons); pass `done: false` to model an
// in-progress lesson.
function writeUnit(dir, meta, items, audio = {}) {
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "cards.json"), JSON.stringify({ meta: { done: true, ...meta }, items }));
  for (const [name, bytes] of Object.entries(audio)) writeFileSync(join(dir, "audio", name), bytes);
}

test("rebuildBookDir assembles chapters by FOLDER SEQ, names from chapterLabel, resolves bookName", async () => {
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
    const result = await rebuildBookDir(dir, {
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
    assert.equal(received.opts.outPath, deckPathForDir(dir));
    assert.equal(result.chapterCount, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir uses loadCourseMeta for a lesson-sourced course (no epubHash)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-course-"));
  try {
    writeUnit(
      join(dir, "lesson-0"),
      { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson 1" },
      [{ id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" }],
    );
    let bookName;
    await rebuildBookDir(dir, {
      buildBookDeck: (_c, opts) => ((bookName = opts.bookName), { noteCount: 1, chapterCount: 1 }),
      loadBookMeta: () => null,
      loadCourseMeta: () => ({ name: "My Course" }),
    });
    assert.equal(bookName, "My Course");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir throws for no unit dirs, and for no finished (done) lessons", async () => {
  const empty = mkdtempSync(join(tmpdir(), "rb-empty-"));
  try {
    await assert.rejects(
      () => rebuildBookDir(empty, { buildBookDeck: () => {} }),
      /no chapter-\*\/ or lesson-\*\//,
    );
    // a unit dir with no cards.json is skipped (in progress) → nothing finished to build
    mkdirSync(join(empty, "chapter-0"));
    await assert.rejects(
      () => rebuildBookDir(empty, { buildBookDeck: () => {} }),
      /no finished lessons to build/,
    );
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("rebuildBookDir merges only lessons marked done, skipping in-progress ones", async () => {
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
    await rebuildBookDir(dir, {
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
    assert.equal(received.opts.outPath, deckPathForDir(dir));
    assert.equal(received.opts.audioDir, join(dir, "audio"));
    assert.equal(received.cards.items[0].target, "ゼロ");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildRunDir namespaces guids from the run dir's own identity, not its display name", () => {
  // Anki matches note guids collection-wide, so a bare `a` from a template deck collides with the
  // same id anywhere else. The namespace comes from the immutable directory identity (the same one
  // the package is named after) — never from a display name, which a rebuild is free to change.
  const root = mkdtempSync(join(tmpdir(), "rb-tmpl-"));
  try {
    const dir = join(root, "templates", "numbers", "ja");
    writeUnit(dir, { targetLanguage: "ja" }, [
      { id: "a", english: "zero", target: "ゼロ", pronunciation: "zero", category: "Numbers" },
    ]);
    let received;
    rebuildRunDir(dir, {
      deckName: "Some Display Name",
      buildDeck: (cards, opts) => ((received = { cards, opts }), { noteCount: 1, mediaCount: 0 }),
    });
    assert.equal(received.opts.guidNamespace, "numbers-ja");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuildBookDir end-to-end embeds an updated clip in the real .apkg", async () => {
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
    const result = await rebuildBookDir(dir, {
      loadBookMeta: () => null,
      loadCourseMeta: () => ({ name: "E2E" }),
    });
    assert.equal(result.noteCount, 1);
    assert.ok(existsSync(deckPathForDir(dir)));
    const deck = readApkg(deckPathForDir(dir));
    const card = deck.sections[0].cards.find((c) => c.english === "hi");
    assert.deepEqual(Buffer.from(card.audioData), clip);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// There is no rebuild lock any more, so the thing that stops two dashboard-triggered rebuilds
// interleaving is that a rebuild reads the done-set and publishes the package WITHOUT ever yielding
// to the event loop. This pins that property: if anything in the rebuild path ever becomes async the
// package would not exist yet at this point, and the lost update the lock used to prevent comes
// straight back. See the warning on rebuildBookDir.
test("a rebuild reads and publishes in one event-loop turn \u2014 nothing can interleave", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-sync-"));
  try {
    writeUnit(join(dir, "chapter-0"), { chapterLabel: "A" }, [
      { id: "a", english: "A", target: "\u3042", category: "Other" },
    ]);

    const pending = rebuildBookDir(dir, { bookNameFallback: "Book" });
    // Deliberately NOT awaited yet: the whole build already ran synchronously inside that call.
    assert.ok(
      existsSync(deckPathForDir(dir)),
      "the package must exist before the returned promise is awaited",
    );
    await pending;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir orders an extras unit right after its base lesson, as a sibling", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-extras-"));
  try {
    writeUnit(
      join(dir, "chapter-0"),
      { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson 1", epubHash: "h1" },
      [{ id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" }],
    );
    writeUnit(
      join(dir, "chapter-0-extras"),
      {
        targetLanguage: "ja",
        chapterNumber: 1,
        chapterLabel: "Lesson 1 (Extras)",
        baseChapterLabel: "Lesson 1",
      },
      [
        {
          id: "a2",
          english: "one more",
          target: "いちです",
          pronunciation: "ichi desu",
          category: "Numbers",
        },
      ],
    );
    writeUnit(
      join(dir, "chapter-1"),
      { targetLanguage: "ja", chapterNumber: 2, chapterLabel: "Lesson 2", epubHash: "h1" },
      [{ id: "b", english: "two", target: "に", pronunciation: "ni", category: "Numbers" }],
    );

    let received;
    await rebuildBookDir(dir, {
      buildBookDeck: (chapterDecks, opts) => {
        received = chapterDecks;
        return { outPath: opts.outPath, noteCount: 3, chapterCount: 3, mediaCount: 0 };
      },
      loadBookMeta: () => ({ title: "Book" }),
      loadCourseMeta: () => null,
    });

    assert.deepEqual(
      received.map((c) => c.name),
      ["Lesson 1", "Lesson 1 (Extras)", "Lesson 2"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuildBookDir skips an extras unit that isn't done", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rb-extras-undone-"));
  try {
    writeUnit(
      join(dir, "chapter-0"),
      { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson 1", epubHash: "h1" },
      [{ id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" }],
    );
    writeUnit(
      join(dir, "chapter-0-extras"),
      {
        done: false,
        targetLanguage: "ja",
        chapterNumber: 1,
        chapterLabel: "Lesson 1 (Extras)",
        baseChapterLabel: "Lesson 1",
      },
      [
        {
          id: "a2",
          english: "one more",
          target: "いちです",
          pronunciation: "ichi desu",
          category: "Numbers",
        },
      ],
    );

    let received;
    await rebuildBookDir(dir, {
      buildBookDeck: (chapterDecks, opts) => {
        received = chapterDecks;
        return { outPath: opts.outPath, noteCount: 1, chapterCount: 1, mediaCount: 0 };
      },
      loadBookMeta: () => ({ title: "Book" }),
      loadCourseMeta: () => null,
    });

    assert.deepEqual(
      received.map((c) => c.name),
      ["Lesson 1"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

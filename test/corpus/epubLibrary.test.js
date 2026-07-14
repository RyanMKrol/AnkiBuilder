import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Buffer } from "buffer";
import {
  hashEpubFile,
  registerEpub,
  chapterCachePath,
  saveChapterCorpus,
  loadPriorChapterItems,
  loadBookConventions,
  saveBookConventions,
} from "../../src/corpus/epubLibrary.js";

function withTempDir(fn) {
  const libraryHomeDir = mkdtempSync(join(tmpdir(), "epub-library-"));
  const sourceDir = mkdtempSync(join(tmpdir(), "epub-source-"));
  try {
    return fn({ libraryHomeDir, sourceDir });
  } finally {
    rmSync(libraryHomeDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  }
}

function writeFixtureEpub(sourceDir, content = "fake epub bytes") {
  const epubPath = join(sourceDir, "book.epub");
  writeFileSync(epubPath, Buffer.from(content));
  return epubPath;
}

function baseCorpus(items, { chapterLabel } = {}) {
  return {
    meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: true, chapterLabel },
    items,
  };
}

test("hashEpubFile() returns a stable, content-derived hash", () => {
  withTempDir(({ sourceDir }) => {
    const epubPath = writeFixtureEpub(sourceDir);
    assert.equal(hashEpubFile(epubPath), hashEpubFile(epubPath));
    assert.equal(hashEpubFile(epubPath).length, 16);
  });
});

test("registerEpub() copies the file into the library under its content hash", () => {
  withTempDir(({ libraryHomeDir, sourceDir }) => {
    const epubPath = writeFixtureEpub(sourceDir, "book contents");

    const { epubHash } = registerEpub(epubPath, { libraryHomeDir });

    const dest = join(libraryHomeDir, "epubs", epubHash, "book.epub");
    assert.ok(existsSync(dest));
    assert.equal(readFileSync(dest, "utf-8"), "book contents");
  });
});

test("registerEpub() is idempotent — a second call does not re-copy", () => {
  withTempDir(({ libraryHomeDir, sourceDir }) => {
    const epubPath = writeFixtureEpub(sourceDir, "original contents");

    const { epubHash } = registerEpub(epubPath, { libraryHomeDir });
    const dest = join(libraryHomeDir, "epubs", epubHash, "book.epub");

    // Overwrite the cached copy with a sentinel value; if registerEpub
    // re-copies on the second call, the sentinel gets clobbered.
    writeFileSync(dest, "sentinel — should survive a second registerEpub call");

    registerEpub(epubPath, { libraryHomeDir });

    assert.equal(
      readFileSync(dest, "utf-8"),
      "sentinel — should survive a second registerEpub call",
    );
  });
});

test("chapterCachePath() returns a path scoped to the book and chapter", () => {
  withTempDir(({ libraryHomeDir }) => {
    const path = chapterCachePath("abc123", 5, { libraryHomeDir });
    assert.equal(path, join(libraryHomeDir, "epubs", "abc123", "chapters", "5.xhtml"));
  });
});

test("saveChapterCorpus()/loadPriorChapterItems() round-trip", () => {
  withTempDir(({ libraryHomeDir }) => {
    const corpus = baseCorpus(
      [{ id: "hello", english: "Hello", category: "Greetings", notes: null, target: "こんにちは" }],
      { chapterLabel: "Lesson 1: Meeting" },
    );

    saveChapterCorpus("book1", 1, corpus, { libraryHomeDir });
    const prior = loadPriorChapterItems("book1", 2, { libraryHomeDir });

    assert.equal(prior.length, 1);
    assert.equal(prior[0].id, "hello");
    assert.equal(prior[0].__chapterNumber, 1);
    assert.equal(prior[0].__chapterLabel, "Lesson 1: Meeting");
  });
});

test("loadPriorChapterItems() falls back to plain 'chapter N' wording when the stored corpus has no chapterLabel", () => {
  withTempDir(({ libraryHomeDir }) => {
    const corpus = baseCorpus([
      { id: "hello", english: "Hello", category: "Greetings", notes: null, target: "こんにちは" },
    ]);

    saveChapterCorpus("book1", 1, corpus, { libraryHomeDir });
    const prior = loadPriorChapterItems("book1", 2, { libraryHomeDir });

    assert.equal(prior[0].__chapterLabel, "chapter 1");
  });
});

test("loadPriorChapterItems() returns [] when the book has no saved chapters yet", () => {
  withTempDir(({ libraryHomeDir }) => {
    const prior = loadPriorChapterItems("never-registered", 1, { libraryHomeDir });
    assert.deepEqual(prior, []);
  });
});

test("loadPriorChapterItems() only includes chapters strictly before the given number", () => {
  withTempDir(({ libraryHomeDir }) => {
    saveChapterCorpus(
      "book1",
      1,
      baseCorpus([{ id: "a", english: "A", category: "Other", notes: null, target: "a" }]),
      { libraryHomeDir },
    );
    saveChapterCorpus(
      "book1",
      2,
      baseCorpus([{ id: "b", english: "B", category: "Other", notes: null, target: "b" }]),
      { libraryHomeDir },
    );
    // A later chapter, already saved out of order — must NOT leak into chapter 2's prior set.
    saveChapterCorpus(
      "book1",
      5,
      baseCorpus([{ id: "e", english: "E", category: "Other", notes: null, target: "e" }]),
      { libraryHomeDir },
    );

    const priorForChapter2 = loadPriorChapterItems("book1", 2, { libraryHomeDir });

    assert.deepEqual(
      priorForChapter2.map((i) => i.id),
      ["a"],
    );
  });
});

test("saveChapterCorpus() is an idempotent overwrite — re-reviewing replaces the entry", () => {
  withTempDir(({ libraryHomeDir }) => {
    saveChapterCorpus(
      "book1",
      1,
      baseCorpus([{ id: "old", english: "Old", category: "Other", notes: null, target: "old" }]),
      { libraryHomeDir },
    );
    saveChapterCorpus(
      "book1",
      1,
      baseCorpus([{ id: "new", english: "New", category: "Other", notes: null, target: "new" }]),
      { libraryHomeDir },
    );

    const prior = loadPriorChapterItems("book1", 2, { libraryHomeDir });

    assert.deepEqual(
      prior.map((i) => i.id),
      ["new"],
    );
  });
});

test("loadPriorChapterItems() keeps different books' chapters separate", () => {
  withTempDir(({ libraryHomeDir }) => {
    saveChapterCorpus(
      "bookA",
      1,
      baseCorpus([{ id: "a", english: "A", category: "Other", notes: null, target: "a" }]),
      { libraryHomeDir },
    );
    saveChapterCorpus(
      "bookB",
      1,
      baseCorpus([{ id: "b", english: "B", category: "Other", notes: null, target: "b" }]),
      { libraryHomeDir },
    );

    const priorForBookA = loadPriorChapterItems("bookA", 2, { libraryHomeDir });

    assert.deepEqual(
      priorForBookA.map((i) => i.id),
      ["a"],
    );
  });
});

test("loadBookConventions() returns null when nothing's cached yet", () => {
  withTempDir(({ libraryHomeDir }) => {
    assert.equal(loadBookConventions("never-analyzed", { libraryHomeDir }), null);
  });
});

test("saveBookConventions()/loadBookConventions() round-trip", () => {
  withTempDir(({ libraryHomeDir }) => {
    const markdown = "# Japanese Book Conventions\n\n## Placeholder Notation\nUses 〜.\n";

    saveBookConventions("book1", markdown, { libraryHomeDir });
    const loaded = loadBookConventions("book1", { libraryHomeDir });

    assert.equal(loaded, markdown);
  });
});

test("saveBookConventions() is an idempotent overwrite", () => {
  withTempDir(({ libraryHomeDir }) => {
    saveBookConventions("book1", "# Old conventions", { libraryHomeDir });
    saveBookConventions("book1", "# New conventions", { libraryHomeDir });

    assert.equal(loadBookConventions("book1", { libraryHomeDir }), "# New conventions");
  });
});

test("loadBookConventions() keeps different books separate", () => {
  withTempDir(({ libraryHomeDir }) => {
    saveBookConventions("bookA", "# Book A conventions", { libraryHomeDir });
    saveBookConventions("bookB", "# Book B conventions", { libraryHomeDir });

    assert.equal(loadBookConventions("bookA", { libraryHomeDir }), "# Book A conventions");
    assert.equal(loadBookConventions("bookB", { libraryHomeDir }), "# Book B conventions");
  });
});

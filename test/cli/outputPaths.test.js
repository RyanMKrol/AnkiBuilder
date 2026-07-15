import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { registerEpub } from "../../src/corpus/epubLibrary.js";
import { resolveBookSlug, resolveChapterRunDir } from "../../src/cli/outputPaths.js";
import { buildFixtureEpub } from "../support/epubFixtures.js";

function withTempDirs(fn) {
  const outputRoot = mkdtempSync(join(tmpdir(), "output-root-"));
  const libraryHomeDir = mkdtempSync(join(tmpdir(), "library-home-"));
  const sourceDir = mkdtempSync(join(tmpdir(), "epub-source-"));
  try {
    return fn({ outputRoot, libraryHomeDir, sourceDir });
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
    rmSync(libraryHomeDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  }
}

function fixtureManifest(dcTitles = []) {
  return {
    manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
    spineIdrefs: ["ch1"],
    extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>One</body></html>" }],
    dcTitles,
  };
}

function registerFixtureEpub(sourceDir, libraryHomeDir, title, content) {
  const epubPath = buildFixtureEpub(sourceDir, {
    ...fixtureManifest(title ? [title] : []),
    // A distinct chapter body changes the file's bytes (and so its content hash)
    // without touching the title — lets two "different books" share a base slug.
    extraFiles: [
      { name: "OEBPS/text/ch01.xhtml", content: content || "<html><body>One</body></html>" },
    ],
  });
  const { epubHash } = registerEpub(epubPath, { libraryHomeDir });
  return { epubPath, epubHash };
}

test("resolveBookSlug() creates output/<slug>/, writes a .epub-hash marker, and persists the slug", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");

    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    assert.equal(slug, "my-book");
    assert.ok(existsSync(join(outputRoot, "my-book")));
    assert.equal(readFileSync(join(outputRoot, "my-book", ".epub-hash"), "utf-8"), epubHash);

    const meta = JSON.parse(
      readFileSync(join(libraryHomeDir, "epubs", epubHash, "book.json"), "utf-8"),
    );
    assert.equal(meta.slug, "my-book");
  });
});

test("resolveBookSlug() falls back to slugifying the hash when the EPUB has no title", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, null);

    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    assert.equal(slug, epubHash);
  });
});

test("resolveBookSlug() reuses the persisted slug on a second call, without re-deriving it", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");
    const slug1 = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    // A nonexistent epubPath on the second call — if resolveBookSlug took the
    // "recompute from title" path, getBookTitle would throw on this path (ENOENT).
    // Succeeding here proves the fast, persisted-slug reuse path was taken instead.
    const slug2 = resolveBookSlug(outputRoot, join(sourceDir, "does-not-exist.epub"), epubHash, {
      libraryHomeDir,
    });

    assert.equal(slug2, slug1);
  });
});

test("resolveBookSlug() disambiguates two different books that slugify to the same name", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const bookA = registerFixtureEpub(sourceDir, libraryHomeDir, "Same Title", "<html>A</html>");
    const bookB = registerFixtureEpub(sourceDir, libraryHomeDir, "Same Title", "<html>B</html>");
    const bookC = registerFixtureEpub(sourceDir, libraryHomeDir, "Same Title", "<html>C</html>");
    assert.notEqual(bookA.epubHash, bookB.epubHash);
    assert.notEqual(bookB.epubHash, bookC.epubHash);

    const slugA = resolveBookSlug(outputRoot, bookA.epubPath, bookA.epubHash, { libraryHomeDir });
    const slugB = resolveBookSlug(outputRoot, bookB.epubPath, bookB.epubHash, { libraryHomeDir });
    const slugC = resolveBookSlug(outputRoot, bookC.epubPath, bookC.epubHash, { libraryHomeDir });

    assert.equal(slugA, "same-title");
    assert.equal(slugB, "same-title-2");
    assert.equal(slugC, "same-title-3");
  });
});

test("resolveBookSlug() reuses the base slug if its folder+marker already exist but no slug was persisted yet", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");

    // Simulate the folder+marker already existing (e.g. a previous resolution) while
    // book.json's own slug field was never persisted (or got cleared) — the
    // "matches this epubHash" branch of the collision loop should still find it.
    mkdirSync(join(outputRoot, "my-book"), { recursive: true });
    writeFileSync(join(outputRoot, "my-book", ".epub-hash"), epubHash);

    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    assert.equal(slug, "my-book");
  });
});

function writeChapterCorpus(bookDir, seq, { epubHash, chapterNumber }) {
  const dir = join(bookDir, `chapter-${seq}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "corpus.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", sourceType: "epub", reviewed: true, epubHash, chapterNumber },
      items: [],
    }),
  );
}

test("resolveChapterRunDir() allocates chapter-0 when no chapters exist yet", () => {
  withTempDirs(({ outputRoot }) => {
    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 1);
    assert.equal(runDir, join(outputRoot, "my-book", "chapter-0"));
  });
});

test("resolveChapterRunDir() allocates the next index for a new chapter of an existing book", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "my-book");
    writeChapterCorpus(bookDir, 0, { epubHash: "hash-a", chapterNumber: 14 });

    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 15);

    assert.equal(runDir, join(bookDir, "chapter-1"));
  });
});

test("resolveChapterRunDir() reuses the existing folder for the same (epubHash, chapterNumber)", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "my-book");
    writeChapterCorpus(bookDir, 0, { epubHash: "hash-a", chapterNumber: 14 });
    writeChapterCorpus(bookDir, 1, { epubHash: "hash-a", chapterNumber: 15 });

    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 14);

    assert.equal(runDir, join(bookDir, "chapter-0"));
  });
});

test("resolveChapterRunDir() tolerates gaps — never backfills a vacated index", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "my-book");
    writeChapterCorpus(bookDir, 0, { epubHash: "hash-a", chapterNumber: 11 });
    writeChapterCorpus(bookDir, 2, { epubHash: "hash-a", chapterNumber: 15 });

    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 16);

    assert.equal(runDir, join(bookDir, "chapter-3"));
  });
});

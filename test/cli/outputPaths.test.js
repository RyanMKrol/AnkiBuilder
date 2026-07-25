import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir, hostname } from "os";
import { join } from "path";
import { registerEpub } from "../../src/corpus/epubLibrary.js";
import {
  resolveBookSlug,
  resolveChapterRunDir,
  resolveCourseSlug,
  resolveLessonRunDir,
  resolveTemplateRunDir,
  nextLessonNumber,
  lessonNumberInUse,
  listCourses,
  loadCourseMeta,
  materializeBookInOutput,
  loadBookMarker,
  listBooks,
  resolveBookEpubPath,
} from "../../src/cli/outputPaths.js";
import { withClaim, readClaim } from "../../src/cli/runClaim.js";
import { buildFixtureEpub } from "../support/epubFixtures.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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

test("resolveBookSlug() creates output/epubs/<slug>/, writes a .epub-hash marker, and persists the slug", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");

    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    assert.equal(slug, "my-book");
    assert.ok(existsSync(join(outputRoot, "epubs", "my-book")));
    assert.equal(
      readFileSync(join(outputRoot, "epubs", "my-book", ".epub-hash"), "utf-8"),
      epubHash,
    );

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
    mkdirSync(join(outputRoot, "epubs", "my-book"), { recursive: true });
    writeFileSync(join(outputRoot, "epubs", "my-book", ".epub-hash"), epubHash);

    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    assert.equal(slug, "my-book");
  });
});

test("materializeBookInOutput() copies the EPUB into the book folder and writes a book.json marker", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");
    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    const dest = materializeBookInOutput(outputRoot, slug, epubPath, epubHash, "ja");

    assert.equal(dest, join(outputRoot, "epubs", slug, "book.epub"));
    assert.ok(existsSync(dest));
    assert.deepEqual(readFileSync(dest), readFileSync(epubPath));
    assert.deepEqual(loadBookMarker(join(outputRoot, "epubs", slug)), {
      title: "My Book",
      slug,
      epubHash,
      targetLanguage: "ja",
    });
  });
});

test("materializeBookInOutput() is idempotent for the copy but refreshes the marker language", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");
    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    const dest = materializeBookInOutput(outputRoot, slug, epubPath, epubHash, "ja");

    // Second call with the already-copied EPUB as the source (the `--book` case) must not
    // throw on a self-copy, and should update the recorded target language.
    materializeBookInOutput(outputRoot, slug, dest, epubHash, "es");

    assert.equal(loadBookMarker(join(outputRoot, "epubs", slug)).targetLanguage, "es");
  });
});

test("listBooks() returns worked-on books and ignores non-book folders", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");
    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    materializeBookInOutput(outputRoot, slug, epubPath, epubHash, "ja");
    // A stray non-book folder alongside the books — must be ignored.
    mkdirSync(join(outputRoot, "epubs", "some-plain-folder"), { recursive: true });

    assert.deepEqual(listBooks(outputRoot), [
      {
        slug,
        title: "My Book",
        epubHash,
        targetLanguage: "ja",
        epubPath: join(outputRoot, "epubs", slug, "book.epub"),
      },
    ]);
  });
});

test("listBooks() surfaces a legacy book (only a .epub-hash marker) with a null epubPath", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = join(outputRoot, "epubs", "legacy-book");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".epub-hash"), "deadbeefcafe0000");

    assert.deepEqual(listBooks(outputRoot), [
      {
        slug: "legacy-book",
        title: null,
        epubHash: "deadbeefcafe0000",
        targetLanguage: null,
        epubPath: null,
      },
    ]);
  });
});

test("listBooks() returns an empty array when outputRoot has no epubs folder", () => {
  withTempDirs(({ outputRoot }) => {
    assert.deepEqual(listBooks(join(outputRoot, "does-not-exist")), []);
  });
});

test("resolveBookEpubPath() prefers the book's own output copy", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");
    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    materializeBookInOutput(outputRoot, slug, epubPath, epubHash, "ja");

    assert.equal(
      resolveBookEpubPath(outputRoot, slug, { libraryHomeDir }),
      join(outputRoot, "epubs", slug, "book.epub"),
    );
  });
});

test("resolveBookEpubPath() falls back to the local library copy for a legacy book", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerFixtureEpub(sourceDir, libraryHomeDir, "My Book");
    // Simulate a book worked on before the output-copy existed: only the .epub-hash
    // marker in output, but the EPUB still cached in the local library.
    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });

    assert.equal(
      resolveBookEpubPath(outputRoot, slug, { libraryHomeDir }),
      join(libraryHomeDir, "epubs", epubHash, "book.epub"),
    );
  });
});

test("resolveBookEpubPath() throws when neither an output copy nor a library copy exists", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = join(outputRoot, "epubs", "orphan-book");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".epub-hash"), "deadbeefcafe0000");

    assert.throws(() => resolveBookEpubPath(outputRoot, "orphan-book"), /no EPUB found for book/);
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

test("resolveTemplateRunDir() places a deck under templates/<template>/<language>/", () => {
  withTempDirs(({ outputRoot }) => {
    const runDir = resolveTemplateRunDir(outputRoot, "numbers", "ja");
    assert.equal(runDir, join(outputRoot, "templates", "numbers", "ja"));
  });
});

test("resolveTemplateRunDir() is a pure deterministic function of (template, language)", () => {
  withTempDirs(({ outputRoot }) => {
    // Same inputs → same folder (idempotent), and different pairs never collide.
    assert.equal(
      resolveTemplateRunDir(outputRoot, "numbers", "ja"),
      resolveTemplateRunDir(outputRoot, "numbers", "ja"),
    );
    assert.notEqual(
      resolveTemplateRunDir(outputRoot, "numbers", "ja"),
      resolveTemplateRunDir(outputRoot, "numbers", "es"),
    );
    assert.notEqual(
      resolveTemplateRunDir(outputRoot, "numbers", "ja"),
      resolveTemplateRunDir(outputRoot, "travel-essentials", "ja"),
    );
  });
});

test("resolveTemplateRunDir() slugifies a full language name into a stable folder", () => {
  withTempDirs(({ outputRoot }) => {
    const runDir = resolveTemplateRunDir(outputRoot, "numbers", "Japanese");
    assert.equal(runDir, join(outputRoot, "templates", "numbers", "japanese"));
  });
});

test("resolveTemplateRunDir() does not create the directory (the corpus write does)", () => {
  withTempDirs(({ outputRoot }) => {
    const runDir = resolveTemplateRunDir(outputRoot, "numbers", "ja");
    assert.equal(existsSync(runDir), false);
  });
});

test("resolveChapterRunDir() allocates chapter-0 when no chapters exist yet", () => {
  withTempDirs(({ outputRoot }) => {
    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 1);
    assert.equal(runDir, join(outputRoot, "epubs", "my-book", "chapter-0"));
  });
});

test("resolveChapterRunDir() allocates the next index for a new chapter of an existing book", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "epubs", "my-book");
    writeChapterCorpus(bookDir, 0, { epubHash: "hash-a", chapterNumber: 14 });

    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 15);

    assert.equal(runDir, join(bookDir, "chapter-1"));
  });
});

test("resolveChapterRunDir() reuses the existing folder for the same (epubHash, chapterNumber)", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "epubs", "my-book");
    writeChapterCorpus(bookDir, 0, { epubHash: "hash-a", chapterNumber: 14 });
    writeChapterCorpus(bookDir, 1, { epubHash: "hash-a", chapterNumber: 15 });

    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 14);

    assert.equal(runDir, join(bookDir, "chapter-0"));
  });
});

test("resolveChapterRunDir() tolerates gaps — never backfills a vacated index", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "epubs", "my-book");
    writeChapterCorpus(bookDir, 0, { epubHash: "hash-a", chapterNumber: 11 });
    writeChapterCorpus(bookDir, 2, { epubHash: "hash-a", chapterNumber: 15 });

    const runDir = resolveChapterRunDir(outputRoot, "my-book", "hash-a", 16);

    assert.equal(runDir, join(bookDir, "chapter-3"));
  });
});

test("resolveCourseSlug() creates output/courses/<slug>/ and writes a course.json marker", () => {
  withTempDirs(({ outputRoot }) => {
    const slug = resolveCourseSlug(outputRoot, "Intensive Japanese 1", "ja");

    assert.equal(slug, "intensive-japanese-1");
    assert.deepEqual(loadCourseMeta(join(outputRoot, "courses", slug)), {
      name: "Intensive Japanese 1",
      targetLanguage: "ja",
    });
  });
});

test("resolveCourseSlug() reuses the existing course folder on a case-insensitive name match", () => {
  withTempDirs(({ outputRoot }) => {
    const slug1 = resolveCourseSlug(outputRoot, "Intensive Japanese 1", "ja");
    const slug2 = resolveCourseSlug(outputRoot, "intensive japanese 1", "ja");

    assert.equal(slug2, slug1);
  });
});

test("resolveCourseSlug() disambiguates a name collision with an unrelated existing folder", () => {
  withTempDirs(({ outputRoot }) => {
    // Another course (or stray folder) already occupying that slug under lesson/.
    mkdirSync(join(outputRoot, "courses", "intensive-japanese-1"), { recursive: true });

    const slug = resolveCourseSlug(outputRoot, "Intensive Japanese 1", "ja");

    assert.equal(slug, "intensive-japanese-1-2");
  });
});

test("listCourses() returns every course.json-marked folder, ignoring plain (e.g. EPUB) folders", () => {
  withTempDirs(({ outputRoot }) => {
    resolveCourseSlug(outputRoot, "Intensive Japanese 1", "ja");
    // A plain (markerless) folder alongside the courses under lesson/ — must be ignored.
    mkdirSync(join(outputRoot, "courses", "some-plain-folder"), { recursive: true });

    const courses = listCourses(outputRoot);

    assert.deepEqual(courses, [
      { slug: "intensive-japanese-1", name: "Intensive Japanese 1", targetLanguage: "ja" },
    ]);
  });
});

test("listCourses() returns an empty array when outputRoot doesn't exist yet", () => {
  withTempDirs(({ outputRoot }) => {
    assert.deepEqual(listCourses(join(outputRoot, "does-not-exist")), []);
  });
});

function writeLessonCorpus(courseDir, seq, { courseSlug, lessonNumber }) {
  const dir = join(courseDir, `lesson-${seq}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "corpus.json"),
    JSON.stringify({
      meta: {
        targetLanguage: "ja",
        sourceType: "manual",
        reviewed: true,
        courseSlug,
        chapterNumber: lessonNumber,
      },
      items: [],
    }),
  );
}

test("resolveLessonRunDir() allocates lesson-0 when no lessons exist yet", () => {
  withTempDirs(({ outputRoot }) => {
    const runDir = resolveLessonRunDir(outputRoot, "my-course", 1);
    assert.equal(runDir, join(outputRoot, "courses", "my-course", "lesson-0"));
  });
});

test("resolveLessonRunDir() allocates the next index for a new lesson of an existing course", () => {
  withTempDirs(({ outputRoot }) => {
    const courseDir = join(outputRoot, "courses", "my-course");
    writeLessonCorpus(courseDir, 0, { courseSlug: "my-course", lessonNumber: 1 });

    const runDir = resolveLessonRunDir(outputRoot, "my-course", 2);

    assert.equal(runDir, join(courseDir, "lesson-1"));
  });
});

test("resolveLessonRunDir() reuses the existing folder for the same (courseSlug, lessonNumber)", () => {
  withTempDirs(({ outputRoot }) => {
    const courseDir = join(outputRoot, "courses", "my-course");
    writeLessonCorpus(courseDir, 0, { courseSlug: "my-course", lessonNumber: 1 });
    writeLessonCorpus(courseDir, 1, { courseSlug: "my-course", lessonNumber: 2 });

    const runDir = resolveLessonRunDir(outputRoot, "my-course", 1);

    assert.equal(runDir, join(courseDir, "lesson-0"));
  });
});

test("resolveLessonRunDir() tolerates gaps — never backfills a vacated index", () => {
  withTempDirs(({ outputRoot }) => {
    const courseDir = join(outputRoot, "courses", "my-course");
    writeLessonCorpus(courseDir, 0, { courseSlug: "my-course", lessonNumber: 1 });
    writeLessonCorpus(courseDir, 2, { courseSlug: "my-course", lessonNumber: 3 });

    const runDir = resolveLessonRunDir(outputRoot, "my-course", 4);

    assert.equal(runDir, join(courseDir, "lesson-3"));
  });
});

test("nextLessonNumber() suggests 1 for a brand-new course", () => {
  withTempDirs(({ outputRoot }) => {
    assert.equal(nextLessonNumber(outputRoot, "my-course"), 1);
  });
});

test("nextLessonNumber() suggests one past the highest existing lesson number", () => {
  withTempDirs(({ outputRoot }) => {
    const courseDir = join(outputRoot, "courses", "my-course");
    writeLessonCorpus(courseDir, 0, { courseSlug: "my-course", lessonNumber: 1 });
    writeLessonCorpus(courseDir, 1, { courseSlug: "my-course", lessonNumber: 2 });

    assert.equal(nextLessonNumber(outputRoot, "my-course"), 3);
  });
});

// --- concurrency: run-directory reservation -------------------------------------------
// resolveChapterRunDir used to compute max(seq)+1 and return the path WITHOUT creating it,
// so two runs started before either wrote its corpus.json both got `chapter-7` and the
// second silently destroyed the first. These pin the reservation that fixes it.

const DEAD_PID = 999999;

function writeRawClaim(dir, claim) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "claim.json"), JSON.stringify(claim, null, 2) + "\n");
}

test("resolveChapterRunDir reserves: two resolves with no corpus in between get different dirs", () => {
  withTempDirs(({ outputRoot }) => {
    const first = resolveChapterRunDir(outputRoot, "book", "hash", 10);
    const second = resolveChapterRunDir(outputRoot, "book", "hash", 11);
    assert.notEqual(first, second, "the second run must not be handed the first run's directory");
    assert.ok(existsSync(first) && existsSync(second), "a reserved directory exists immediately");
  });
});

test("resolveChapterRunDir still reuses a directory whose corpus matches the chapter", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = resolveChapterRunDir(outputRoot, "book", "hash", 10);
    writeFileSync(
      join(dir, "corpus.json"),
      JSON.stringify({ meta: { epubHash: "hash", chapterNumber: 10 }, items: [] }),
    );
    assert.equal(resolveChapterRunDir(outputRoot, "book", "hash", 10), dir);
  });
});

test("resolveChapterRunDir reclaims its own crashed attempt (stale claim, no corpus)", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = resolveChapterRunDir(outputRoot, "book", "hash", 10);
    // Simulate the process having died mid-assemble: claim left behind, no corpus written.
    writeRawClaim(dir, {
      kind: "chapter",
      epubHash: "hash",
      chapterNumber: 10,
      pid: DEAD_PID,
      host: hostname(),
      startedAt: new Date().toISOString(),
    });
    assert.equal(
      resolveChapterRunDir(outputRoot, "book", "hash", 10),
      dir,
      "a retry must reuse the crashed attempt's directory, not leak a new sequence number",
    );
  });
});

// The test whose absence hid a real bug for two commits. Every test above hand-writes its claim
// with writeRawClaim, so none of them exercised what a REAL assemble does: reserve the directory,
// then immediately wrap the stage in withClaim. withClaim used to replace the reservation's claim
// with a bare {stage}, erasing the identity these rules match on — so the reclaim below silently
// leaked a new sequence number in production while the hand-written tests stayed green.
test("a crashed stage's directory is reclaimed even though withClaim rewrote its claim", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = resolveChapterRunDir(outputRoot, "book", "hash", 10);
    assert.throws(
      () =>
        withClaim(
          dir,
          { stage: "assemble" },
          () => {
            throw new Error("crashed mid-extraction");
          },
          { clearOnFailure: false },
        ),
      /crashed mid-extraction/,
    );
    // The process that wrote it is "gone": re-stamp the surviving claim with a dead pid.
    writeRawClaim(dir, { ...readClaim(dir), pid: DEAD_PID });

    assert.equal(
      resolveChapterRunDir(outputRoot, "book", "hash", 10),
      dir,
      "a retry must reuse the crashed attempt's directory, not leak a new sequence number",
    );
  });
});

test("resolveChapterRunDir refuses a chapter another live process is already building", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = resolveChapterRunDir(outputRoot, "book", "hash", 10);
    writeRawClaim(dir, {
      kind: "chapter",
      epubHash: "hash",
      chapterNumber: 10,
      pid: process.pid,
      host: hostname(),
      startedAt: new Date().toISOString(),
    });
    assert.throws(
      () => resolveChapterRunDir(outputRoot, "book", "hash", 10),
      /already being built/,
      "the second run must fail immediately rather than pay for the same extraction",
    );
  });
});

test("resolveChapterRunDir allocates normally when a live claim is for a DIFFERENT chapter", () => {
  withTempDirs(({ outputRoot }) => {
    const busy = resolveChapterRunDir(outputRoot, "book", "hash", 10);
    writeRawClaim(busy, {
      kind: "chapter",
      epubHash: "hash",
      chapterNumber: 10,
      pid: process.pid,
      host: hostname(),
      startedAt: new Date().toISOString(),
    });
    const other = resolveChapterRunDir(outputRoot, "book", "hash", 11);
    assert.notEqual(other, busy);
  });
});

test("resolveChapterRunDir skips a pre-existing sequence number rather than reusing it", () => {
  withTempDirs(({ outputRoot }) => {
    const bookDir = join(outputRoot, "epubs", "book");
    mkdirSync(join(bookDir, "chapter-3"), { recursive: true });
    const dir = resolveChapterRunDir(outputRoot, "book", "hash", 1);
    assert.equal(dir, join(bookDir, "chapter-4"));
  });
});

test("resolveLessonRunDir reserves too", () => {
  withTempDirs(({ outputRoot }) => {
    const first = resolveLessonRunDir(outputRoot, "course", 1);
    const second = resolveLessonRunDir(outputRoot, "course", 2);
    assert.notEqual(first, second);
    assert.ok(existsSync(first) && existsSync(second));
  });
});

test("lessonNumberInUse reports a number a course has already built", () => {
  withTempDirs(({ outputRoot }) => {
    const dir = resolveLessonRunDir(outputRoot, "course", 4);
    assert.equal(lessonNumberInUse(outputRoot, "course", 4), false, "reserved but not yet built");
    writeFileSync(
      join(dir, "corpus.json"),
      JSON.stringify({ meta: { courseSlug: "course", chapterNumber: 4 }, items: [] }),
    );
    assert.equal(lessonNumberInUse(outputRoot, "course", 4), true);
    assert.equal(lessonNumberInUse(outputRoot, "course", 5), false);
  });
});

test("resolveBookSlug gives two different books the same title different slugs", () => {
  withTempDirs(({ outputRoot, libraryHomeDir }) => {
    const dirA = mkdtempSync(join(tmpdir(), "epub-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "epub-b-"));
    try {
      const epubA = buildFixtureEpub(dirA, {
        opfPath: "OEBPS/content.opf",
        manifestItems: [{ id: "c1", href: "c1.xhtml" }],
        spineIdrefs: ["c1"],
        dcTitles: ["Shared Title"],
        extraFiles: [{ name: "OEBPS/c1.xhtml", content: "<html><body>A</body></html>" }],
      });
      const epubB = buildFixtureEpub(dirB, {
        opfPath: "OEBPS/content.opf",
        manifestItems: [{ id: "c1", href: "c1.xhtml" }],
        spineIdrefs: ["c1"],
        dcTitles: ["Shared Title"],
        extraFiles: [
          { name: "OEBPS/c1.xhtml", content: "<html><body>B — different bytes</body></html>" },
        ],
      });
      const { epubHash: hashA } = registerEpub(epubA, { libraryHomeDir });
      const { epubHash: hashB } = registerEpub(epubB, { libraryHomeDir });
      assert.notEqual(hashA, hashB);

      const slugA = resolveBookSlug(outputRoot, epubA, hashA, { libraryHomeDir });
      const slugB = resolveBookSlug(outputRoot, epubB, hashB, { libraryHomeDir });
      assert.notEqual(slugA, slugB, "a second book must not take the first book's folder");
      assert.equal(
        readFileSync(join(outputRoot, "epubs", slugA, ".epub-hash"), "utf-8").trim(),
        hashA,
      );
      assert.equal(
        readFileSync(join(outputRoot, "epubs", slugB, ".epub-hash"), "utf-8").trim(),
        hashB,
      );
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});

// Real processes, because the reservation is a filesystem compare-and-swap: an in-process
// loop would never exercise two mkdirs racing for the same name.
test("concurrent processes never reserve the same run directory twice", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "output-root-race-"));
  try {
    const childPath = join(outputRoot, "reserve.mjs");
    const modulePath = fileURLToPath(new URL("../../src/cli/outputPaths.js", import.meta.url));
    writeFileSync(
      childPath,
      `import { resolveLessonRunDir } from ${JSON.stringify(modulePath)};
const [root, base, count] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const dirs = [];
for (let i = 0; i < count; i++) dirs.push(resolveLessonRunDir(root, "course", base + i));
process.stdout.write(JSON.stringify(dirs));
`,
    );

    const PER_CHILD = 20;
    const results = await Promise.all(
      [0, 1, 2].map((n) =>
        promisify(execFile)(process.execPath, [
          childPath,
          outputRoot,
          String(n * PER_CHILD + 1),
          String(PER_CHILD),
        ]).then(({ stdout }) => JSON.parse(stdout)),
      ),
    );

    const all = results.flat();
    assert.equal(all.length, 3 * PER_CHILD);
    assert.equal(
      new Set(all).size,
      all.length,
      "two processes were handed the same run directory — reservation is not atomic",
    );
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  renderTaughtIndexPrompt,
  parseTaughtIndexResponse,
  getTaughtIndex,
  buildTaughtIndex,
} from "../../src/corpus/epubTaughtIndex.js";
import { loadTaughtIndex, hashEpubFile } from "../../src/corpus/epubLibrary.js";
import { buildFixtureEpub } from "../support/epubFixtures.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-taught-index-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fixtureBook(dir, chapterCount = 3) {
  const manifestItems = [];
  const spineIdrefs = [];
  const extraFiles = [];
  for (let i = 1; i <= chapterCount; i++) {
    manifestItems.push({ id: `ch${i}`, href: `text/ch${i}.xhtml` });
    spineIdrefs.push(`ch${i}`);
    extraFiles.push({
      name: `OEBPS/text/ch${i}.xhtml`,
      content: `<html><body>Chapter ${i}</body></html>`,
    });
  }
  return buildFixtureEpub(dir, { manifestItems, spineIdrefs, extraFiles });
}

function validIndexResponse(chapterNumbers) {
  return JSON.stringify({
    chapters: chapterNumbers.map((n) => ({
      chapter: n,
      label: n === 2 ? "Lesson 2" : null,
      teaches: n === 2 ? ["shopping-places vocabulary: デパート"] : [],
    })),
  });
}

test("renderTaughtIndexPrompt() substitutes every placeholder, listing chapters with numbers", () => {
  const rendered = renderTaughtIndexPrompt({
    targetLanguage: "Japanese",
    chapterFilePaths: [
      { number: 1, path: "/tmp/ch1.xhtml" },
      { number: 2, path: "/tmp/ch2.xhtml" },
    ],
  });

  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
  assert.match(rendered, /Japanese/);
  assert.match(rendered, /- chapter 1: \/tmp\/ch1\.xhtml/);
  assert.match(rendered, /- chapter 2: \/tmp\/ch2\.xhtml/);
});

test("parseTaughtIndexResponse() accepts full coverage and normalizes/sorts entries", () => {
  const raw = JSON.stringify({
    chapters: [
      { chapter: 2, teaches: ["particle で"] },
      { chapter: 1, label: "Intro", teaches: [] },
    ],
  });

  const index = parseTaughtIndexResponse(raw, [1, 2]);

  assert.deepEqual(index.chapters, [
    { chapter: 1, label: "Intro", teaches: [] },
    { chapter: 2, label: null, teaches: ["particle で"] },
  ]);
});

test("parseTaughtIndexResponse() rejects a response missing spine chapters (partial book read)", () => {
  const raw = JSON.stringify({ chapters: [{ chapter: 1, teaches: [] }] });

  assert.throws(() => parseTaughtIndexResponse(raw, [1, 2, 3]), /missing 2 chapter\(s\).*2, 3/);
});

test("parseTaughtIndexResponse() rejects malformed entries", () => {
  const raw = JSON.stringify({ chapters: [{ chapter: "one", teaches: [] }] });
  assert.throws(() => parseTaughtIndexResponse(raw, [1]), /number chapter/);

  const rawBadTeaches = JSON.stringify({ chapters: [{ chapter: 1, teaches: [42] }] });
  assert.throws(() => parseTaughtIndexResponse(rawBadTeaches, [1]), /string array teaches/);
});

test("getTaughtIndex({build:true}) builds once, caches under the book hash, and reuses the cache", () => {
  withTempDir((dir) => {
    const epubPath = fixtureBook(dir, 3);
    let calls = 0;

    const index = getTaughtIndex({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      build: true,
      runClaude: () => {
        calls++;
        return validIndexResponse([1, 2, 3]);
      },
    });

    assert.equal(calls, 1);
    assert.equal(index.chapters.length, 3);
    assert.deepEqual(loadTaughtIndex(hashEpubFile(epubPath), { libraryHomeDir: dir }), index);

    const again = getTaughtIndex({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      build: true,
      runClaude: () => {
        calls++;
        return validIndexResponse([1, 2, 3]);
      },
    });

    assert.equal(calls, 1); // cache hit — no second model call
    assert.deepEqual(again, index);
  });
});

test("getTaughtIndex({build:true}) returns null and caches nothing when the build fails validation", () => {
  withTempDir((dir) => {
    const epubPath = fixtureBook(dir, 3);
    const logs = [];

    const index = getTaughtIndex({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      build: true,
      log: (msg) => logs.push(msg),
      runClaude: () => validIndexResponse([1, 2]), // chapter 3 missing
    });

    assert.equal(index, null);
    assert.equal(loadTaughtIndex(hashEpubFile(epubPath), { libraryHomeDir: dir }), null);
    assert.ok(logs.some((msg) => msg.includes("taught index: build failed")));
  });
});

test("getTaughtIndex() does NOT build by default — a lesson build never pays for a whole-book pass", () => {
  withTempDir((dir) => {
    const epubPath = fixtureBook(dir, 3);
    let calls = 0;

    const index = getTaughtIndex({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => {
        calls++;
        return validIndexResponse([1, 2, 3]);
      },
    });

    // The regression this guards: the index used to be built lazily by whichever lesson needed it
    // first, so a 57-chapter model call could fire in the middle of building one lesson — and when
    // it exhausted the usage window it took the rest of that lesson's passes with it.
    assert.equal(index, null);
    assert.equal(calls, 0);
    assert.equal(loadTaughtIndex(hashEpubFile(epubPath), { libraryHomeDir: dir }), null);
  });
});

test("getTaughtIndex() reads a cached index without building, even with build off", () => {
  withTempDir((dir) => {
    const epubPath = fixtureBook(dir, 2);
    buildTaughtIndex({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => validIndexResponse([1, 2]),
    });

    let calls = 0;
    const index = getTaughtIndex({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => {
        calls++;
        return validIndexResponse([1, 2]);
      },
    });

    assert.equal(calls, 0);
    assert.equal(index.chapters.length, 2);
  });
});

test("buildTaughtIndex() THROWS on a response that misses part of the spine, and caches nothing", () => {
  withTempDir((dir) => {
    const epubPath = fixtureBook(dir, 3);
    // Unlike getTaughtIndex, the explicit build reports its failure to the operator who asked for
    // it, rather than swallowing it into a null the caller has to interpret.
    assert.throws(
      () =>
        buildTaughtIndex({
          epubPath,
          targetLanguage: "Japanese",
          libraryHomeDir: dir,
          runClaude: () => validIndexResponse([1, 2]),
        }),
      /missing 1 chapter/,
    );
    assert.equal(loadTaughtIndex(hashEpubFile(epubPath), { libraryHomeDir: dir }), null);
  });
});

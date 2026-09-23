import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  registerEpub,
  loadBookMeta,
  saveChapterCorpus,
  loadPriorChapterItems,
} from "../../src/corpus/epubLibrary.js";
import {
  resolveBookSlug,
  materializeBookInOutput,
  listBooks,
  assertCollectionKind,
} from "../../src/cli/outputPaths.js";
import { collectionDeckKind } from "../../src/model/deckKind.js";
import { resolveBookName } from "../../src/deck/rebuild.js";
import { buildFixtureEpub } from "../support/epubFixtures.js";

// A collection is a book plus a deck kind (DECISIONS.md, 2026-09-23;
// docs/designs/reading-decks/01-collection-identity.md). One book file carries a speaking collection
// and a reading collection, and neither can see the other's folder or dedup corpora.

function withTempDirs(fn) {
  const dirs = {
    outputRoot: mkdtempSync(join(tmpdir(), "kind-output-")),
    libraryHomeDir: mkdtempSync(join(tmpdir(), "kind-library-")),
    sourceDir: mkdtempSync(join(tmpdir(), "kind-source-")),
  };
  try {
    return fn(dirs);
  } finally {
    for (const dir of Object.values(dirs)) rmSync(dir, { recursive: true, force: true });
  }
}

function registerBook(sourceDir, libraryHomeDir) {
  const epubPath = buildFixtureEpub(sourceDir, {
    manifestItems: [{ id: "ch1", href: "text/ch01.xhtml", mediaType: "application/xhtml+xml" }],
    spineIdrefs: ["ch1"],
    dcTitles: ["Genki"],
    extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>One</body></html>" }],
  });
  const { epubHash } = registerEpub(epubPath, { libraryHomeDir });
  return { epubPath, epubHash };
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

test("one book gets a speaking and a reading collection, each in its own folder", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerBook(sourceDir, libraryHomeDir);
    const speaking = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    const reading = resolveBookSlug(outputRoot, epubPath, epubHash, {
      libraryHomeDir,
      deckKind: "reading",
    });
    assert.equal(speaking, "genki");
    assert.equal(reading, "genki-reading");

    // Stable on a second resolve, for both kinds.
    assert.equal(resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir }), speaking);
    assert.equal(
      resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir, deckKind: "reading" }),
      reading,
    );

    // The library keeps `slug` meaning the speaking collection, and records the other kind apart.
    const meta = loadBookMeta(epubHash, { libraryHomeDir });
    assert.equal(meta.slug, "genki");
    assert.deepEqual(meta.slugByKind, { reading: "genki-reading" });

    materializeBookInOutput(outputRoot, speaking, epubPath, epubHash, "ja");
    materializeBookInOutput(outputRoot, reading, epubPath, epubHash, "ja", { deckKind: "reading" });
    const speakingMarker = readJson(join(outputRoot, "epubs", speaking, "book.json"));
    const readingMarker = readJson(join(outputRoot, "epubs", reading, "book.json"));
    assert.equal("deckKind" in speakingMarker, false);
    assert.equal(readingMarker.deckKind, "reading");
    // Distinct guid namespaces, so the two collections' notes never overwrite each other in Anki.
    assert.notEqual(speakingMarker.guidNamespace, readingMarker.guidNamespace);

    assert.deepEqual(
      listBooks(outputRoot).map((b) => [b.slug, b.deckKind]),
      [
        ["genki", "speaking-listening"],
        ["genki-reading", "reading"],
      ],
    );
  });
});

test("the reading marker keeps its kind across a refresh, and a kind never changes", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerBook(sourceDir, libraryHomeDir);
    const opts = { libraryHomeDir, deckKind: "reading" };
    const reading = resolveBookSlug(outputRoot, epubPath, epubHash, opts);
    materializeBookInOutput(outputRoot, reading, epubPath, epubHash, "ja", { deckKind: "reading" });
    materializeBookInOutput(outputRoot, reading, epubPath, epubHash, "ja", { deckKind: "reading" });
    assert.equal(readJson(join(outputRoot, "epubs", reading, "book.json")).deckKind, "reading");

    // A speaking step aimed at the reading collection is refused, naming the right skill.
    assert.throws(
      () => materializeBookInOutput(outputRoot, reading, epubPath, epubHash, "ja"),
      /reading collection.*build-reading-deck/s,
    );
    const speaking = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    materializeBookInOutput(outputRoot, speaking, epubPath, epubHash, "ja");
    assert.throws(
      () =>
        materializeBookInOutput(outputRoot, speaking, epubPath, epubHash, "ja", {
          deckKind: "reading",
        }),
      /speaking-listening collection.*build-anki-deck/s,
    );
  });
});

test("each kind reads and writes only its own dedup corpora", () => {
  withTempDirs(({ libraryHomeDir }) => {
    const corpus = (target) => ({ meta: { chapterLabel: "L1" }, items: [{ id: target, target }] });
    saveChapterCorpus("book", 1, corpus("speaking-word"), { libraryHomeDir });
    saveChapterCorpus("book", 1, corpus("reading-word"), { libraryHomeDir, deckKind: "reading" });

    assert.ok(existsSync(join(libraryHomeDir, "epubs", "book", "corpora", "1.json")));
    assert.ok(existsSync(join(libraryHomeDir, "epubs", "book", "reading", "corpora", "1.json")));

    const speaking = loadPriorChapterItems("book", 2, { libraryHomeDir });
    const reading = loadPriorChapterItems("book", 2, { libraryHomeDir, deckKind: "reading" });
    assert.deepEqual(
      speaking.map((i) => i.target),
      ["speaking-word"],
    );
    assert.deepEqual(
      reading.map((i) => i.target),
      ["reading-word"],
    );
  });
});

test("an existing speaking collection comes through byte-identical", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerBook(sourceDir, libraryHomeDir);
    const slug = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    materializeBookInOutput(outputRoot, slug, epubPath, epubHash, "ja");
    const markerPath = join(outputRoot, "epubs", slug, "book.json");
    const libraryPath = join(libraryHomeDir, "epubs", epubHash, "book.json");
    // A marker exactly as the code before deck kinds wrote it.
    const before = `${JSON.stringify(
      { title: "Genki", slug, epubHash, targetLanguage: "ja", guidNamespace: slug },
      null,
      2,
    )}\n`;
    writeFileSync(markerPath, before);
    const libraryBefore = readFileSync(libraryPath, "utf-8");

    assert.equal(resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir }), slug);
    materializeBookInOutput(outputRoot, slug, epubPath, epubHash, "ja");
    assert.equal(readFileSync(markerPath, "utf-8"), before);
    assert.equal(readFileSync(libraryPath, "utf-8"), libraryBefore);
    assert.equal(existsSync(join(outputRoot, "epubs", slug, ".deck-kind")), false);
    assert.equal(collectionDeckKind(join(outputRoot, "epubs", slug)), "speaking-listening");
  });
});

test("the reading collection's Anki parent deck is named from its kind", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerBook(sourceDir, libraryHomeDir);
    const speaking = resolveBookSlug(outputRoot, epubPath, epubHash, { libraryHomeDir });
    const reading = resolveBookSlug(outputRoot, epubPath, epubHash, {
      libraryHomeDir,
      deckKind: "reading",
    });
    const loadMeta = (hash) => loadBookMeta(hash, { libraryHomeDir });
    assert.equal(
      resolveBookName(join(outputRoot, "epubs", speaking), epubHash, { loadBookMeta: loadMeta }),
      "Genki",
    );
    assert.equal(
      resolveBookName(join(outputRoot, "epubs", reading), epubHash, { loadBookMeta: loadMeta }),
      "Genki (Reading)",
    );
  });
});

test("a step for one kind refuses a collection of the other", () => {
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerBook(sourceDir, libraryHomeDir);
    const reading = resolveBookSlug(outputRoot, epubPath, epubHash, {
      libraryHomeDir,
      deckKind: "reading",
    });
    const dir = join(outputRoot, "epubs", reading);
    assert.doesNotThrow(() => assertCollectionKind(dir, "reading"));
    assert.throws(() => assertCollectionKind(dir, "speaking-listening"), /build-reading-deck/);
  });
});

test("a reading collection can carry a short deck name, kept on refresh, and fixed once delivered", async () => {
  const { setCollectionDeckName } = await import("../../src/cli/outputPaths.js");
  withTempDirs(({ outputRoot, libraryHomeDir, sourceDir }) => {
    const { epubPath, epubHash } = registerBook(sourceDir, libraryHomeDir);
    const reading = resolveBookSlug(outputRoot, epubPath, epubHash, {
      libraryHomeDir,
      deckKind: "reading",
    });
    materializeBookInOutput(outputRoot, reading, epubPath, epubHash, "ja", { deckKind: "reading" });
    const dir = join(outputRoot, "epubs", reading);
    const loadMeta = (hash) => loadBookMeta(hash, { libraryHomeDir });

    assert.deepEqual(setCollectionDeckName(dir, "Genki I (Reading)"), {
      changed: true,
      deckName: "Genki I (Reading)",
    });
    assert.equal(resolveBookName(dir, epubHash, { loadBookMeta: loadMeta }), "Genki I (Reading)");
    // A refresh of the marker keeps the owner's name.
    materializeBookInOutput(outputRoot, reading, epubPath, epubHash, "ja", { deckKind: "reading" });
    assert.equal(readJson(join(dir, "book.json")).deckName, "Genki I (Reading)");
    assert.throws(() => setCollectionDeckName(dir, "A::B"), /no "::"/);

    // Once delivered, the name is how the deck is found again, so it is not changed here.
    writeFileSync(join(dir, "anki-delivered.json"), "{}");
    assert.throws(() => setCollectionDeckName(dir, "Genki (Reading)"), /already been delivered/);
    assert.equal(setCollectionDeckName(dir, "Genki I (Reading)").changed, false);
  });
});

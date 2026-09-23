import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { planRebase, applyRebase, chapterName } from "../../src/cli/rebaseCollection.js";

// A collection moved onto a rebuilt edition of its EPUB keeps its slug, ids and review state and
// takes the new book's hash, spine numbers and chapter labels (src/cli/rebaseCollection.js).

const json = (path) => JSON.parse(readFileSync(path, "utf-8"));
const put = (path, data) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "rebase-"));
  const collectionDir = join(root, "epubs", "book-reading");
  const library = join(root, "library");
  put(join(collectionDir, "book.json"), {
    title: "Short title",
    slug: "book-reading",
    epubHash: "old",
    guidNamespace: "book-reading",
    deckKind: "reading",
    deckName: "Book (Reading)",
  });
  writeFileSync(join(collectionDir, ".epub-hash"), "old");
  const unit = (name, chapterNumber, chapterLabel, reviewed) => {
    const meta = { epubHash: "old", chapterNumber, chapterLabel, reviewed, phase: "reading" };
    put(join(collectionDir, name, "cards.json"), { meta, items: [{ id: `r-${name}` }] });
    put(join(collectionDir, name, "corpus.json"), { meta, items: [] });
  };
  unit("chapter-0", 2, "Chapter 02: Greetings", true);
  unit("chapter-1", 3, "Chapter 03: Numbers", false);
  put(join(library, "old", "2.json"), {
    meta: { epubHash: "old", chapterNumber: 2, chapterLabel: "Chapter 02: Greetings" },
    items: [{ id: "r-chapter-0" }],
  });
  const epubPath = join(root, "new.epub");
  writeFileSync(epubPath, "NEW BOOK");
  return { root, collectionDir, library, epubPath };
}

const lessons = [
  { label: "Chapter 01: Greetings", firstChapterNumber: 1 },
  { label: "Chapter 02: Numbers", firstChapterNumber: 2 },
];

test("a chapter's name is its label without the number", () => {
  assert.equal(chapterName("Chapter 02: Greetings"), "Greetings");
  assert.equal(chapterName("Chapter 03: Lesson 1: New Friends"), "Lesson 1: New Friends");
});

test("a rebase renumbers every unit and keeps what a person did", () => {
  const { root, collectionDir, library, epubPath } = fixture();
  try {
    const plan = planRebase({ collectionDir, newHash: "new", lessons });
    assert.deepEqual(
      plan.units.map((u) => [u.name, u.to.label, u.to.chapterNumber]),
      [
        ["chapter-0", "Chapter 01: Greetings", 1],
        ["chapter-1", "Chapter 02: Numbers", 2],
      ],
    );
    let registered = null;
    applyRebase(plan, {
      collectionDir,
      epubPath,
      libraryCorpus: (hash, n) => join(library, hash, `${n}.json`),
      registerSlug: (hash) => (registered = hash),
    });

    const cards = json(join(collectionDir, "chapter-0", "cards.json"));
    assert.equal(cards.meta.epubHash, "new");
    assert.equal(cards.meta.chapterNumber, 1);
    assert.equal(cards.meta.chapterLabel, "Chapter 01: Greetings");
    assert.equal(cards.meta.reviewed, true);
    assert.equal(cards.items[0].id, "r-chapter-0");
    assert.equal(json(join(collectionDir, "chapter-1", "corpus.json")).meta.chapterNumber, 2);

    const marker = json(join(collectionDir, "book.json"));
    assert.equal(marker.epubHash, "new");
    assert.equal(marker.slug, "book-reading");
    assert.equal(marker.guidNamespace, "book-reading");
    assert.equal(marker.title, "Short title");
    assert.equal(readFileSync(join(collectionDir, ".epub-hash"), "utf-8"), "new");
    assert.equal(readFileSync(join(collectionDir, "book.epub"), "utf-8"), "NEW BOOK");
    assert.equal(registered, "new");

    // The reviewed chapter's dedup entry moves to the new hash and number; the unreviewed one has none.
    assert.equal(json(join(library, "new", "1.json")).meta.chapterLabel, "Chapter 01: Greetings");
    assert.ok(!existsSync(join(library, "new", "2.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a unit the new book does not have, or a build in progress, stops the rebase", () => {
  const { root, collectionDir } = fixture();
  try {
    assert.throws(
      () => planRebase({ collectionDir, newHash: "new", lessons: lessons.slice(0, 1) }),
      /chapter-1 \("Chapter 03: Numbers"\) matches 0 chapter/,
    );
    writeFileSync(join(collectionDir, "chapter-0", "claim.json"), "{}");
    assert.throws(
      () => planRebase({ collectionDir, newHash: "new", lessons }),
      /chapter-0 has a claim\.json/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

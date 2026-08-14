import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { markCardsReviewed, unmarkCardsReviewed } from "../../src/server/adapters/applyCards.js";

/**
 * The dedup library is keyed on `(epubHash, chapterNumber)`, and a unit shares that pair with its
 * own `-extras` sibling by design. So an extras unit owns no library key: writing on its behalf
 * overwrites the base chapter's entry, and removing on its behalf deletes it.
 *
 * These tests drive the two write paths with a run dir NAMED `-extras`, which is the only thing
 * that distinguishes the two units on disk once a `meta` block has been copied between them.
 */
function runDir(name, meta, items = []) {
  const parent = mkdtempSync(join(tmpdir(), "extras-guard-"));
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({
      meta: {
        targetLanguage: "ja",
        sourceType: "epub",
        enriched: true,
        notesEnhanced: true,
        ...meta,
      },
      items,
    }),
  );
  return { dir, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

const card = (id) => ({
  id,
  english: id,
  category: "Numbers",
  target: id,
  pronunciation: id,
});

test("marking a BASE chapter reviewed still saves its dedup-library entry", () => {
  const { dir, cleanup } = runDir("chapter-13", { epubHash: "h", chapterNumber: 33 }, [card("a")]);
  try {
    const saved = [];
    markCardsReviewed(dir, { saveChapterCorpus: (...args) => saved.push(args.slice(0, 2)) });
    assert.deepEqual(saved, [["h", 33]]);
  } finally {
    cleanup();
  }
});

test("marking an -EXTRAS unit reviewed never writes to the library, even with a copied epubHash", () => {
  const { dir, cleanup } = runDir("chapter-13-extras", { epubHash: "h", chapterNumber: 33 }, [
    card("drill"),
  ]);
  try {
    const saved = [];
    const out = markCardsReviewed(dir, { saveChapterCorpus: (...args) => saved.push(args) });
    assert.deepEqual(out, { reviewed: true });
    assert.deepEqual(saved, [], "the base chapter's entry is untouched");
  } finally {
    cleanup();
  }
});

test("un-reviewing an -EXTRAS unit never DELETES the base chapter's library entry", () => {
  const { dir, cleanup } = runDir(
    "lesson-4-extras",
    { epubHash: "h", chapterNumber: 18, reviewed: true },
    [card("drill")],
  );
  try {
    const removed = [];
    unmarkCardsReviewed(dir, { removeChapterCorpus: (...args) => removed.push(args) });
    assert.deepEqual(removed, [], "removing the extras unit's sign-off deletes nothing");
  } finally {
    cleanup();
  }
});

test("a trailing slash on the run dir does not defeat the -extras check", () => {
  const { dir, cleanup } = runDir("chapter-9-extras", { epubHash: "h", chapterNumber: 26 }, [
    card("a"),
  ]);
  try {
    const saved = [];
    markCardsReviewed(`${dir}/`, { saveChapterCorpus: (...args) => saved.push(args) });
    assert.deepEqual(saved, []);
  } finally {
    cleanup();
  }
});

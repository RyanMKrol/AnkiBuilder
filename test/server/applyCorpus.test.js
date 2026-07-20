import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  setCorpusItemExcluded,
  markCorpusReviewed,
} from "../../src/server/adapters/applyCorpus.js";

function runDir(meta, items) {
  const dir = mkdtempSync(join(tmpdir(), "applycorpus-"));
  writeFileSync(
    join(dir, "corpus.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", sourceType: "epub", ...meta },
      items,
    }),
  );
  return dir;
}
const readCorpus = (dir) => JSON.parse(readFileSync(join(dir, "corpus.json"), "utf-8"));
const item = (id, over = {}) => ({
  id,
  english: id,
  category: "Numbers",
  notes: null,
  target: id,
  ...over,
});

test("setCorpusItemExcluded toggles the flag (reversible) and rejects unknown ids", () => {
  const dir = runDir({}, [item("a"), item("b")]);
  try {
    setCorpusItemExcluded(dir, "a", true);
    assert.equal(readCorpus(dir).items.find((i) => i.id === "a").excluded, true);
    // reversible — clearing removes the key entirely
    setCorpusItemExcluded(dir, "a", false);
    assert.equal("excluded" in readCorpus(dir).items.find((i) => i.id === "a"), false);
    assert.throws(() => setCorpusItemExcluded(dir, "nope", true), /not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("markCorpusReviewed sets meta.reviewed and saves the FILTERED corpus to the library (epub source)", () => {
  const dir = runDir({ epubHash: "hash123", chapterNumber: 3 }, [
    item("a", { excluded: true }),
    item("b"),
  ]);
  try {
    const saved = [];
    const res = markCorpusReviewed(dir, {
      saveChapterCorpus: (hash, ch, corpus) => saved.push({ hash, ch, corpus }),
    });
    assert.deepEqual(res, { reviewed: true });
    assert.equal(readCorpus(dir).meta.reviewed, true);
    // library copy: right (hash, chapter), and the excluded item is filtered OUT
    assert.equal(saved.length, 1);
    assert.equal(saved[0].hash, "hash123");
    assert.equal(saved[0].ch, 3);
    assert.deepEqual(
      saved[0].corpus.items.map((i) => i.id),
      ["b"],
    );
    // the run-dir corpus keeps BOTH items (exclusion is reversible until translate)
    assert.equal(readCorpus(dir).items.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("markCorpusReviewed does NOT touch the library for a non-epub source", () => {
  const dir = runDir({ sourceType: "template", epubHash: null, chapterNumber: null }, [item("a")]);
  try {
    let called = false;
    markCorpusReviewed(dir, { saveChapterCorpus: () => (called = true) });
    assert.equal(called, false, "no library save without epubHash/chapterNumber");
    assert.equal(readCorpus(dir).meta.reviewed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildKanaUnit, collectKanaPool } from "../../src/reading/kanaDeck.js";
import { validateCards } from "../../src/model/index.js";

// The kana unit (src/reading/kanaDeck.js): chosen from every chapter's saved kana pool, no reader
// called again.

function collection(pools) {
  const dir = mkdtempSync(join(tmpdir(), "kana-deck-"));
  pools.forEach(([chapterNumber, kanaPool], i) => {
    const unit = join(dir, `chapter-${i}`);
    mkdirSync(unit, { recursive: true });
    writeFileSync(
      join(unit, "corpus.json"),
      JSON.stringify({
        meta: { chapterNumber, chapterLabel: `Chapter 0${chapterNumber}` },
        items: [],
      }),
    );
    if (kanaPool) writeFileSync(join(unit, "reading-report.json"), JSON.stringify({ kanaPool }));
  });
  return dir;
}

const kana = (target, english = "Meaning") => ({ target, english, category: "Other" });

// The romaji step, faked: the real one loads a dictionary and calls a model.
const fakeRomanize = async (items) => ({
  items: items.map((i) => ({ ...i, pronunciation: `r:${i.target}` })),
  romanized: items.map((i) => ({ id: i.id, target: i.target, pronunciation: `r:${i.target}` })),
  failed: false,
});

test("the pool is every chapter's kana words in book order", () => {
  const dir = collection([
    [2, [kana("いち"), kana("に")]],
    [1, [kana("おはよう")]],
  ]);
  try {
    const { pool, missing } = collectKanaPool(dir);
    assert.deepEqual(
      pool.map((e) => [e.target, e.chapterLabel]),
      [
        ["おはよう", "Chapter 01"],
        ["いち", "Chapter 02"],
        ["に", "Chapter 02"],
      ],
    );
    assert.deepEqual(missing, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the kana unit is a valid reading unit, chapter 00, with its choice reported", async () => {
  const dir = collection([[1, [kana("おはよう", "Good morning"), kana("コーヒー", "Coffee")]]]);
  try {
    const unitDir = join(dir, "chapter-9");
    const report = await buildKanaUnit({
      unitDir,
      collectionDir: dir,
      targetLanguage: "ja",
      epubHash: "h",
      romanize: fakeRomanize,
    });
    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    assert.doesNotThrow(() => validateCards(cards));
    assert.equal(cards.meta.chapterNumber, 0);
    assert.equal(cards.meta.chapterLabel, "Chapter 00: Kana");
    assert.equal(cards.meta.phase, "reading");
    assert.deepEqual(
      cards.items.map((i) => [i.target, i.english, i.pronunciation]),
      [
        ["おはよう", "Good morning", "r:おはよう"],
        ["コーヒー", "Coffee", "r:コーヒー"],
      ],
    );
    assert.deepEqual(report.perScript, { hiragana: 1, katakana: 1 });
    // The unit is not itself part of the pool it was chosen from.
    assert.equal(collectKanaPool(dir).pool.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a chapter merged before the kana deck, or a reviewed kana unit, stops the choice", async () => {
  const dir = collection([
    [1, [kana("すし")]],
    [2, null],
  ]);
  try {
    const unitDir = join(dir, "chapter-9");
    const build = () =>
      buildKanaUnit({
        unitDir,
        collectionDir: dir,
        targetLanguage: "ja",
        epubHash: "h",
        romanize: fakeRomanize,
      });
    await assert.rejects(build, /re-merge them first.*Chapter 02/);

    writeFileSync(join(dir, "chapter-1", "reading-report.json"), JSON.stringify({ kanaPool: [] }));
    await build();
    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    writeFileSync(
      join(unitDir, "cards.json"),
      JSON.stringify({ ...cards, meta: { ...cards.meta, reviewed: true } }),
    );
    await assert.rejects(build, /is reviewed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a chapter folder that never merged is named, but the kana unit's own folder is not", () => {
  const dir = collection([[1, [kana("すし")]]]);
  try {
    mkdirSync(join(dir, "chapter-5"), { recursive: true });
    mkdirSync(join(dir, "chapter-6"), { recursive: true });
    const { missing } = collectKanaPool(dir, { exclude: join(dir, "chapter-6") });
    assert.deepEqual(missing, ["chapter-5"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  characterGaps,
  fillCharacterGaps,
  applyBookCharacters,
  dropCharactersCardedEarlier,
  CHARACTERS_FILE,
} from "../../src/reading/characterGaps.js";
import { readingScheme } from "../../src/reading/readingSchemes.js";
import { readingCardId } from "../../src/reading/readingPhase.js";

// Character cards a chapter needs before the book teaches them (src/reading/characterGaps.js).

const ja = readingScheme("ja");
const json = (path) => JSON.parse(readFileSync(path, "utf-8"));

function unit(items, meta = {}) {
  const dir = mkdtempSync(join(tmpdir(), "char-gaps-"));
  mkdirSync(join(dir, "candidates"), { recursive: true });
  const base = { targetLanguage: "ja", phase: "reading", reviewed: false, ...meta };
  writeFileSync(join(dir, "cards.json"), JSON.stringify({ meta: base, items }));
  const corpusItems = items.map((item) => {
    const rest = { ...item };
    delete rest.pronunciation;
    return rest;
  });
  writeFileSync(join(dir, "corpus.json"), JSON.stringify({ meta: base, items: corpusItems }));
  writeFileSync(join(dir, "reading-report.json"), "{}");
  return dir;
}

const word = (target, ttsText) => ({
  id: readingCardId(target),
  target,
  ttsText,
  english: "Meaning",
  category: "Other",
  pronunciation: "x",
});

test("a gap is a character a word uses that no card here or earlier covers", () => {
  const gaps = characterGaps(
    [word("眼鏡", "めがね"), word("聞く", "きく"), { ...word("聞"), ttsText: undefined }],
    {
      scheme: ja,
      earlier: new Set(["眼"]),
    },
  );
  assert.deepEqual(
    gaps.map((g) => [g.target, g.usedIn.map((u) => u.target)]),
    [["鏡", ["眼鏡"]]],
  );
});

test("gaps are filled from the dictionary, the model only for what it lacks, then reviewed", async () => {
  const dir = unit([word("眼鏡", "めがね")]);
  try {
    const calls = [];
    const agents = {
      writeCharacters: async (entries) => {
        calls.push(["write", entries.map((e) => e.target)]);
        return new Map();
      },
      reviewCharacters: async (entries) => {
        calls.push(["review", entries.map((e) => e.target)]);
        return new Map([
          [
            "鏡",
            { english: "Mirror", readings: { on: ["きょう"], kun: ["かがみ"] }, reason: "trimmed" },
          ],
        ]);
      },
    };
    const result = await fillCharacterGaps(dir, { scheme: ja, cardId: readingCardId, agents });
    assert.deepEqual(result, { added: 2, fromModel: 0, corrected: 1 });
    // Both kanji are in the dictionary: the model was not asked, the reviewer saw both.
    assert.deepEqual(calls, [["review", ["眼", "鏡"]]]);
    const cards = json(join(dir, "cards.json"));
    // Characters come first, then the words.
    assert.deepEqual(cards.items.map((i) => i.target).slice(-1), ["眼鏡"]);
    const mirror = cards.items.find((i) => i.target === "鏡");
    assert.equal(mirror.english, "Mirror");
    assert.equal(mirror.pronunciation, "kyō / kagami");
    assert.equal(mirror.ttsText, undefined);
    assert.match(mirror.reviewNote, /Not taught by the book yet/);
    assert.equal(json(join(dir, "corpus.json")).items.length, 3);
    assert.equal(json(join(dir, CHARACTERS_FILE)).generated.length, 2);
    // Filling again finds nothing to do.
    assert.deepEqual(await fillCharacterGaps(dir, { scheme: ja, cardId: readingCardId, agents }), {
      added: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a signed-off unit is not changed", async () => {
  const dir = unit([word("眼鏡", "めがね")], { reviewed: true });
  try {
    const result = await fillCharacterGaps(dir, { scheme: ja, cardId: readingCardId, agents: {} });
    assert.match(result.skipped, /signed off/);
    assert.equal(json(join(dir, "cards.json")).items.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("when the book teaches a generated character, its data replaces the card's, and the repeat goes", async () => {
  const early = unit([word("聞く", "きく")]);
  const late = unit([{ ...word("聞"), ttsText: undefined, pronunciation: "bun / ki" }]);
  try {
    const agents = {
      writeCharacters: async () => new Map(),
      reviewCharacters: async () => new Map(),
    };
    await fillCharacterGaps(early, { scheme: ja, cardId: readingCardId, agents });
    assert.deepEqual(dropCharactersCardedEarlier(late, new Set(["聞"]), { scheme: ja }), ["聞"]);
    assert.equal(json(join(late, "cards.json")).items.length, 0);
    const book = new Map([
      [
        "聞",
        {
          meaning: "To listen",
          readings: { on: ["ぶん"], kun: ["き"] },
          chapterLabel: "Chapter 22",
        },
      ],
    ]);
    assert.deepEqual(applyBookCharacters(early, book, { scheme: ja }), ["聞"]);
    const card = json(join(early, "cards.json")).items.find((i) => i.target === "聞");
    assert.equal(card.english, "To listen");
    assert.equal(card.pronunciation, "bun / ki");
    assert.match(card.reviewNote, /from the book \(Chapter 22\)/);
    assert.equal(json(join(early, CHARACTERS_FILE)).generated[0].replacedByBook, "Chapter 22");
  } finally {
    rmSync(early, { recursive: true, force: true });
    rmSync(late, { recursive: true, force: true });
  }
});

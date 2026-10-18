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
  reReviewCharacters,
  bookWordReadings,
} from "../../src/reading/characterGaps.js";
import { readingScheme } from "../../src/reading/readingSchemes.js";
import { readingCardId } from "../../src/reading/readingPhase.js";
import { validateCards, validateCorpus } from "../../src/model/index.js";

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

test("a done unit is not changed; a reviewed one is, and its review is withdrawn", async () => {
  const agents = {
    writeCharacters: async () => new Map(),
    reviewCharacters: async () => new Map(),
  };
  const done = unit([word("眼鏡", "めがね")], { reviewed: true, done: true });
  const reviewed = unit([word("眼鏡", "めがね")], { reviewed: true });
  try {
    const skipped = await fillCharacterGaps(done, { scheme: ja, cardId: readingCardId, agents });
    assert.match(skipped.skipped, /marked done/);
    assert.equal(json(join(done, "cards.json")).items.length, 1);

    const reopened = await fillCharacterGaps(reviewed, {
      scheme: ja,
      cardId: readingCardId,
      agents,
    });
    assert.equal(reopened.reopened, true);
    const cards = json(join(reviewed, "cards.json"));
    assert.equal(cards.items.length, 3);
    assert.equal(cards.meta.reviewed, false);
    assert.equal(json(join(reviewed, "corpus.json")).meta.reviewed, false);
  } finally {
    rmSync(done, { recursive: true, force: true });
    rmSync(reviewed, { recursive: true, force: true });
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
    assert.deepEqual(dropCharactersCardedEarlier(late, new Set(["聞"]), { scheme: ja }), {
      removed: ["聞"],
      rewritten: [],
    });
    // The drop is logged where the merge logs its own.
    assert.match(json(join(late, "reading-report.json")).dropped[0].reason, /already carded/);
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

test("cards reviewed under an older review version are reviewed again, once", async () => {
  const dir = unit([word("学校", "がっこう")]);
  try {
    const first = {
      writeCharacters: async () => new Map(),
      reviewCharacters: async () => new Map(),
    };
    await fillCharacterGaps(dir, { scheme: ja, cardId: readingCardId, agents: first });
    // Pretend the review ran under the first prompt.
    const path = join(dir, CHARACTERS_FILE);
    const record = json(path);
    writeFileSync(
      path,
      JSON.stringify({ generated: record.generated.map((g) => ({ ...g, reviewVersion: 1 })) }),
    );
    const seen = [];
    const stricter = {
      reviewCharacters: async (entries) => {
        seen.push(entries.map((e) => [e.target, e.usedIn.map((u) => u.target)]));
        return new Map([["校", { english: "School", reason: "the sense 学校 uses" }]]);
      },
    };
    assert.deepEqual(await reReviewCharacters(dir, { scheme: ja, agents: stricter }), {
      reviewed: 2,
      corrected: 1,
    });
    assert.deepEqual(seen, [
      [
        ["学", ["学校"]],
        ["校", ["学校"]],
      ],
    ]);
    assert.equal(
      json(join(dir, "cards.json")).items.find((i) => i.target === "校").english,
      "School",
    );
    // Done: nothing is stale any more.
    assert.deepEqual(await reReviewCharacters(dir, { scheme: ja, agents: stricter }), {
      reviewed: 0,
      corrected: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a character reviewer that answers in prose is asked once more", async () => {
  const { reviewCharacters } = await import("../../src/reading/readingAgents.js");
  const replies = [
    "All three cards are correct as they stand.",
    JSON.stringify({ cards: [{ target: "聞", verdict: "ok" }] }),
  ];
  let calls = 0;
  const { corrections, unreviewed } = reviewCharacters({
    entries: [
      { target: "聞", english: "Hear", readings: { on: ["ぶん"], kun: ["き"] }, usedIn: [] },
    ],
    targetLanguage: "ja",
    runClaude: () => replies[calls++],
  });
  assert.equal(calls, 2);
  assert.equal(corrections.size, 0);
  assert.deepEqual(unreviewed, []);
});

// ---- a kanji a later chapter teaches as a word (owner ruling, 2026-10-18) ---------------------

// One reading collection on disk, each chapter a valid unit (the rewrite validates what it writes).
function collection(chapters) {
  const root = mkdtempSync(join(tmpdir(), "word-wins-"));
  const dirs = {};
  chapters.forEach(({ name, items, record = null, report = {} }, index) => {
    const dir = join(root, name);
    mkdirSync(join(dir, "candidates"), { recursive: true });
    const meta = {
      targetLanguage: "ja",
      sourceType: "epub",
      reviewed: true,
      epubHash: "h",
      chapterNumber: 10 + index,
      chapterLabel: `Chapter 0${index + 1}`,
      phase: "reading",
    };
    writeFileSync(
      join(dir, "cards.json"),
      JSON.stringify({ meta: { ...meta, kanjiTts: true, done: index === 0 }, items }),
    );
    const corpusItems = items.map((item) => {
      const rest = { ...item };
      delete rest.pronunciation;
      return rest;
    });
    writeFileSync(join(dir, "corpus.json"), JSON.stringify({ meta, items: corpusItems }));
    writeFileSync(join(dir, "reading-report.json"), JSON.stringify(report));
    if (record) writeFileSync(join(dir, CHARACTERS_FILE), JSON.stringify(record));
    dirs[name] = dir;
  });
  return { root, dirs };
}

const silent = (target, english) => ({
  id: readingCardId(target),
  target,
  english,
  category: "Other",
  pronunciation: "shun / haru",
  reviewNote: "Not taught by the book yet: meaning and readings from KANJIDIC2.",
});

test("a kanji carded as a character in chapter A and taught as a word in chapter B: A's card becomes the word", () => {
  const { root, dirs } = collection([
    {
      name: "chapter-1",
      items: [silent("春", "Spring (season)"), word("春休み", "はるやすみ")],
      record: {
        generated: [
          { target: "春", english: "Spring (season)", readings: { on: ["しゅん"], kun: ["はる"] } },
        ],
        cards: { 春: { readings: { on: ["しゅん"], kun: ["はる"] }, voiced: false } },
      },
    },
    {
      name: "chapter-2",
      items: [
        { ...word("春", "はる"), english: "Spring", category: "Time", pronunciation: "haru" },
      ],
    },
  ]);
  try {
    const A = dirs["chapter-1"];
    const B = dirs["chapter-2"];
    const result = dropCharactersCardedEarlier(B, new Set(["春"]), {
      scheme: ja,
      cardedIn: new Map([["春", A]]),
      chapterLabel: "Chapter 02",
      bookReadings: bookWordReadings(root, ja),
    });
    assert.deepEqual(result, {
      removed: ["春"],
      rewritten: [{ target: "春", unitDir: A, fate: "word" }],
    });

    // Chapter A: the same card, under the same id, is now the voiced word, in BOTH files.
    const cards = json(join(A, "cards.json"));
    assert.doesNotThrow(() => validateCards(cards));
    const card = cards.items.find((i) => i.target === "春");
    assert.equal(card.id, readingCardId("春"));
    assert.equal(card.ttsText, "はる");
    assert.equal(card.english, "Spring");
    assert.equal(card.category, "Time");
    assert.equal(card.pronunciation, "haru");
    assert.match(card.reviewNote, /Taught as a word in Chapter 02/);
    // A field edit: a done, reviewed unit keeps its sign-off.
    assert.equal(cards.meta.done, true);
    assert.equal(cards.meta.reviewed, true);
    const corpus = json(join(A, "corpus.json"));
    assert.doesNotThrow(() => validateCorpus(corpus));
    const corpusCard = corpus.items.find((i) => i.target === "春");
    assert.equal(corpusCard.id, card.id);
    assert.equal(corpusCard.ttsText, "はる");
    assert.equal(corpusCard.english, "Spring");
    assert.equal("pronunciation" in corpusCard, false);
    // ...and the book pass no longer treats it as a character card.
    const record = json(join(A, CHARACTERS_FILE));
    assert.equal(record.cards["春"], undefined);
    assert.equal(record.generated[0].taughtAsWord, "Chapter 02");

    // Chapter B: the repeat is gone, and the drop is logged with its reason.
    assert.deepEqual(json(join(B, "cards.json")).items, []);
    const [logged] = json(join(B, "reading-report.json")).dropped;
    assert.equal(logged.target, "春");
    assert.deepEqual(logged.wordReadings, ["はる"]);
    assert.match(logged.reason, /character card in Chapter 01 is rewritten in place as this word/);

    // Running the pass again changes nothing: the repeat is already gone.
    assert.deepEqual(dropCharactersCardedEarlier(B, new Set(["春"]), { scheme: ja }), {
      removed: [],
      rewritten: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a kanji the book reads two ways as a word stays silent, with both senses in its English", () => {
  const { root, dirs } = collection([
    { name: "chapter-1", items: [{ ...silent("年", "Year"), pronunciation: "nen / toshi" }] },
    {
      name: "chapter-2",
      items: [],
      // An earlier drop recorded 年 read とし.
      report: { dropped: [{ target: "年", reason: "x", wordReadings: ["とし"] }] },
    },
    {
      name: "chapter-3",
      items: [{ ...word("年", "ねん"), english: "... years", pronunciation: "nen" }],
    },
  ]);
  try {
    const A = dirs["chapter-1"];
    const result = dropCharactersCardedEarlier(dirs["chapter-3"], new Set(["年"]), {
      scheme: ja,
      cardedIn: new Map([["年", A]]),
      chapterLabel: "Chapter 03",
      bookReadings: bookWordReadings(root, ja),
    });
    assert.equal(result.rewritten[0].fate, "both-senses");
    const card = json(join(A, "cards.json")).items[0];
    assert.equal(card.ttsText, undefined);
    assert.equal(card.english, "Year; ... years");
    assert.equal(card.pronunciation, "nen / toshi");
    assert.match(card.reviewNote, /more than one way \(ねん, とし\)/);
    const logged = json(join(dirs["chapter-3"], "reading-report.json")).dropped[0];
    assert.match(logged.reason, /stays silent, with every sense/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a colour noun the book teaches by rule counts as a taught word", () => {
  const { root, dirs } = collection([
    { name: "chapter-1", items: [{ ...silent("赤", "Red"), pronunciation: "seki / aka" }] },
    { name: "chapter-2", items: [{ ...silent("赤", "Red"), pronunciation: "seki / aka" }] },
  ]);
  try {
    const A = dirs["chapter-1"];
    const result = dropCharactersCardedEarlier(dirs["chapter-2"], new Set(["赤"]), {
      scheme: ja,
      cardedIn: new Map([["赤", A]]),
    });
    assert.equal(result.rewritten[0].fate, "word");
    const card = json(join(A, "cards.json")).items[0];
    assert.equal(card.ttsText, "あか");
    assert.equal(card.pronunciation, "aka");
    assert.equal(card.category, "Colors");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

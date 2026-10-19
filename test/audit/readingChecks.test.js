import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CHECKS, audit } from "../../src/audit/index.js";
import { makeOutputRoot, writeUnit, writeMarker, writeRaw, card } from "./fixture.js";

// The reading collection's checks (docs/designs/reading-decks/07-checks.md). Each gets a failing and
// a passing fixture; the speaking checks that do not apply are skipped for a reading collection and
// said to be.

const READING_BOOK = "epubs/book-reading";

function readingRoot(items, { meta = {}, extraUnits = [] } = {}) {
  const fixture = makeOutputRoot();
  writeMarker(fixture.root, READING_BOOK, "book.json", {
    title: "Book",
    slug: "book-reading",
    deckKind: "reading",
  });
  writeUnit(fixture.root, `${READING_BOOK}/chapter-0`, {
    meta: { phase: "reading", chapterNumber: 1, chapterLabel: "Chapter 01", ...meta },
    items,
  });
  for (const [name, unitItems] of extraUnits) {
    writeUnit(fixture.root, `${READING_BOOK}/${name}`, {
      meta: { phase: "reading", chapterNumber: 2, chapterLabel: "Chapter 02" },
      items: unitItems,
    });
  }
  return fixture;
}

const word = (id, target, over = {}) =>
  card(id, { target, english: "Meaning", pronunciation: "", ...over });

const findingsOf = (root, id) =>
  audit({ outputRoot: root, checks: ALL_CHECKS, only: [id] }).results.flatMap((r) =>
    r.findings.map((f) => f.message),
  );

function expect(id, failing, passing, pattern) {
  for (const [items, want] of [
    [failing, pattern],
    [passing, null],
  ]) {
    const { root, cleanup } = readingRoot(items);
    try {
      const found = findingsOf(root, id);
      if (want) assert.match(found.join("\n"), want, `${id} should fire`);
      else assert.deepEqual(found, [], `${id} should be clean`);
    } finally {
      cleanup();
    }
  }
}

test("reading-front: furigana, a bracketed reading or a sentence never reaches the front", () => {
  expect(
    "reading-front",
    [word("a", "大学 (だいがく)")],
    [word("a", "大学", { ttsText: "だいがく" })],
    /reading in brackets/,
  );
  expect(
    "reading-front",
    [word("a", "<ruby>大学<rt>だいがく</rt></ruby>")],
    [word("a", "大学")],
    /furigana/,
  );
  expect("reading-front", [word("a", "これはペンです。")], [word("a", "ペン")], /sentence/);
});

test("reading-latin: romaji on a front is acknowledged, not silently shipped", () => {
  expect("reading-latin", [word("a", "eiga")], [word("a", "映画", { ttsText: "えいが" })], /Latin/);
});

test("reading-single-character: only the characters the plugin cards", () => {
  expect("reading-single-character", [word("a", "Ａ")], [word("a", "日")], /single character/);
});

test("reading-single-kana: a single kana is confirmed by a person, not failed", () => {
  // Right as a word (に "Two"), wrong as a letter; the card does not say which.
  expect("reading-single-kana", [word("a", "に")], [word("a", "おはよう")], /single kana/);
});

test("reading-length: a front past word size is acknowledged", () => {
  expect(
    "reading-length",
    [word("a", "どうぞよろしくおねがいします。どうぞ")],
    [word("a", "おはようございます")],
    /characters/,
  );
});

test("reading-phrase: a sentence or a word-plus-particle phrase is acknowledged, a word is not", () => {
  expect(
    "reading-phrase",
    [word("a", "この中にお酒が入っていますか", { ttsText: "このなかにおさけがはいっていますか" })],
    [word("a", "お酒", { ttsText: "おさけ" })],
    /polite or inflected ending/,
  );
  expect(
    "reading-phrase",
    [word("a", "雨が降る", { ttsText: "あめがふる" })],
    // The が inside 曲がる is part of the word, not a particle: no kanji follows it.
    [word("a", "曲がる", { ttsText: "まがる" })],
    /joins two words with a particle/,
  );
});

test("reading-kana-reading: a kanji word carries a reading, and it is kana", () => {
  expect(
    "reading-kana-reading",
    [word("a", "映画")],
    [word("a", "映画", { ttsText: "えいが" })],
    /no reading/,
  );
  expect(
    "reading-kana-reading",
    [word("a", "映画", { ttsText: "eiga" })],
    [word("a", "日")],
    /not kana/,
  );
});

test("reading-kanji-spelling: a word the chapter prints in kanji is not carded in kana", () => {
  const { root, cleanup } = readingRoot([word("a", "えいが")]);
  try {
    writeRaw(
      root,
      `${READING_BOOK}/chapter-0/candidates/tables.json`,
      JSON.stringify({ items: [{ target: "映画", reading: "えいが" }] }),
    );
    assert.match(findingsOf(root, "reading-kanji-spelling").join("\n"), /prints it as "映画"/);
  } finally {
    cleanup();
  }
  expect("reading-kanji-spelling", [], [word("a", "えいが")], null);
});

test("reading-english: every card has its English", () => {
  expect(
    "reading-english",
    [word("a", "映画", { english: " " })],
    [word("a", "映画")],
    /no English/,
  );
});

test("reading-silent: a character card carries no clip", () => {
  expect(
    "reading-silent",
    [word("a", "日", { audio: "hi.mp3" })],
    [word("a", "日")],
    /carries audio/,
  );
});

test("reading-one-card-per-front: a written form is carded once across the collection", () => {
  const { root, cleanup } = readingRoot([word("a", "映画", { ttsText: "えいが" })], {
    extraUnits: [["chapter-1", [word("b", "映画", { ttsText: "えいが" })]]],
  });
  try {
    assert.match(findingsOf(root, "reading-one-card-per-front").join("\n"), /carded twice/);
  } finally {
    cleanup();
  }
});

test("reading-distinct-english: two different kanji or words never share an answer", () => {
  expect(
    "reading-distinct-english",
    [word("a", "洗", { english: "Wash" }), word("b", "濯", { english: "wash" })],
    [word("a", "洗", { english: "Wash" }), word("b", "濯", { english: "Laundry; rinse" })],
    /"Wash" answers 2 different cards: 洗 \(chapter-0\), 濯 \(chapter-0\)/,
  );
  expect(
    "reading-distinct-english",
    [
      word("a", "始まる", { english: "To begin", ttsText: "はじまる" }),
      word("b", "始める", { english: "To begin", ttsText: "はじめる" }),
    ],
    [
      word("a", "銀行", { english: "Bank", ttsText: "ぎんこう" }),
      word("b", "ぎんこう", { english: "Bank", ttsText: "ぎんこう" }),
    ],
    /"To begin" answers 2 different cards/,
  );
});

test("reading-distinct-english: a kanji card and a word card may share an answer", () => {
  expect(
    "reading-distinct-english",
    [word("a", "目", { english: "Eye" }), word("b", "眼", { english: "Eye" })],
    [word("a", "目", { english: "Eye" }), word("b", "め", { english: "Eye", ttsText: "め" })],
    /"Eye" answers 2/,
  );
});

test("a reading collection skips the speaking checks and says which", () => {
  const { root, cleanup } = readingRoot([word("a", "映画", { ttsText: "えいが" })]);
  try {
    const { results } = audit({ outputRoot: root, checks: ALL_CHECKS });
    const ran = new Set(results.map((r) => r.id));
    for (const speaking of ["collisions", "production-length", "near-siblings"]) {
      assert.ok(!ran.has(speaking), `${speaking} should not run on a reading collection`);
    }
    const skipped = results.find((r) => r.id === "reading-skipped-speaking-checks");
    assert.match(skipped.summary, /production-length/);
  } finally {
    cleanup();
  }
});

test("a speaking collection runs no reading check", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const { results } = audit({ outputRoot: root, checks: ALL_CHECKS });
    assert.deepEqual(
      results.filter((r) => r.id.startsWith("reading-")).map((r) => r.id),
      [],
    );
  } finally {
    cleanup();
  }
});

test("audio-files: a done reading unit's silent kanji card needs no clip", () => {
  const { root, cleanup } = readingRoot(
    [word("a", "日"), word("b", "映画", { ttsText: "えいが" })],
    {
      meta: { done: true },
    },
  );
  try {
    const found = findingsOf(root, "audio-files");
    assert.equal(found.length, 1);
    assert.match(found[0], /chapter-0\/b ships with no audio/);
  } finally {
    cleanup();
  }
});

test("readiness exemptions do not list a done reading chapter, which runs no speaking passes", () => {
  const { root, cleanup } = readingRoot([word("a", "映画", { ttsText: "えいが" })], {
    meta: { done: true, reviewed: true },
  });
  try {
    const rows = audit({
      outputRoot: root,
      checks: ALL_CHECKS,
      only: ["readiness-exemptions"],
    }).results;
    assert.ok(rows.every((r) => !(r.notes ?? []).join(" ").includes("chapter-0")));
    assert.ok(rows.every((r) => !String(r.summary ?? "").includes("chapter-0")));
  } finally {
    cleanup();
  }
});

test("reading-kana-in-chapter: a chapter cards kanji only; the kana deck may card kana", () => {
  expect(
    "reading-kana-in-chapter",
    [word("a", "すし")],
    [word("a", "映画", { ttsText: "えいが" }), word("b", "日")],
    /belongs in the kana deck/,
  );
  const { root, cleanup } = readingRoot([word("a", "すし")], {
    meta: { chapterNumber: 0, chapterLabel: "Chapter 00: Kana" },
  });
  try {
    assert.deepEqual(findingsOf(root, "reading-kana-in-chapter"), []);
  } finally {
    cleanup();
  }
});

test("reading-kanji-taught-as-word: a silent kanji card whose kanji a chapter teaches as a word", () => {
  const snapshot = (items) =>
    JSON.stringify({ phase: "reading", provenance: {}, counts: {}, items });
  const spring = word("a", "春", { english: "Spring" });
  // Chapter 02's merge carded 春 as a word; the book pass then dropped it for Chapter 01's character.
  let fixture = readingRoot([spring], { extraUnits: [["chapter-1", []]] });
  try {
    writeRaw(
      fixture.root,
      `${READING_BOOK}/chapter-1/as-generated.json`,
      snapshot([{ id: "a", target: "春", ttsText: "はる", kind: "word" }]),
    );
    assert.match(
      findingsOf(fixture.root, "reading-kanji-taught-as-word").join("\n"),
      /"春" is a silent kanji card, and the book teaches it as a word in chapter-1 \(はる\)/,
    );
  } finally {
    fixture.cleanup();
  }
  // A snapshot from before `kind` was recorded: a reading means a word.
  fixture = readingRoot([spring], { extraUnits: [["chapter-1", []]] });
  try {
    writeRaw(
      fixture.root,
      `${READING_BOOK}/chapter-1/as-generated.json`,
      snapshot([{ id: "a", target: "春", ttsText: "はる" }]),
    );
    assert.equal(findingsOf(fixture.root, "reading-kanji-taught-as-word").length, 1);
  } finally {
    fixture.cleanup();
  }
  // Clean: the kanji is only ever a character; and 年, which the book reads two ways, stays silent.
  fixture = readingRoot([spring, word("b", "年")], { extraUnits: [["chapter-1", []]] });
  try {
    writeRaw(
      fixture.root,
      `${READING_BOOK}/chapter-1/as-generated.json`,
      snapshot([
        { id: "a", target: "春", kind: "character" },
        { id: "b", target: "年", ttsText: "ねん", kind: "word" },
      ]),
    );
    writeRaw(
      fixture.root,
      `${READING_BOOK}/chapter-0/reading-report.json`,
      JSON.stringify({ dropped: [{ target: "年", reason: "x", wordReadings: ["とし"] }] }),
    );
    assert.deepEqual(findingsOf(fixture.root, "reading-kanji-taught-as-word"), []);
  } finally {
    fixture.cleanup();
  }
  // The colour nouns are words wherever they are carded.
  expect(
    "reading-kanji-taught-as-word",
    [word("c", "赤", { english: "Red" })],
    [word("c", "赤", { english: "Red", ttsText: "あか", pronunciation: "aka" })],
    /taught by rule/,
  );
});

test("reading-uncarded-kanji: a word whose kanji has no card anywhere in the collection", () => {
  const major = word("a", "専攻", {
    english: "Major",
    ttsText: "せんこう",
    pronunciation: "senkō",
  });
  // Failing: nothing cards 専 or 攻. Passing: both have a silent character card (any unit would do).
  expect(
    "reading-uncarded-kanji",
    [major],
    [major, word("b", "専", { english: "Exclusive" }), word("c", "攻", { english: "Attack" })],
    /"専" has no card anywhere in the collection, and chapter-0\/a "専攻" uses it/,
  );
});

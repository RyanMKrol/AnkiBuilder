import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  READING_PHASE_STEPS,
  reconcileReading,
  findReadingGaps,
  readingCardId,
  runReadingPhase,
  earlierReadingTargets,
} from "../../src/reading/readingPhase.js";
import {
  renderReadingTablePrompt,
  renderReadingChapterPrompt,
  renderReadingImagePrompt,
  renderReadingCoveragePrompt,
  assertTablesJudged,
  sectionsUnaccounted,
} from "../../src/reading/readingAgents.js";
import { lessonReadiness } from "../../src/cards/readiness.js";
import { validateCards } from "../../src/model/index.js";

// The reading phase (docs/designs/reading-decks/06-reading-extraction.md): one chapter to a
// reviewable reading unit, with the rules the code can see enforced in the merge.

const ids = (steps) => steps.map((s) => s.id);

test("the steps run raw material first, merge before snapshot, adversary after, unit last", () => {
  const order = ids(READING_PHASE_STEPS);
  const at = (id) => order.indexOf(id);
  for (const raw of ["tables", "sections", "images"]) {
    for (const agent of ["table-reader", "chapter-reader", "image-reader"]) {
      assert.ok(at(raw) < at(agent), `${raw} feeds ${agent}`);
    }
  }
  assert.ok(at("image-reader") < at("reconcile"));
  assert.ok(at("reconcile") < at("snapshot"));
  assert.ok(at("snapshot") < at("coverage-adversary"));
  assert.equal(order.at(-1), "write-unit");
});

test("the merge keeps one card per written form, glossed by the first reader to find it", () => {
  const { items, provenance } = reconcileReading(
    [
      [{ target: "映画", reading: "えいが", english: "Movie", kind: "word", producedBy: "t" }],
      [
        {
          target: " 映画",
          reading: "えいが",
          english: "movie; film",
          kind: "word",
          producedBy: "c",
        },
      ],
    ],
    { targetLanguage: "ja" },
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].target, "映画");
  assert.equal(items[0].english, "Movie");
  assert.equal(items[0].ttsText, "えいが");
  assert.equal(items[0].id, readingCardId("映画"));
  assert.deepEqual(provenance[items[0].id], ["t", "c"]);
});

test("the merge enforces the rules: no single kana, the word wins, a character is silent", () => {
  const { items, dropped } = reconcileReading(
    [
      [
        { target: "あ", english: "a", kind: "character", producedBy: "t" },
        {
          target: "月",
          english: "Moon; month",
          reading: "つき",
          kind: "character",
          producedBy: "t",
        },
        { target: "日", english: "Day; sun", kind: "character", producedBy: "t" },
      ],
      [{ target: "日", english: "Day", reading: "ひ", kind: "word", producedBy: "c" }],
    ],
    { targetLanguage: "ja" },
  );
  assert.deepEqual(
    dropped.map((d) => d.target),
    ["あ"],
  );
  const byTarget = Object.fromEntries(items.map((i) => [i.target, i]));
  // A character card never carries a reading, even one an agent attached.
  assert.equal("ttsText" in byTarget["月"], false);
  // The word wins: 日 taught as a word keeps its reading and is voiced.
  assert.equal(byTarget["日"].ttsText, "ひ");
});

test("the merge drops what this collection already carded, and says where", () => {
  const { items, dropped } = reconcileReading(
    [[{ target: "映画", reading: "えいが", english: "Movie", kind: "word", producedBy: "t" }]],
    { targetLanguage: "ja", earlier: [{ target: "映画", chapterLabel: "Chapter 06: Lesson 3" }] },
  );
  assert.equal(items.length, 0);
  assert.match(dropped[0].reason, /Chapter 06: Lesson 3/);
});

test("the merge notes two readings, and a kanji word the book gave no reading for", () => {
  const { items, readingConflicts } = reconcileReading(
    [
      [
        { target: "今日", reading: "きょう", english: "Today", kind: "word", producedBy: "t" },
        {
          target: "今日",
          reading: "こんにち",
          english: "These days",
          kind: "word",
          producedBy: "t",
        },
        { target: "学生", english: "Student", kind: "word", producedBy: "c" },
      ],
    ],
    { targetLanguage: "ja" },
  );
  assert.deepEqual(readingConflicts, [{ target: "今日", readings: ["きょう", "こんにち"] }]);
  const byTarget = Object.fromEntries(items.map((i) => [i.target, i]));
  assert.equal(byTarget["今日"].english, "Today; These days");
  assert.match(byTarget["今日"].reviewNote, /more than one reading/);
  assert.match(byTarget["学生"].reviewNote, /No reading was found/);
});

test("a language with no reading plugin gets no character cards", () => {
  const { items, dropped } = reconcileReading(
    [
      [
        { target: "à", english: "to", kind: "word", producedBy: "t" },
        { target: "maison", english: "House", kind: "word", producedBy: "t" },
      ],
    ],
    { targetLanguage: "fr" },
  );
  assert.deepEqual(
    items.map((i) => i.target),
    ["maison"],
  );
  assert.equal(dropped[0].target, "à");
});

test("coverage gaps are a set difference, and neither rule drops nor earlier cards count", () => {
  const gaps = findReadingGaps(
    [
      { target: "映画" },
      { target: "音楽", english: "Music" },
      { target: "あ" },
      { target: "雑誌" },
    ],
    [{ target: "映画" }, { target: "テニス" }],
    { dropped: [{ target: "あ" }, { target: "雑誌" }] },
  );
  assert.deepEqual(gaps.gaps, [{ target: "音楽", english: "Music" }]);
  assert.deepEqual(gaps.onlyInUnit, ["テニス"]);
  assert.deepEqual(gaps.counts, { enumerated: 4, unit: 2, gaps: 1 });
});

test("every agent judges everything it was given", () => {
  assert.throws(
    () => assertTablesJudged([{ index: 0 }, { index: 1 }], [{ index: 0, verdict: "vocabulary" }]),
    /no verdict for table\(s\) 1/,
  );
  assert.throws(
    () => assertTablesJudged([{ index: 0 }], [{ index: 0, verdict: "grammar" }]),
    /verdict "grammar"/,
  );
  assert.deepEqual(
    sectionsUnaccounted([{ title: "A" }, { title: "A" }, { title: "B" }], [{ title: "A" }]),
    ["A", "B"],
  );
});

test("the reading prompts render whole, with the reading rules and the Japanese block", () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-prompts-"));
  try {
    const chapter = join(dir, "chapter.xhtml");
    writeFileSync(chapter, "<html><body><h2>Vocabulary</h2></body></html>");
    const rendered = [
      renderReadingTablePrompt({
        tables: [{ index: 0, className: null, rows: [[{ text: "えいが" }, { text: "映画" }]] }],
        targetLanguage: "ja",
      }),
      renderReadingChapterPrompt({
        chapterFilePath: chapter,
        sections: [{ title: "Vocabulary", level: 2 }],
        targetLanguage: "ja",
      }),
      renderReadingImagePrompt({ imagePaths: ["/x/a.jpg"], targetLanguage: "ja" }),
      renderReadingCoveragePrompt({ chapterFilePath: chapter, targetLanguage: "ja" }),
    ];
    for (const prompt of rendered) {
      assert.match(prompt, /One card per written form/);
      assert.match(prompt, /COPIED from the book/);
      assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
      // The speaking rules never reach a reading prompt.
      assert.doesNotMatch(prompt, /Production/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a reading unit is ready for review with no speaking passes", () => {
  assert.equal(lessonReadiness({ phase: "reading", sourceType: "epub" }, []).ready, true);
});

function fakeAgents(calls) {
  const record = (name, value) => () => {
    calls.push(name);
    return value;
  };
  return {
    readTables: record("tables", {
      items: [
        {
          target: "映画",
          reading: "えいが",
          english: "Movie",
          kind: "word",
          producedBy: "readingTableReader",
        },
        { target: "日", english: "Day; sun", kind: "character", producedBy: "readingTableReader" },
      ],
      tables: [{ index: 0, verdict: "vocabulary" }],
    }),
    readChapterForReading: record("chapter", {
      items: [
        {
          target: "おはようございます",
          english: "Good morning",
          kind: "phrase",
          category: "Greetings",
          producedBy: "readingChapterReader",
        },
      ],
      sections: [{ title: "Vocabulary", read: true, items: 1 }],
      unread: [],
    }),
    readImagesForReading: record("images", { items: [], images: [] }),
    enumerateForReading: record("adversary", {
      items: [{ target: "映画" }, { target: "音楽", english: "Music" }],
      coverage: { notes: "n" },
    }),
  };
}

test("the phase writes a valid reading unit, and a re-run pays for nothing already done", () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-phase-"));
  try {
    const unitDir = join(dir, "chapter-0");
    const chapterFilePath = join(dir, "chapter.xhtml");
    writeFileSync(
      chapterFilePath,
      "<html><body><h2>Vocabulary</h2><table><tr><td>えいが</td><td>映画</td></tr></table>" +
        "<p>おはようございます</p></body></html>",
    );
    const calls = [];
    const options = {
      unitDir,
      chapterFilePath,
      targetLanguage: "ja",
      unit: { epubHash: "abc", chapterNumber: 3, chapterLabel: "Chapter 02: Greetings" },
      agents: fakeAgents(calls),
    };
    const result = runReadingPhase(options);
    assert.equal(result.verdict.ok, true, result.verdict.problems.join("; "));
    assert.deepEqual(calls, ["tables", "chapter", "images", "adversary"]);

    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    assert.doesNotThrow(() => validateCards(cards));
    assert.equal(cards.meta.phase, "reading");
    assert.equal(cards.meta.chapterLabel, "Chapter 02: Greetings");
    assert.deepEqual(
      cards.items.map((i) => i.target).sort(),
      ["おはようございます", "日", "映画"].sort(),
    );
    assert.ok(existsSync(join(unitDir, "corpus.json")));
    assert.ok(existsSync(join(unitDir, "as-generated.json")));
    const coverage = JSON.parse(readFileSync(join(unitDir, "candidates/coverage.json"), "utf-8"));
    assert.deepEqual(
      coverage.gaps.map((g) => g.target),
      ["音楽"],
    );

    // A second run reuses every paid step from disk: no agent is called.
    const again = [];
    const rerun = runReadingPhase({ ...options, agents: fakeAgents(again) });
    assert.deepEqual(again, []);
    assert.equal(rerun.items.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("earlier units of the same collection count as already carded", () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-earlier-"));
  try {
    const write = (name, chapterNumber, targets) => {
      const unit = join(dir, name);
      rmSync(unit, { recursive: true, force: true });
      mkdirSync(unit, { recursive: true });
      writeFileSync(
        join(unit, "cards.json"),
        JSON.stringify({
          meta: { chapterNumber, chapterLabel: `L${chapterNumber}` },
          items: targets.map((target) => ({ target })),
        }),
      );
    };
    write("chapter-0", 2, ["映画"]);
    write("chapter-1", 5, ["音楽"]);
    const earlier = earlierReadingTargets(dir, 4, [{ target: "雑誌", __chapterLabel: "L1" }]);
    assert.deepEqual(earlier.map((e) => e.target).sort(), ["映画", "雑誌"].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the book's full stop and a beginners' book's spaces never make a second card", () => {
  // Found on the first live run (Genki's Greetings): the table reader copied おはよう。 and the chapter
  // reader おはよう ございます, and the merge made two cards of each phrase.
  const { items } = reconcileReading(
    [
      [
        {
          target: "おはようございます。",
          english: "Good morning.",
          kind: "phrase",
          producedBy: "t",
        },
        {
          target: "すみません。",
          english: "Excuse me.; I'm sorry.",
          kind: "phrase",
          producedBy: "t",
        },
      ],
      [
        { target: "おはよう ございます", english: "Good morning", kind: "phrase", producedBy: "c" },
        { target: "お元気ですか？", english: "How are you?", kind: "phrase", producedBy: "c" },
      ],
    ],
    { targetLanguage: "ja" },
  );
  const byTarget = Object.fromEntries(items.map((i) => [i.target, i]));
  assert.deepEqual(
    Object.keys(byTarget).sort(),
    ["おはようございます", "お元気ですか？", "すみません"].sort(),
  );
  assert.equal(byTarget["おはようございます"].english, "Good morning.");
  assert.equal(byTarget["すみません"].english, "Excuse me; I'm sorry");
});

test("a card's English comes from one reader, the table first, not every reader's wording", () => {
  // Found on the second live run: the three readers' paraphrases were all joined onto one back.
  const { items } = reconcileReading(
    [
      [
        {
          target: "いただきます",
          english: "Thank you for the meal. (before eating)",
          producedBy: "t",
        },
      ],
      [
        {
          target: "いただきます",
          english: "Thanks for the meal (said before eating)",
          producedBy: "c",
        },
      ],
      [{ target: "さようなら", english: "Good-bye", producedBy: "i" }],
      [{ target: "さようなら", english: "Goodbye", producedBy: "i" }],
    ],
    { targetLanguage: "ja" },
  );
  const byTarget = Object.fromEntries(items.map((i) => [i.target, i]));
  assert.equal(byTarget["いただきます"].english, "Thank you for the meal. (before eating)");
  assert.equal(byTarget["さようなら"].english, "Good-bye");
});

test("a heading with furigana counts as read when the reader reports it without the spaces", () => {
  // Found on the Lesson 3 run of the Genki everything conversion: 単 語 Vocabulary (parsed) against
  // 単語 Vocabulary (reported) refused a finished response.
  assert.deepEqual(
    sectionsUnaccounted(
      [{ title: "単 語 Vocabulary" }, { title: "文 法 Grammar" }],
      [{ title: "単語 Vocabulary" }, { title: "文法　Grammar" }],
    ),
    [],
  );
});

test("a kana form that is a kanji word's reading is the same word, and a suffix's tilde goes", () => {
  // Found on the Lesson 3 pilot: an illustration labelled verbs in kana, so たべる was carded beside
  // 食べる; and the table's 〜ごろ and the text's ごろ made two cards.
  const { items, dropped } = reconcileReading(
    [
      [
        { target: "食べる", reading: "たべる", english: "To eat", kind: "word", producedBy: "t" },
        { target: "〜ごろ", english: "At about . . .", kind: "word", producedBy: "t" },
        { target: "スポーツ", english: "Sports", kind: "word", producedBy: "t" },
      ],
      [
        { target: "たべる", english: "Eat", kind: "word", producedBy: "i" },
        { target: "ごろ", english: "At about", kind: "word", producedBy: "c" },
      ],
    ],
    { targetLanguage: "ja" },
  );
  assert.deepEqual(items.map((i) => i.target).sort(), ["ごろ", "スポーツ", "食べる"].sort());
  assert.match(dropped.find((d) => d.target === "たべる").reason, /食べる/);
});

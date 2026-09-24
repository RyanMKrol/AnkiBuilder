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
  laterBuiltChapters,
} from "../../src/reading/readingPhase.js";
import {
  renderReadingTablePrompt,
  renderReadingChapterPrompt,
  renderReadingImagePrompt,
  renderReadingCoveragePrompt,
  assertTablesJudged,
  sectionsUnaccounted,
  sectionsToAccountFor,
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

test("a single kana taught as a word is a card; one taught as a letter is not", () => {
  // Genki's Numbers: に "Two" is a word. The kana chart's に is a letter.
  const { items, kanaPool, dropped } = reconcileReading(
    [
      [
        { target: "に", english: "Two", kind: "word", producedBy: "c" },
        { target: "ご", english: "Five", kind: "word", producedBy: "c" },
        { target: "あ", english: "a", kind: "character", producedBy: "t" },
        { target: "い", english: "i", producedBy: "t" },
      ],
    ],
    { targetLanguage: "ja" },
  );
  // The words are kept, for the kana deck; the letters are dropped as letters.
  assert.deepEqual(items, []);
  assert.deepEqual(kanaPool.map((i) => i.target).sort(), ["ご", "に"]);
  assert.deepEqual(
    dropped
      .filter((d) => /letter/.test(d.reason))
      .map((d) => d.target)
      .sort(),
    ["あ", "い"],
  );
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
    // The romaji step, faked like every agent: the real one loads a dictionary and calls a model.
    romanizeReadingItems: async (items, { isSilent, cached }) => {
      const todo = items.filter((i) => !isSilent(i) && !cached[i.id]);
      if (todo.length) calls.push("romaji");
      return {
        items: items.map((i) => ({
          ...i,
          pronunciation: isSilent(i) ? "" : (cached[i.id] ?? `r:${i.target}`),
        })),
        romanized: todo.map((i) => ({
          id: i.id,
          target: i.target,
          pronunciation: `r:${i.target}`,
        })),
        reused: items.length - todo.length,
        skipped: [],
        failed: false,
        reason: null,
      };
    },
  };
}

test("the phase writes a valid reading unit, and a re-run pays for nothing already done", async () => {
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
    const result = await runReadingPhase(options);
    assert.equal(result.verdict.ok, true, result.verdict.problems.join("; "));
    assert.deepEqual(calls, ["tables", "chapter", "images", "romaji", "adversary"]);

    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    assert.doesNotThrow(() => validateCards(cards));
    assert.equal(cards.meta.phase, "reading");
    assert.equal(cards.meta.chapterLabel, "Chapter 02: Greetings");
    assert.deepEqual(cards.items.map((i) => i.target).sort(), ["日", "映画"].sort());
    // The romaji is on every voiced card and absent from the silent kanji.
    const byTarget = Object.fromEntries(cards.items.map((i) => [i.target, i]));
    assert.equal(byTarget["映画"].pronunciation, "r:映画");
    assert.equal(byTarget["日"].pronunciation, "");
    // The voice is given the written form of a kanji word, through the speaking decks' own switch.
    assert.equal(cards.meta.kanjiTts, true);
    assert.equal(byTarget["映画"].ttsKanji, "映画");
    assert.equal(byTarget["日"].ttsKanji, undefined);
    // The kana word is not a chapter card: it is in the report's pool, for the kana deck.
    const report = JSON.parse(readFileSync(join(unitDir, "reading-report.json"), "utf-8"));
    assert.deepEqual(
      report.kanaPool.map((i) => i.target),
      ["おはようございます"],
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
    const rerun = await runReadingPhase({ ...options, agents: fakeAgents(again) });
    assert.deepEqual(again, []);
    assert.equal(rerun.items.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed romaji correction is not cached, so the next run corrects it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-romaji-retry-"));
  try {
    const unitDir = join(dir, "chapter-0");
    const chapterFilePath = join(dir, "chapter.xhtml");
    writeFileSync(chapterFilePath, "<html><body><p>おはようございます</p></body></html>");
    const options = {
      unitDir,
      chapterFilePath,
      targetLanguage: "ja",
      unit: { epubHash: "abc", chapterNumber: 3, chapterLabel: "Chapter 02: Greetings" },
    };
    const failing = fakeAgents([]);
    const inner = failing.romanizeReadingItems;
    failing.romanizeReadingItems = async (items, opts) => ({
      ...(await inner(items, opts)),
      failed: true,
      reason: "not JSON",
    });
    await runReadingPhase({ ...options, agents: failing });

    const again = [];
    await runReadingPhase({ ...options, agents: fakeAgents(again) });
    assert.deepEqual(again, ["romaji"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a kana word's optional ending in brackets becomes the full form, one card", () => {
  // Genki's Greetings prints おやすみ(なさい) and also おやすみなさい.
  const { items: chapterItems, kanaPool } = reconcileReading(
    [
      [
        { target: "おやすみ(なさい)", english: "Good night", kind: "phrase", producedBy: "t" },
        { target: "ごちそうさま（でした）", english: "Thanks for the meal", producedBy: "t" },
      ],
      [{ target: "おやすみなさい", english: "Good night", kind: "phrase", producedBy: "c" }],
    ],
    { targetLanguage: "ja" },
  );
  // Kana words go to the kana pool (the kana deck), after every rule below has applied to them.
  const items = [...chapterItems, ...kanaPool];
  assert.deepEqual(items.map((i) => i.target).sort(), ["おやすみなさい", "ごちそうさまでした"]);
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
  const { items: chapterItems, kanaPool } = reconcileReading(
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
  // Kana words go to the kana pool (the kana deck), after every rule below has applied to them.
  const items = [...chapterItems, ...kanaPool];
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
  const { items: chapterItems, kanaPool } = reconcileReading(
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
  // Kana words go to the kana pool (the kana deck), after every rule below has applied to them.
  const items = [...chapterItems, ...kanaPool];
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
  const {
    items: chapterItems,
    kanaPool,
    dropped,
  } = reconcileReading(
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
  // Kana words go to the kana pool (the kana deck), after every rule below has applied to them.
  const items = [...chapterItems, ...kanaPool];
  assert.deepEqual(items.map((i) => i.target).sort(), ["ごろ", "スポーツ", "食べる"].sort());
  assert.match(dropped.find((d) => d.target === "たべる").reason, /食べる/);
});

test("two readings printed as one are split, the first voiced and the rest named", () => {
  // Found on the Genki kanji lesson pilot: 七 came back with the reading "しち／なな".
  const { items, readingConflicts } = reconcileReading(
    [
      [
        {
          target: "十歳",
          reading: "じゅっさい／じっさい",
          english: "Ten years old",
          kind: "word",
          producedBy: "t",
        },
      ],
    ],
    { targetLanguage: "ja" },
  );
  assert.equal(items[0].ttsText, "じゅっさい");
  assert.deepEqual(readingConflicts, [{ target: "十歳", readings: ["じゅっさい", "じっさい"] }]);
  assert.match(items[0].reviewNote, /じっさい/);
});

test("two written forms printed as one headword become two cards", () => {
  // Found on the Genki Lesson 1 pilot: なん／なに came through as one card.
  const { items: chapterItems, kanaPool } = reconcileReading(
    [
      [
        { target: "なん／なに", english: "What", kind: "word", producedBy: "t" },
        {
          target: "十歳／十才",
          reading: "じゅっさい／じゅっさい",
          english: "Ten years old",
          producedBy: "t",
        },
      ],
    ],
    { targetLanguage: "ja" },
  );
  // Kana words go to the kana pool (the kana deck), after every rule below has applied to them.
  const items = [...chapterItems, ...kanaPool];
  assert.deepEqual(items.map((i) => i.target).sort(), ["なん", "なに", "十才", "十歳"].sort());
  assert.ok(items.every((i) => i.english));
  assert.equal(items.find((i) => i.target === "十才").ttsText, "じゅっさい");
});

test("the chapters built after this one in book order are named, so they can be re-merged", () => {
  const dir = mkdtempSync(join(tmpdir(), "reading-later-"));
  try {
    for (const [name, chapterNumber] of [
      ["chapter-0", 2],
      ["chapter-1", 6],
      ["chapter-2", 18],
    ]) {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(
        join(dir, name, "cards.json"),
        JSON.stringify({ meta: { chapterNumber, chapterLabel: `C${chapterNumber}` }, items: [] }),
      );
    }
    assert.deepEqual(
      laterBuiltChapters(dir, 4)
        .map((u) => u.label)
        .sort(),
      ["C18", "C6"],
    );
    assert.deepEqual(laterBuiltChapters(dir, 18), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the voice gets the written form, except a single kanji word or a word with two readings", async () => {
  const { spokenFromWrittenForm } = await import("../../src/reading/readingPhase.js");
  const { readingScheme } = await import("../../src/reading/readingSchemes.js");
  const scheme = readingScheme("ja");
  const conflicted = new Set(["今日"]);
  const spoken = (item) => spokenFromWrittenForm(item, { scheme, conflicted });
  assert.equal(spoken({ target: "週末", ttsText: "しゅうまつ" }), true);
  assert.equal(spoken({ target: "食べる", ttsText: "たべる" }), true);
  assert.equal(spoken({ target: "一", ttsText: "いち" }), false);
  assert.equal(spoken({ target: "今日", ttsText: "きょう" }), false);
  assert.equal(spoken({ target: "おはよう" }), false);
  assert.equal(spoken({ target: "日" }), false);
});

test("a chapter's own title heading need not be reported, but a lone heading must", () => {
  const title = { level: 1, title: "Chapter 03: Numbers" };
  const body = [
    { level: 2, title: "すうじ" },
    { level: 2, title: "れんしゅう Practice" },
  ];
  assert.deepEqual(sectionsToAccountFor([title, ...body]), body);
  assert.deepEqual(sectionsToAccountFor([title]), [title]);
  const twoTitles = [title, { level: 1, title: "Appendix" }];
  assert.deepEqual(sectionsToAccountFor(twoTitles), twoTitles);
});

test("a coverage gap is not reported for a headword the merge split into its forms", () => {
  const { gaps } = findReadingGaps(
    [{ target: "なん／なに", english: "What" }, { target: "おやすみ(なさい)" }],
    [{ target: "なん" }, { target: "なに" }, { target: "おやすみなさい" }],
    { targetLanguage: "ja" },
  );
  assert.deepEqual(gaps, []);
});

test("a chapter with no kanji is written with no cards, and needs no review", async () => {
  // Genki's Greetings, Numbers and Lesson 1: every word is kana, so every word goes to the kana deck.
  const dir = mkdtempSync(join(tmpdir(), "reading-no-kanji-"));
  try {
    const unitDir = join(dir, "chapter-0");
    const chapterFilePath = join(dir, "chapter.xhtml");
    writeFileSync(chapterFilePath, "<html><body><p>おはようございます</p></body></html>");
    const agents = fakeAgents([]);
    agents.readTables = () => ({ items: [], tables: [] });
    await runReadingPhase({
      unitDir,
      chapterFilePath,
      targetLanguage: "ja",
      unit: { epubHash: "abc", chapterNumber: 1, chapterLabel: "Chapter 01: Greetings" },
      agents,
    });
    const cards = JSON.parse(readFileSync(join(unitDir, "cards.json"), "utf-8"));
    assert.deepEqual(cards.items, []);
    assert.equal(cards.meta.reviewed, true);
    assert.equal(cards.meta.done, true);
    // Its corpus.json is written too: it is how a re-run finds this folder and its saved readings.
    assert.ok(existsSync(join(unitDir, "corpus.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

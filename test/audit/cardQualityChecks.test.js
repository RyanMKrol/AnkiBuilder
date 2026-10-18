import test from "node:test";
import assert from "node:assert/strict";
import { ALL_CHECKS, audit } from "../../src/audit/index.js";
import { makeOutputRoot, writeUnit, card } from "./fixture.js";

// The shapes from the 2026-10 QA learner pass (themes 2, 7, 9 and 11). Every one is INFO: these
// tests pin what each check names and, just as much, what it leaves alone.

function runOnly(root, id) {
  return audit({ outputRoot: root, checks: ALL_CHECKS, only: [id] }).results;
}
const messages = (results) => results.flatMap((r) => r.findings.map((f) => f.message));

function withUnits(units, fn) {
  const { root, cleanup } = makeOutputRoot();
  try {
    for (const [path, items] of units) writeUnit(root, path, { items });
    return fn(root);
  } finally {
    cleanup();
  }
}

test("every new check is INFO, so none of them can block a build", () => {
  for (const id of ["builder-note", "cue-leak", "polite-form-label", "romaji-consistency"]) {
    const check = ALL_CHECKS.find((c) => c.id === id);
    assert.ok(check, `${id} is registered`);
    assert.equal(check.tier, "INFO", id);
  }
});

test("builder note: book sections, set membership, positions and the dialogue are named", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          card("grammar", { note: "As in GRAMMAR 2, は marks the topic." }),
          card("notes", { note: "For the history, see NOTES." }),
          card("exercise", { hint: "the answer from Exercise 4" }),
          card("above", { note: "Compare いきましょう below." }),
          card("member", { note: "Member 3 of the 8,000えん set." }),
          card("dialogue", { scene: "from this lesson's dialogue" }),
        ],
      ],
    ],
    (root) => {
      const found = messages(runOnly(root, "builder-note"));
      assert.equal(found.length, 6, found.join("\n"));
      for (const id of ["grammar", "notes", "exercise", "above", "member", "dialogue"]) {
        assert.ok(
          found.some((m) => m.startsWith(`${id} `)),
          `${id} is named`,
        );
      }
    },
  );
});

test("builder note: ordinary English, reviewNote and excluded cards are left alone", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          card("plain", { note: "Said when you enter a shop." }),
          card("sport", { english: "exercise", note: "Daily exercise, as in running." }),
          card("internal", { reviewNote: "moved from the card above" }),
          card("gone", { note: "GRAMMAR 2", excluded: true }),
        ],
      ],
    ],
    (root) => assert.deepEqual(messages(runOnly(root, "builder-note")), []),
  );
});

test("builder note: two pointers in one note are one finding, keyed on card and field", () => {
  withUnits(
    [["epubs/book/chapter-1", [card("both", { note: "GRAMMAR 1. Compare the card below." })]]],
    (root) => {
      const keys = runOnly(root, "builder-note").flatMap((r) => r.findings.map((f) => f.key));
      assert.deepEqual(keys, ["chapter-1/both::note"]);
    },
  );
});

test("cue leak: a scene with the English, or a hint with the target or its romaji, is named", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          card("made", { english: "until", target: "まで", scene: "a particle meaning until" }),
          card("nan", { english: "what", target: "なん", pronunciation: "nan", hint: "なんじ" }),
          card("glass", {
            english: "glass",
            target: "グラス",
            pronunciation: "gurasu",
            hint: "said gurasu",
          }),
          card("scene-target", {
            english: "hours",
            target: "じかん",
            pronunciation: "jikan",
            scene: "the じかん counter",
          }),
        ],
      ],
    ],
    (root) => {
      const found = messages(runOnly(root, "cue-leak"));
      assert.equal(found.length, 4, found.join("\n"));
      assert.ok(found.some((m) => /^made scene .*"until".*Recognition front/.test(m)));
      assert.ok(found.some((m) => /^nan hint holds the target.*Production front/.test(m)));
      assert.ok(found.some((m) => /^glass hint holds its romaji/.test(m)));
      assert.ok(found.some((m) => /^scene-target scene holds the target/.test(m)));
    },
  );
});

test("cue leak: a hint with the English, a one-kana target and a clean cue are not leaks", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          // The hint never renders on the Recognition front, and Production already shows the English.
          card("hint-english", { english: "station", target: "えき", hint: "the station by name" }),
          // A one-kana particle is inside every Japanese scene; the minimum length keeps it quiet.
          card("particle", {
            english: "topic marker",
            target: "は",
            pronunciation: "wa",
            scene: "わたしは",
          }),
          card("clean", { english: "Is it?", target: "そうですか", scene: "reacting to news" }),
          // A two-letter romaji is inside ordinary English words.
          card("short", {
            english: "and",
            target: "と",
            pronunciation: "to",
            hint: "joining two nouns",
          }),
          card("cue-word", { english: "rest", target: "やすみます", scene: "the restaurant" }),
        ],
      ],
    ],
    (root) => assert.deepEqual(messages(runOnly(root, "cue-leak")), []),
  );
});

test("polite form label: a ます form called plain or dictionary is named", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          card("machimasu", {
            target: "まちます",
            note: "Plain/dictionary form of まってください.",
          }),
          card("kirei-deshita", {
            target: "きれいでした",
            note: "きれい is a な-adjective; きれいでした is its plain past form.",
          }),
          card("tsutomemasu", {
            target: "つとめます",
            hint: "the plain ます-form, not the ています form",
          }),
        ],
      ],
    ],
    (root) => {
      const found = messages(runOnly(root, "polite-form-label"));
      assert.equal(found.length, 3, found.join("\n"));
      assert.match(
        found.find((m) => m.startsWith("machimasu")),
        /Plain\/dictionary form/,
      );
      assert.match(
        found.find((m) => m.startsWith("kirei-deshita")),
        /is its plain past form/,
      );
    },
  );
});

test("polite form label: naming another word's dictionary form is the correct use, not a label", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          card("kakimasu", {
            target: "かきます",
            note: "ます-form of かく; かく is the dictionary form, used before のが.",
          }),
          card("utaimasu", {
            target: "うたいます",
            note: "Its dictionary form うたう is what のが needs.",
          }),
          // A dictionary-form card may be called one.
          card("tatsu", { target: "たつ", note: "Dictionary form of たちます." }),
          // Bare です: the dictionary form inside the sentence is correctly named.
          card("miru", {
            target: "みるのがすきです",
            note: "Dictionary form, then のが.",
          }),
          card("ordinary", { target: "みずがあります", note: "Plain cold water." }),
        ],
      ],
    ],
    (root) => assert.deepEqual(messages(runOnly(root, "polite-form-label")), []),
  );
});

test("romaji consistency: a word spelled two ways across the collection is one finding", () => {
  withUnits(
    [
      ["epubs/book/chapter-1", [card("iie", { target: "いいえ", pronunciation: "īe" })]],
      [
        "epubs/book/chapter-1-extras",
        [
          card("iie-sentence", {
            target: "いいえ、インドじんです",
            pronunciation: "iie, Indojin desu",
          }),
        ],
      ],
    ],
    (root) => {
      const [result] = runOnly(root, "romaji-consistency");
      assert.equal(result.findings.length, 1, messages([result]).join("\n"));
      assert.equal(result.findings[0].key, "two-ways::いいえ");
      assert.match(result.findings[0].message, /"īe" ×1.*"iie" ×1/);
    },
  );
});

test("romaji consistency: case, hyphens, one-kana words and unaligned cards are not variants", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          // Japan and two bottles: two words, told apart by the counter hyphen.
          card("japan", { target: "にほん", pronunciation: "Nihon" }),
          card("two-bottles", { target: "にほん", pronunciation: "ni-hon" }),
          // The particle and 歯 "tooth".
          card("wa", { target: "は", pronunciation: "wa" }),
          card("tooth", { target: "は", pronunciation: "ha" }),
          // Two kana segments against one romaji segment cannot be paired.
          card("unaligned", { target: "はい、そうです", pronunciation: "hai sō desu" }),
          card("hai", { target: "はい、どうぞ", pronunciation: "hai, dōzo" }),
        ],
      ],
    ],
    (root) => {
      const [result] = runOnly(root, "romaji-consistency");
      assert.deepEqual(messages([result]), []);
    },
  );
});

test("romaji consistency: uu/ee/aa are named only where the collection writes macrons", () => {
  withUnits(
    [
      [
        "epubs/book/chapter-1",
        [
          card("yuumei", { target: "ゆうめい", pronunciation: "yuumei" }),
          card("ee", { target: "ええ", pronunciation: "ee" }),
          card("raamen", { target: "ラーメン", pronunciation: "raamen" }),
          card("macron", { target: "とうきょう", pronunciation: "tōkyō" }),
          card("ii", { target: "おいしい", pronunciation: "oishii" }),
        ],
      ],
    ],
    (root) => {
      const keys = runOnly(root, "romaji-consistency").flatMap((r) => r.findings.map((f) => f.key));
      assert.deepEqual(keys.sort(), [
        "doubled-vowel::chapter-1/ee",
        "doubled-vowel::chapter-1/raamen",
        "doubled-vowel::chapter-1/yuumei",
      ]);
    },
  );
  withUnits(
    [["epubs/book/chapter-1", [card("yuumei", { target: "ゆうめい", pronunciation: "yuumei" })]]],
    (root) => {
      const [result] = runOnly(root, "romaji-consistency");
      assert.equal(result.findings.length, 0);
      assert.ok(result.notes.some((n) => /no macron/.test(n)));
    },
  );
});

test("romaji consistency: a collection with no pinned style is skipped, not passed", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/spanish/chapter-1", {
      meta: { targetLanguage: "es" },
      items: [card("hola", { pronunciation: "hola" })],
    });
    const [result] = runOnly(root, "romaji-consistency");
    assert.ok(result.skipped);
  } finally {
    cleanup();
  }
});

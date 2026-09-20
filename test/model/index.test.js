import { test } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import {
  validateCorpus,
  validateCards,
  libraryHome,
  runPaths,
  isKnownProvenanceField,
} from "../../src/model/index.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url)); // test/model/
const BASE_META = { targetLanguage: "ja", sourceType: "epub" };
const REPO_ROOT = resolve(join(TEST_DIR, "..", ".."));

test("validateCorpus - valid corpus passes validation", () => {
  const validCorpus = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        target: null,
      },
      {
        id: "2",
        english: "goodbye",
        category: "Greetings",
        hint: "formal",
        target: null,
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - accepts an optional `ttsText` (spoken form) on an item", () => {
  const validCorpus = {
    meta: { targetLanguage: "ja", sourceType: "epub" },
    items: [
      {
        id: "price",
        english: "2,000 yen",
        category: "Shopping",
        target: "2,000えん",
        ttsText: "にせんえん",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - target may be a real string instead of null", () => {
  const validCorpus = {
    meta: { targetLanguage: "ja", sourceType: "epub" },
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        hint: "a hint",
        target: "こんにちは",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - missing target fails validation (must be present, even if null)", () => {
  const invalidCorpus = {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [{ id: "1", english: "hello", category: "Greetings" }],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => /target/.test(err.message),
  );
});

test("validateCorpus - a non-null, non-string target fails validation", () => {
  const invalidCorpus = {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [{ id: "1", english: "hello", category: "Greetings", target: 5 }],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => err.message.includes("target"),
  );
});

test("validateCorpus - a category outside the enum fails validation", () => {
  const invalidCorpus = {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [{ id: "1", english: "hello", category: "Not A Real Category", target: null }],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => err.message.includes("category"),
  );
});

test("validateCorpus - accepts meta.epubHash and meta.chapterNumber when set", () => {
  const validCorpus = {
    meta: {
      targetLanguage: "ja",
      sourceType: "epub",
      reviewed: false,
      epubHash: "abc123def4567890",
      chapterNumber: 3,
    },
    items: [],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - accepts meta.chapterLabel when set", () => {
  const validCorpus = {
    meta: {
      targetLanguage: "ja",
      sourceType: "epub",
      reviewed: false,
      epubHash: "abc123def4567890",
      chapterNumber: 3,
      chapterLabel: "Lesson 3: Asking the Time",
    },
    items: [],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - accepts meta without epubHash/chapterNumber (backward compat)", () => {
  const validCorpus = {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - accepts meta.epubHash/chapterNumber explicitly set to null", () => {
  const validCorpus = {
    meta: { targetLanguage: "es", sourceType: "template", epubHash: null, chapterNumber: null },
    items: [],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - missing english field fails validation", () => {
  const invalidCorpus = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        category: "Greetings",
      },
    ],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => {
      return err.message.includes("english");
    },
  );
});

test("validateCorpus - missing category field fails validation", () => {
  const invalidCorpus = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        english: "hello",
      },
    ],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => {
      return err.message.includes("category");
    },
  );
});

test("validateCorpus - missing meta field fails validation", () => {
  const invalidCorpus = {
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
      },
    ],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => {
      return err.message.includes("meta");
    },
  );
});

test("validateCorpus - missing items field fails validation", () => {
  const invalidCorpus = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => {
      return err.message.includes("items");
    },
  );
});

test("validateCorpus - invalid sourceType fails validation", () => {
  const invalidCorpus = {
    meta: {
      targetLanguage: "es",
      sourceType: "invalid",
    },
    items: [],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => {
      return err.message.includes("sourceType");
    },
  );
});

test("validateCards - valid cards object passes validation", () => {
  const validCards = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        target: "hola",
        pronunciation: "OH-lah",
      },
      {
        id: "2",
        english: "goodbye",
        category: "Greetings",
        target: "adiós",
        pronunciation: "ah-dee-OHS",
        hint: "sounds like 'a-dee-oh-s'",
        image: "goodbye.png",
        audio: "goodbye.mp3",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCards(validCards);
  });
});

test("validateCards - accepts an optional `ttsText` field on an item", () => {
  const cardsWithReading = {
    meta: {
      targetLanguage: "ja",
      sourceType: "template",
    },
    items: [
      {
        id: "n21",
        english: "Twenty-one",
        category: "Numbers",
        target: "二十一",
        pronunciation: "nijūichi",
        ttsText: "にじゅういち",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCards(cardsWithReading);
  });
});

test("validateCards - accepts an optional boolean `fillInBlank` field on an item", () => {
  const cardsWithFib = {
    meta: {
      targetLanguage: "ja",
      sourceType: "epub",
    },
    items: [
      {
        id: "fib-1",
        english: "When is the party?",
        category: "Time",
        target: "パーティーはいつですか",
        pronunciation: "pātī wa itsu desu ka.",
        ttsText: "パーティーはいつですか",
        fillInBlank: true,
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCards(cardsWithFib);
  });
});

test("validateCards - a non-string `ttsText` fails validation", () => {
  const invalidCards = {
    meta: {
      targetLanguage: "ja",
      sourceType: "template",
    },
    items: [
      {
        id: "n21",
        english: "Twenty-one",
        category: "Numbers",
        target: "二十一",
        pronunciation: "nijūichi",
        ttsText: 21,
      },
    ],
  };

  assert.throws(() => {
    validateCards(invalidCards);
  });
});

test("validateCards - missing target field fails validation", () => {
  const invalidCards = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        pronunciation: "OH-lah",
      },
    ],
  };

  assert.throws(
    () => {
      validateCards(invalidCards);
    },
    (err) => {
      return err.message.includes("target");
    },
  );
});

test("validateCards - missing pronunciation field fails validation", () => {
  const invalidCards = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        target: "hola",
      },
    ],
  };

  assert.throws(
    () => {
      validateCards(invalidCards);
    },
    (err) => {
      return err.message.includes("pronunciation");
    },
  );
});

test("validateCards - missing english field fails validation", () => {
  const invalidCards = {
    meta: {
      targetLanguage: "es",
      sourceType: "template",
    },
    items: [
      {
        id: "1",
        category: "Greetings",
        target: "hola",
        pronunciation: "OH-lah",
      },
    ],
  };

  assert.throws(
    () => {
      validateCards(invalidCards);
    },
    (err) => {
      return err.message.includes("english");
    },
  );
});

test("validateCards - optional fields are allowed", () => {
  const validCards = {
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        target: "hola",
        pronunciation: "OH-lah",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCards(validCards);
  });
});

// This used to assert the un-redirected path, which is exactly how `npm test` came to write a fake
// EPUB registry and four stub clips into the real library. The contract is now the opposite one.
test("libraryHome - redirects to a throwaway tmpdir under the test runner", () => {
  const path = libraryHome();

  assert.ok(process.env.NODE_TEST_CONTEXT, "this test is meaningless outside `node --test`");
  assert.ok(
    !path.startsWith(resolve(REPO_ROOT)),
    `expected a tmpdir outside the checkout, got ${path}`,
  );
  assert.ok(path.startsWith(resolve(tmpdir())), `expected a path under os.tmpdir(), got ${path}`);
  assert.ok(
    path.includes(`anki-builder-test-${process.ppid}`),
    `expected the suite-scoped parent in ${path}`,
  );
  assert.strictEqual(libraryHome(), path, "same process must get the same scratch dir");
});

test("libraryHome - resolves to <repo-root>/.anki-builder with the explicit escape set", () => {
  const previous = process.env.ANKI_BUILDER_ALLOW_REAL_LIBRARY_IN_TESTS;
  process.env.ANKI_BUILDER_ALLOW_REAL_LIBRARY_IN_TESTS = "1";
  try {
    assert.strictEqual(libraryHome(), resolve(join(REPO_ROOT, ".anki-builder")));
  } finally {
    if (previous === undefined) delete process.env.ANKI_BUILDER_ALLOW_REAL_LIBRARY_IN_TESTS;
    else process.env.ANKI_BUILDER_ALLOW_REAL_LIBRARY_IN_TESTS = previous;
  }
});

test("libraryHome - resolves path correctly", () => {
  const path = libraryHome();
  // Should not start with ~ (must be resolved)
  assert.ok(!path.includes("~"), "path should be resolved, not contain ~");
});

test("runPaths - returns conventional paths for a run directory", () => {
  const runDir = "/tmp/run-123";
  const paths = runPaths(runDir);

  assert.strictEqual(paths.corpus, resolve("/tmp/run-123/corpus.json"));
  assert.strictEqual(paths.cards, resolve("/tmp/run-123/cards.json"));
  assert.strictEqual(paths.audio, resolve("/tmp/run-123/audio"));
  assert.strictEqual(paths.deck, resolve("/tmp/run-123/run-123.apkg"));
});

test("runPaths - resolves relative paths correctly", () => {
  const paths = runPaths("./test-run");
  // Paths should be absolute, not relative
  assert.ok(paths.corpus.startsWith("/"), "paths should be absolute");
  assert.ok(paths.cards.startsWith("/"), "paths should be absolute");
  assert.ok(paths.audio.startsWith("/"), "paths should be absolute");
  assert.ok(paths.deck.startsWith("/"), "paths should be absolute");
});

// --- the audio takes ------------------------------------------------------------------------------
// `audio` is the only field the deck build reads; the three takes behind it (and the saved trim
// range) live alongside it so the review can show the original, the automatic trim and a hand cut.

test("validateCards - accepts a card's full set of audio takes", () => {
  validateCards({
    meta: { targetLanguage: "ja", sourceType: "epub" },
    items: [
      {
        id: "a1",
        english: "Hello",
        category: "Greetings",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        audio: "a1-manual-ab12cd34.mp3",
        audioOriginal: "9f8e7d6c5b4a3210.orig.mp3",
        audioAuto: "9f8e7d6c5b4a3210.mp3",
        audioManual: "a1-manual-ab12cd34.mp3",
        audioTrim: { start: 0.24, end: 1.86 },
      },
    ],
  });
});

test("validateCards - a non-string audioOriginal fails validation", () => {
  assert.throws(
    () =>
      validateCards({
        meta: { targetLanguage: "ja", sourceType: "epub" },
        items: [
          {
            id: "a1",
            english: "Hello",
            category: "Greetings",
            target: "こんにちは",
            pronunciation: "konnichiwa",
            audioOriginal: 42,
          },
        ],
      }),
    /audioOriginal.*must be of type string/,
  );
});

test("validateCards - an unknown audio-ish field is still rejected", () => {
  assert.throws(
    () =>
      validateCards({
        meta: { targetLanguage: "ja", sourceType: "epub" },
        items: [
          {
            id: "a1",
            english: "Hello",
            category: "Greetings",
            target: "こんにちは",
            pronunciation: "konnichiwa",
            audioSource: "typo-of-audioOriginal.mp3",
          },
        ],
      }),
    /Unexpected property/,
  );
});

test("baseChapterLabel is accepted by BOTH schemas, because prepare writes the corpus back", () => {
  // Lesson 17's extras unit died here on its first live build. The extras phase stamps
  // baseChapterLabel on corpus.json, translate copies meta into cards.json, and then the
  // cross-lesson note pass writes the CORPUS back — which the corpus schema refused, after 111
  // items had already been translated. Same shape as alternateOf: a field one schema knows and the
  // other does not is a build that gets most of the way through and then stops.
  const meta = {
    targetLanguage: "ja",
    sourceType: "epub",
    chapterLabel: "Lesson 17: Stating a Wish (Extras)",
    baseChapterLabel: "Lesson 17: Stating a Wish",
  };
  // `pronunciation` is a cards-only field, so the two schemas need their own item shapes; the point
  // here is the META field, which must be legal in both.
  const base = { id: "a", english: "A", category: "Shopping", target: "あ" };
  assert.doesNotThrow(() => validateCorpus({ meta, items: [base] }));
  assert.doesNotThrow(() => validateCards({ meta, items: [{ ...base, pronunciation: "a" }] }));
});

test("fillInBlank survives the corpus, and an unrecognised field is distinguishable from provenance", () => {
  // Lesson 17's extras unit lost the drill marker on all 111 cards. v1 only ever added these inside
  // prepare, straight into cards.json, so the corpus schema never needed the field -- but phase 2's
  // miner produces them as corpus items, and the projection drops what the schema does not declare.
  //
  // The drop was logged. It was read past because the line listed it beside fromTable and fillsGap,
  // which are provenance and genuinely disposable. That is what isKnownProvenanceField separates.
  const item = { id: "a", english: "A", category: "Shopping", target: "あ", fillInBlank: true };
  assert.doesNotThrow(() => validateCorpus({ meta: BASE_META, items: [item] }));

  assert.equal(isKnownProvenanceField("fromTable"), true);
  assert.equal(isKnownProvenanceField("fillsGap"), true);
  assert.equal(isKnownProvenanceField("fillInBlank"), false, "a card property is not provenance");
  assert.equal(isKnownProvenanceField("ttsText"), false);
});

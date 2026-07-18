import { test } from "node:test";
import assert from "node:assert";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { validateCorpus, validateCards, libraryHome, runPaths } from "../../src/model/index.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url)); // test/model/
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
        notes: null,
        target: null,
      },
      {
        id: "2",
        english: "goodbye",
        category: "Greetings",
        notes: "formal",
        target: null,
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - accepts an optional `reading` (spoken form) on an item", () => {
  const validCorpus = {
    meta: { targetLanguage: "ja", sourceType: "epub" },
    items: [
      {
        id: "price",
        english: "2,000 yen",
        category: "Shopping",
        notes: null,
        target: "2,000えん",
        reading: "にせんえん",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - notes/target may be a real string instead of null", () => {
  const validCorpus = {
    meta: { targetLanguage: "ja", sourceType: "epub" },
    items: [
      {
        id: "1",
        english: "hello",
        category: "Greetings",
        notes: "a hint",
        target: "こんにちは",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCorpus(validCorpus);
  });
});

test("validateCorpus - missing notes/target fails validation (must be present, even if null)", () => {
  const invalidCorpus = {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [{ id: "1", english: "hello", category: "Greetings" }],
  };

  assert.throws(
    () => {
      validateCorpus(invalidCorpus);
    },
    (err) => /notes|target/.test(err.message),
  );
});

test("validateCorpus - a non-null, non-string target fails validation", () => {
  const invalidCorpus = {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [{ id: "1", english: "hello", category: "Greetings", notes: null, target: 5 }],
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
    items: [
      { id: "1", english: "hello", category: "Not A Real Category", notes: null, target: null },
    ],
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
        category: "greetings",
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
        category: "greetings",
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
        category: "greetings",
        target: "hola",
        pronunciation: "OH-lah",
      },
      {
        id: "2",
        english: "goodbye",
        category: "greetings",
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

test("validateCards - accepts an optional `reading` field on an item", () => {
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
        reading: "にじゅういち",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCards(cardsWithReading);
  });
});

test("validateCards - a non-string `reading` fails validation", () => {
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
        reading: 21,
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
        category: "greetings",
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
        category: "greetings",
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
        category: "greetings",
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
        category: "greetings",
        target: "hola",
        pronunciation: "OH-lah",
      },
    ],
  };

  assert.doesNotThrow(() => {
    validateCards(validCards);
  });
});

test("libraryHome - resolves to <repo-root>/.anki-builder", () => {
  const path = libraryHome();
  const expected = resolve(join(REPO_ROOT, ".anki-builder"));

  assert.strictEqual(path, expected);
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
  assert.strictEqual(paths.deck, resolve("/tmp/run-123/deck.apkg"));
});

test("runPaths - resolves relative paths correctly", () => {
  const paths = runPaths("./test-run");
  // Paths should be absolute, not relative
  assert.ok(paths.corpus.startsWith("/"), "paths should be absolute");
  assert.ok(paths.cards.startsWith("/"), "paths should be absolute");
  assert.ok(paths.audio.startsWith("/"), "paths should be absolute");
  assert.ok(paths.deck.startsWith("/"), "paths should be absolute");
});

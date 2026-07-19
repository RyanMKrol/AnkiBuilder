import test from "node:test";
import assert from "node:assert";
import { romanizeAndEvaluate } from "../../src/translate/romanizationEval.js";

function partialCard(id, english, target) {
  return { id, english, category: "Other", target };
}

function workingLibraryEntry(romanizeFn) {
  return { load: async () => ({ romanize: romanizeFn }) };
}

function noopFallback(items) {
  return { items: items.map((i) => ({ ...i, pronunciation: "FALLBACK" })), errors: [] };
}

test("romanizes the spoken `reading` (not the display `target`) when set, and keeps reading on the card", async () => {
  // target is the digit display form; reading is the spelled-out spoken form.
  const items = [
    {
      id: "price",
      english: "2,000 yen",
      category: "Shopping",
      target: "2,000えん",
      reading: "にせんえん",
    },
  ];
  let romanizedText = null;
  const libraryEntry = workingLibraryEntry(async (text) => {
    romanizedText = text;
    return "nisen en";
  });

  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "price", ok: true }]),
    fallback: noopFallback,
  });

  assert.equal(romanizedText, "にせんえん", "should romanize the reading, not the digit target");
  assert.equal(cards[0].pronunciation, "nisen en");
  assert.equal(cards[0].target, "2,000えん", "display target is preserved");
  assert.equal(
    cards[0].reading,
    "にせんえん",
    "reading survives onto the card for the audio stage",
  );
});

test("falls back to `target` for romanization when no reading is set", async () => {
  const items = [partialCard("cat", "cat", "猫")];
  let romanizedText = null;
  const libraryEntry = workingLibraryEntry(async (text) => {
    romanizedText = text;
    return "neko";
  });

  await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "cat", ok: true }]),
    fallback: noopFallback,
  });

  assert.equal(romanizedText, "猫");
});

test("agreement: when the model returns the same value the library had, that's the pronunciation", async () => {
  const items = [partialCard("cat", "cat", "猫")];
  const libraryEntry = workingLibraryEntry(async () => "neko");

  const { items: cards, errors } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "cat", pronunciation: "neko" }]),
    fallback: noopFallback,
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].pronunciation, "neko");
  assert.ok(!cards[0].uncertain);
});

test("correction: the model's pronunciation replaces the library's, with no uncertain flag or note", async () => {
  const items = [partialCard("floor", "sixth floor", "ろっかい")];
  // Library garbles the sokuon; the model returns the correct value.
  const libraryEntry = workingLibraryEntry(async () => "ro tsu kai");

  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "floor", pronunciation: "rokkai" }]),
    fallback: noopFallback,
  });

  assert.equal(
    cards[0].pronunciation,
    "rokkai",
    "uses the model's correction, not the library value",
  );
  assert.ok(!cards[0].uncertain, "no uncertain flag — the correction is the resolution");
  assert.equal(cards[0].notes, undefined, "no 'possibly incorrect' note is appended");
});

test("correction: the prompt shows the model the spoken `reading`, not a digit/kanji display target", async () => {
  const items = [
    {
      id: "price",
      english: "2,000 yen",
      category: "Shopping",
      target: "2,000えん",
      reading: "にせんえん",
    },
  ];
  const libraryEntry = workingLibraryEntry(async () => "ni se n e n");
  let prompt = null;

  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: (p) => {
      prompt = p;
      return JSON.stringify([{ id: "price", pronunciation: "nisen'en" }]);
    },
    fallback: noopFallback,
  });

  assert.match(prompt, /にせんえん/, "the reading is shown as the text to romanize");
  assert.doesNotMatch(
    prompt,
    /2,000えん/,
    "the digit display target is not shown as the romanization target",
  );
  assert.equal(cards[0].pronunciation, "nisen'en");
});

test("evaluates the whole set in a single eval call (no chunking)", async () => {
  const items = Array.from({ length: 12 }, (_, i) => partialCard(`w${i}`, `word ${i}`, `t-${i}`));
  const libraryEntry = workingLibraryEntry(async (text) => `roman-${text}`);

  const batchSizes = [];
  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: (prompt) => {
      const section = prompt.slice(prompt.indexOf("## Input Data"));
      const ids = [...section.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
      batchSizes.push(ids.length);
      return JSON.stringify(ids.map((id) => ({ id, ok: true })));
    },
    fallback: noopFallback,
  });

  assert.deepEqual(batchSizes, [12]);
  assert.equal(cards.length, 12);
});

test("fails open on a malformed eval response — approves every item in that batch unflagged", async () => {
  const items = [partialCard("cat", "cat", "猫")];
  const libraryEntry = workingLibraryEntry(async () => "neko");

  const { items: cards, errors } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => "not json at all",
    fallback: noopFallback,
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].pronunciation, "neko");
  assert.ok(!cards[0].uncertain);
});

test("fails open when the eval response is missing an entry for a specific item", async () => {
  const items = [partialCard("cat", "cat", "猫"), partialCard("dog", "dog", "犬")];
  const libraryEntry = workingLibraryEntry(async (text) => (text === "猫" ? "neko" : "inu"));

  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    // Only "cat" gets a verdict — "dog" is silently missing from the response.
    runClaude: () => JSON.stringify([{ id: "cat", ok: true }]),
    fallback: noopFallback,
  });

  const dogCard = cards.find((c) => c.id === "dog");
  assert.equal(dogCard.pronunciation, "inu");
  assert.ok(!dogCard.uncertain, "a missing verdict approves unflagged, same fail-open philosophy");
});

test("library adapter failure falls back per-item via the injected fallback, not a hard error", async () => {
  const items = [partialCard("cat", "cat", "猫")];
  const libraryEntry = {
    load: async () => ({
      romanize: async () => {
        throw new Error("dictionary not found");
      },
    }),
  };

  const logs = [];
  let fallbackCalledWith = null;
  const fallback = (fallbackItems) => {
    fallbackCalledWith = fallbackItems;
    return { items: fallbackItems.map((i) => ({ ...i, pronunciation: "FALLBACK" })), errors: [] };
  };

  const { items: cards, errors } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([]),
    log: (msg) => logs.push(msg),
    fallback,
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].pronunciation, "FALLBACK");
  assert.ok(!cards[0].uncertain);
  assert.equal(fallbackCalledWith.length, 1);
  assert.equal(fallbackCalledWith[0].id, "cat");
  assert.ok(logs.some((msg) => msg.includes("cat") && msg.includes("dictionary not found")));
});

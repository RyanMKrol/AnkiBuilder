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

test("approve-as-is: pronunciation is the library value, no uncertain flag", async () => {
  const items = [partialCard("cat", "cat", "猫")];
  const libraryEntry = workingLibraryEntry(async () => "neko");

  const { items: cards, errors } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "cat", ok: true }]),
    fallback: noopFallback,
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].pronunciation, "neko");
  assert.ok(!cards[0].uncertain);
});

test("flag-uncertain: keeps the library's pronunciation, sets uncertain, appends a note", async () => {
  const items = [partialCard("cat", "cat", "猫")];
  const libraryEntry = workingLibraryEntry(async () => "neko");

  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "cat", ok: false, concern: "looks off" }]),
    fallback: noopFallback,
  });

  assert.equal(cards[0].pronunciation, "neko");
  assert.equal(cards[0].uncertain, true);
  assert.equal(cards[0].notes, "Possibly incorrect romanization — looks off");
});

test("flag-uncertain appends to an existing note rather than replacing it", async () => {
  const items = [{ ...partialCard("cat", "cat", "猫"), notes: "informal too" }];
  const libraryEntry = workingLibraryEntry(async () => "neko");

  const { items: cards } = await romanizeAndEvaluate(items, {
    targetLanguage: "ja",
    libraryEntry,
    runClaude: () => JSON.stringify([{ id: "cat", ok: false, concern: "looks off" }]),
    fallback: noopFallback,
  });

  assert.equal(cards[0].notes, "informal too | Possibly incorrect romanization — looks off");
});

test("batches the eval call at BATCH_SIZE (10)", async () => {
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

  assert.deepEqual(batchSizes, [10, 2]);
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

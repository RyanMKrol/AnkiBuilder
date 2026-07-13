import test from "node:test";
import assert from "node:assert";
import { translateCorpus } from "../../src/translate/index.js";

function baseCorpus(items) {
  return {
    meta: { targetLanguage: "fr", sourceType: "manual" },
    items,
  };
}

test("translates untranslated items into schema-valid cards", () => {
  const corpus = baseCorpus([{ id: "hello", english: "Hello", category: "Greetings" }]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items.length, 1);
  assert.equal(cards.items[0].target, "Bonjour");
  assert.equal(cards.items[0].pronunciation, "bohn-ZHOOR");
});

test("includes an optional hint when the model supplies one", () => {
  const corpus = baseCorpus([{ id: "thanks", english: "Thanks", category: "Greetings" }]);

  const { cards } = translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "thanks", target: "Merci", pronunciation: "mer-SEE", hint: "casual" }]),
  });

  assert.equal(cards.items[0].hint, "casual");
});

test("preserves an already-translated item's notes instead of regenerating it", () => {
  const corpus = baseCorpus([
    { id: "cheese", english: "Cheese", category: "Food", notes: "Fromage" },
  ]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "cheese", target: "Something Else", pronunciation: "froh-MAHZH" }]),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Fromage");
  assert.equal(cards.items[0].pronunciation, "froh-MAHZH");
});

test("keeps errors per-item: a missing entry drops only that item", () => {
  const corpus = baseCorpus([
    { id: "hello", english: "Hello", category: "Greetings" },
    { id: "bye", english: "Goodbye", category: "Greetings" },
  ]);

  // One `claude -p` call for the whole batch; the response omits "bye".
  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]),
  });

  assert.equal(cards.items.length, 1);
  assert.equal(cards.items[0].id, "hello");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, "bye");
  assert.match(errors[0].error, /missing an entry/);
});

test("surfaces a wholly-malformed batch response as an error for every item in it", () => {
  const corpus = baseCorpus([
    { id: "hello", english: "Hello", category: "Greetings" },
    { id: "bye", english: "Goodbye", category: "Greetings" },
  ]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () => "not json at all",
  });

  assert.equal(cards.items.length, 0);
  assert.equal(errors.length, 2);
  for (const err of errors) {
    assert.match(err.error, /not valid JSON/);
  }
});

test("tolerates a batch response wrapped in a markdown code fence", () => {
  const corpus = baseCorpus([{ id: "hello", english: "Hello", category: "Greetings" }]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () =>
      '```json\n[{"id": "hello", "target": "Bonjour", "pronunciation": "bohn-ZHOOR"}]\n```',
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Bonjour");
});

test("batches into `claude -p` calls of at most 10 items", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({
    id: `w${i}`,
    english: `word ${i}`,
    category: "Misc",
  }));
  const corpus = baseCorpus(items);

  const batchSizes = [];
  const { cards, errors } = translateCorpus(corpus, {
    runClaude: (prompt) => {
      const ids = [...prompt.matchAll(/- id: (\S+)/g)].map((m) => m[1]);
      batchSizes.push(ids.length);
      return JSON.stringify(ids.map((id) => ({ id, target: `t-${id}`, pronunciation: `p-${id}` })));
    },
  });

  assert.deepEqual(batchSizes, [10, 10, 5]);
  assert.ok(batchSizes.every((n) => n <= 10));
  assert.equal(cards.items.length, 25);
  assert.deepEqual(errors, []);
});

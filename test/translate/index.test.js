import test from "node:test";
import assert from "node:assert";
import { translateCorpus } from "../../src/translate/index.js";

function baseCorpus(items) {
  return {
    meta: { targetLanguage: "fr", sourceType: "manual" },
    items,
  };
}

function untranslated(id, english, category, notes = null) {
  return { id, english, category, notes, target: null };
}

function alreadyTranslated(id, english, category, target, notes = null) {
  return { id, english, category, notes, target };
}

test("translates untranslated items (target: null) into schema-valid cards", () => {
  const corpus = baseCorpus([untranslated("hello", "Hello", "Greetings")]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items.length, 1);
  assert.equal(cards.items[0].target, "Bonjour");
  assert.equal(cards.items[0].pronunciation, "bohn-ZHOOR");
});

test("includes an optional hint when the model supplies one (full-translation path)", () => {
  const corpus = baseCorpus([untranslated("thanks", "Thanks", "Greetings")]);

  const { cards } = translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "thanks", target: "Merci", pronunciation: "mer-SEE", hint: "casual" }]),
  });

  assert.equal(cards.items[0].hint, "casual");
});

test("an item with a pre-existing target only requests pronunciation, never a translation", () => {
  const corpus = baseCorpus([
    alreadyTranslated("cheese", "Cheese", "Food", "Fromage", "a hint from the source"),
  ]);

  let capturedPrompt = null;
  const { cards, errors } = translateCorpus(corpus, {
    runClaude: (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify([{ id: "cheese", pronunciation: "froh-MAHZH" }]);
    },
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Fromage");
  assert.equal(cards.items[0].pronunciation, "froh-MAHZH");
  assert.doesNotMatch(capturedPrompt, /translate each/i);
  assert.match(capturedPrompt, /do not change/i);
  assert.match(capturedPrompt, /do not alter, correct, retranslate/i);
});

test("a pre-existing target cannot be overridden by the model, even if it dishonestly returns one", () => {
  const corpus = baseCorpus([alreadyTranslated("cheese", "Cheese", "Food", "Fromage")]);

  const { cards, errors } = translateCorpus(corpus, {
    // Misbehaving model: returns a target anyway, different from the given one.
    runClaude: () =>
      JSON.stringify([{ id: "cheese", target: "Something Else", pronunciation: "froh-MAHZH" }]),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Fromage");
  assert.equal(cards.items[0].pronunciation, "froh-MAHZH");
});

test("keeps errors per-item: a missing entry drops only that item", () => {
  const corpus = baseCorpus([
    untranslated("hello", "Hello", "Greetings"),
    untranslated("bye", "Goodbye", "Greetings"),
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
    untranslated("hello", "Hello", "Greetings"),
    untranslated("bye", "Goodbye", "Greetings"),
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
  const corpus = baseCorpus([untranslated("hello", "Hello", "Greetings")]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () =>
      '```json\n[{"id": "hello", "target": "Bonjour", "pronunciation": "bohn-ZHOOR"}]\n```',
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Bonjour");
});

test("batches the full-translation group into `claude -p` calls of at most 10 items", () => {
  const items = Array.from({ length: 25 }, (_, i) => untranslated(`w${i}`, `word ${i}`, "Misc"));
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

test("batches the pronunciation-only group into `claude -p` calls of at most 10 items, independently", () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    alreadyTranslated(`w${i}`, `word ${i}`, "Misc", `t-${i}`),
  );
  const corpus = baseCorpus(items);

  const batchSizes = [];
  const { cards, errors } = translateCorpus(corpus, {
    runClaude: (prompt) => {
      const ids = [...prompt.matchAll(/- id: (\S+)/g)].map((m) => m[1]);
      batchSizes.push(ids.length);
      return JSON.stringify(ids.map((id) => ({ id, pronunciation: `p-${id}` })));
    },
  });

  assert.deepEqual(batchSizes, [10, 2]);
  assert.equal(cards.items.length, 12);
  assert.deepEqual(errors, []);
  // Pre-existing targets are all preserved unchanged (item id "w0" -> target "t-0").
  for (const item of cards.items) {
    const index = item.id.replace("w", "");
    assert.equal(item.target, `t-${index}`);
  }
});

test("a mixed corpus sends two separate prompts — full translation and pronunciation-only", () => {
  const corpus = baseCorpus([
    untranslated("hello", "Hello", "Greetings"),
    alreadyTranslated("cheese", "Cheese", "Food", "Fromage"),
  ]);

  const prompts = [];
  const { cards, errors } = translateCorpus(corpus, {
    runClaude: (prompt) => {
      prompts.push(prompt);
      if (prompt.includes("hello")) {
        return JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]);
      }
      return JSON.stringify([{ id: "cheese", pronunciation: "froh-MAHZH" }]);
    },
  });

  assert.equal(prompts.length, 2);
  assert.deepEqual(errors, []);
  assert.equal(cards.items.length, 2);

  const helloCard = cards.items.find((c) => c.id === "hello");
  const cheeseCard = cards.items.find((c) => c.id === "cheese");
  assert.equal(helloCard.target, "Bonjour");
  assert.equal(cheeseCard.target, "Fromage");
  assert.equal(cheeseCard.pronunciation, "froh-MAHZH");
});

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
    runClaude: () => JSON.stringify({ target: "Bonjour", pronunciation: "bohn-ZHOOR" }),
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
      JSON.stringify({ target: "Merci", pronunciation: "mer-SEE", hint: "casual form" }),
  });

  assert.equal(cards.items[0].hint, "casual form");
});

test("preserves an already-translated item's notes instead of regenerating it", () => {
  const corpus = baseCorpus([
    { id: "cheese", english: "Cheese", category: "Food", notes: "Fromage" },
  ]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: () => JSON.stringify({ target: "Something Else", pronunciation: "froh-MAHZH" }),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Fromage");
  assert.equal(cards.items[0].pronunciation, "froh-MAHZH");
});

test("surfaces malformed model output as an error instead of writing a bad card", () => {
  const corpus = baseCorpus([
    { id: "hello", english: "Hello", category: "Greetings" },
    { id: "bye", english: "Goodbye", category: "Greetings" },
  ]);

  const { cards, errors } = translateCorpus(corpus, {
    runClaude: (prompt) => {
      if (prompt.includes("Goodbye")) {
        return "not json at all";
      }
      return JSON.stringify({ target: "Bonjour", pronunciation: "bohn-ZHOOR" });
    },
  });

  assert.equal(cards.items.length, 1);
  assert.equal(cards.items[0].id, "hello");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, "bye");
  assert.match(errors[0].error, /not valid JSON/);
});

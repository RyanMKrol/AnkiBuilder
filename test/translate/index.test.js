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

// Ids appear both in the fixed "Example Input"/"Example Output" blocks and in
// the real "## Input Data" block, so scan only after the "## Input Data"
// marker to recover just the ids actually being sent for translation.
function extractInputDataIds(prompt) {
  const marker = "## Input Data";
  const section = prompt.slice(prompt.indexOf(marker));
  return [...section.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
}

test("translates untranslated items (target: null) into schema-valid cards", async () => {
  const corpus = baseCorpus([untranslated("hello", "Hello", "Greetings")]);

  const { cards, errors } = await translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items.length, 1);
  assert.equal(cards.items[0].target, "Bonjour");
  assert.equal(cards.items[0].pronunciation, "bohn-ZHOOR");
});

test("includes an optional hint when the model supplies one (full-translation path)", async () => {
  const corpus = baseCorpus([untranslated("thanks", "Thanks", "Greetings")]);

  const { cards } = await translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "thanks", target: "Merci", pronunciation: "mer-SEE", hint: "casual" }]),
  });

  assert.equal(cards.items[0].hint, "casual");
});

test("an item with a pre-existing target only requests pronunciation, never a translation", async () => {
  const corpus = baseCorpus([
    alreadyTranslated("cheese", "Cheese", "Food", "Fromage", "a hint from the source"),
  ]);

  let capturedPrompt = null;
  const { cards, errors } = await translateCorpus(corpus, {
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

test("a pre-existing target cannot be overridden by the model, even if it dishonestly returns one", async () => {
  const corpus = baseCorpus([alreadyTranslated("cheese", "Cheese", "Food", "Fromage")]);

  const { cards, errors } = await translateCorpus(corpus, {
    // Misbehaving model: returns a target anyway, different from the given one.
    runClaude: () =>
      JSON.stringify([{ id: "cheese", target: "Something Else", pronunciation: "froh-MAHZH" }]),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Fromage");
  assert.equal(cards.items[0].pronunciation, "froh-MAHZH");
});

test("keeps errors per-item: a missing entry drops only that item", async () => {
  const corpus = baseCorpus([
    untranslated("hello", "Hello", "Greetings"),
    untranslated("bye", "Goodbye", "Greetings"),
  ]);

  // One `claude -p` call for the whole batch; the response omits "bye".
  const { cards, errors } = await translateCorpus(corpus, {
    runClaude: () =>
      JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]),
  });

  assert.equal(cards.items.length, 1);
  assert.equal(cards.items[0].id, "hello");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, "bye");
  assert.match(errors[0].error, /missing an entry/);
});

test("surfaces a wholly-malformed batch response as an error for every item in it", async () => {
  const corpus = baseCorpus([
    untranslated("hello", "Hello", "Greetings"),
    untranslated("bye", "Goodbye", "Greetings"),
  ]);

  const { cards, errors } = await translateCorpus(corpus, {
    runClaude: () => "not json at all",
  });

  assert.equal(cards.items.length, 0);
  assert.equal(errors.length, 2);
  for (const err of errors) {
    assert.match(err.error, /not valid JSON/);
  }
});

test("tolerates a batch response wrapped in a markdown code fence", async () => {
  const corpus = baseCorpus([untranslated("hello", "Hello", "Greetings")]);

  const { cards, errors } = await translateCorpus(corpus, {
    runClaude: () =>
      '```json\n[{"id": "hello", "target": "Bonjour", "pronunciation": "bohn-ZHOOR"}]\n```',
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Bonjour");
});

test("sends the whole full-translation group in a single `claude -p` call", async () => {
  const items = Array.from({ length: 25 }, (_, i) => untranslated(`w${i}`, `word ${i}`, "Misc"));
  const corpus = baseCorpus(items);

  const batchSizes = [];
  const { cards, errors } = await translateCorpus(corpus, {
    runClaude: (prompt) => {
      const ids = extractInputDataIds(prompt);
      batchSizes.push(ids.length);
      return JSON.stringify(ids.map((id) => ({ id, target: `t-${id}`, pronunciation: `p-${id}` })));
    },
  });

  // No chunking: all 25 items go in one call.
  assert.deepEqual(batchSizes, [25]);
  assert.equal(cards.items.length, 25);
  assert.deepEqual(errors, []);
});

test("sends the whole pronunciation-only group in a single `claude -p` call, independently", async () => {
  const items = Array.from({ length: 12 }, (_, i) =>
    alreadyTranslated(`w${i}`, `word ${i}`, "Misc", `t-${i}`),
  );
  const corpus = baseCorpus(items);

  const batchSizes = [];
  const { cards, errors } = await translateCorpus(corpus, {
    runClaude: (prompt) => {
      const ids = extractInputDataIds(prompt);
      batchSizes.push(ids.length);
      return JSON.stringify(ids.map((id) => ({ id, pronunciation: `p-${id}` })));
    },
  });

  assert.deepEqual(batchSizes, [12]);
  assert.equal(cards.items.length, 12);
  assert.deepEqual(errors, []);
  // Pre-existing targets are all preserved unchanged (item id "w0" -> target "t-0").
  for (const item of cards.items) {
    const index = item.id.replace("w", "");
    assert.equal(item.target, `t-${index}`);
  }
});

test("a mixed corpus sends two separate prompts — full translation and pronunciation-only", async () => {
  const corpus = baseCorpus([
    untranslated("hello", "Hello", "Greetings"),
    alreadyTranslated("cheese", "Cheese", "Food", "Fromage"),
  ]);

  const prompts = [];
  const { cards, errors } = await translateCorpus(corpus, {
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

test("library-path: a configured romanization library supplies pronunciation, not the model", async () => {
  const corpus = {
    meta: { targetLanguage: "ja", sourceType: "manual" },
    items: [untranslated("cat", "cat", "Other")],
  };

  const getRomanizationLibrary = (code) => {
    assert.equal(code, "ja");
    return { load: async () => ({ romanize: async (text) => `roman-${text}` }) };
  };

  let translatePrompt = null;
  const runClaude = (prompt) => {
    if (prompt.includes("Translate Flashcards")) {
      translatePrompt = prompt;
      return JSON.stringify([{ id: "cat", target: "猫" }]);
    }
    return JSON.stringify([{ id: "cat", ok: true }]);
  };

  const { cards, errors } = await translateCorpus(corpus, { runClaude, getRomanizationLibrary });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "猫");
  assert.equal(cards.items[0].pronunciation, "roman-猫");
  assert.ok(!cards.items[0].uncertain);
  // The translation call never asked the model for pronunciation at all.
  assert.doesNotMatch(translatePrompt, /producing both a translation and a pronunciation guide/);
  assert.match(translatePrompt, /Do not include a `pronunciation` key/);
});

test("library-path: a Haiku-flagged romanization keeps the library value and gets uncertain + a note", async () => {
  const corpus = {
    meta: { targetLanguage: "ja", sourceType: "manual" },
    items: [untranslated("cat", "cat", "Other")],
  };

  const getRomanizationLibrary = () => ({
    load: async () => ({ romanize: async () => "neko" }),
  });

  const runClaude = (prompt) => {
    if (prompt.includes("Translate Flashcards")) {
      return JSON.stringify([{ id: "cat", target: "猫" }]);
    }
    return JSON.stringify([{ id: "cat", ok: false, concern: "looks off" }]);
  };

  const { cards } = await translateCorpus(corpus, { runClaude, getRomanizationLibrary });

  assert.equal(cards.items[0].pronunciation, "neko");
  assert.equal(cards.items[0].uncertain, true);
  assert.equal(cards.items[0].notes, "Possibly incorrect romanization — looks off");
});

test("no-library-path parity: an unconfigured language uses the original full-translation prompt unchanged", async () => {
  const corpus = baseCorpus([untranslated("hello", "Hello", "Greetings")]);

  let getRomanizationLibraryCalledWith = null;
  const getRomanizationLibrary = (code) => {
    getRomanizationLibraryCalledWith = code;
    return undefined;
  };

  let capturedPrompt = null;
  const { cards, errors } = await translateCorpus(corpus, {
    getRomanizationLibrary,
    runClaude: (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify([{ id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" }]);
    },
  });

  assert.equal(getRomanizationLibraryCalledWith, "fr");
  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].target, "Bonjour");
  assert.equal(cards.items[0].pronunciation, "bohn-ZHOOR");
  // Byte-for-byte the same prompt shape as pre-feature code — the model is still asked to
  // produce pronunciation itself, in the same call as the translation.
  assert.match(capturedPrompt, /producing both a translation and a pronunciation guide/);
});

test("library-throws-falls-back: an adapter failure falls through to the ordinary pronunciation-only path", async () => {
  const corpus = {
    meta: { targetLanguage: "ja", sourceType: "manual" },
    items: [untranslated("cat", "cat", "Other")],
  };

  const getRomanizationLibrary = () => ({
    load: async () => {
      throw new Error("dictionary not found");
    },
  });

  const logs = [];
  const runClaude = (prompt) => {
    if (prompt.includes("Translate Flashcards")) {
      return JSON.stringify([{ id: "cat", target: "猫" }]);
    }
    // The fallback path reuses the ordinary pronunciation-only prompt.
    assert.match(prompt, /do not alter, correct, retranslate/i);
    return JSON.stringify([{ id: "cat", pronunciation: "neko" }]);
  };

  const { cards, errors } = await translateCorpus(corpus, {
    runClaude,
    getRomanizationLibrary,
    log: (msg) => logs.push(msg),
  });

  assert.deepEqual(errors, []);
  assert.equal(cards.items[0].pronunciation, "neko");
  assert.ok(!cards.items[0].uncertain);
  assert.ok(logs.some((msg) => msg.includes("dictionary not found")));
});

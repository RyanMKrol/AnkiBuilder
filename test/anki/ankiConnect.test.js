import test from "node:test";
import assert from "node:assert";
import { createAnkiConnect } from "../../src/anki/ankiConnect.js";

// A fake fetch that records the request and returns a canned AnkiConnect envelope.
function fakeFetch(envelope, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok, status, json: async () => envelope };
  };
  return { fetchImpl, calls };
}

test("invoke posts {action, version, params} and returns result", async () => {
  const { fetchImpl, calls } = fakeFetch({ result: 6, error: null });
  const anki = createAnkiConnect({ fetchImpl });
  const v = await anki.version();
  assert.equal(v, 6);
  assert.equal(calls[0].url, "http://127.0.0.1:8765");
  assert.deepEqual(calls[0].body, { action: "version", version: 6, params: {} });
});

test("typed helpers send the right action + params", async () => {
  const { fetchImpl, calls } = fakeFetch({ result: [1, 2], error: null });
  const anki = createAnkiConnect({ fetchImpl });

  await anki.updateNoteFields(42, { English: "Hi" });
  assert.deepEqual(calls.at(-1).body.params, { note: { id: 42, fields: { English: "Hi" } } });

  await anki.modelFieldAdd("AnkiBuilder ja", "Note", 5);
  assert.deepEqual(calls.at(-1).body.params, {
    modelName: "AnkiBuilder ja",
    fieldName: "Note",
    index: 5,
  });

  await anki.updateModelStyling("AnkiBuilder ja", ".card{}");
  assert.deepEqual(calls.at(-1).body.params, { model: { name: "AnkiBuilder ja", css: ".card{}" } });

  await anki.deleteNotes([7, 8]);
  assert.deepEqual(calls.at(-1).body.params, { notes: [7, 8] });

  // cardsToo defaults to FALSE, so a deck that turns out not to be empty loses its cards to
  // Default rather than to deletion. That default is the safety property, not a detail.
  await anki.deleteDecks(["Old Course"]);
  assert.deepEqual(calls.at(-1).body.params, { decks: ["Old Course"], cardsToo: false });

  await anki.exportPackage("Deck::Sub", "/tmp/x.apkg");
  assert.deepEqual(calls.at(-1).body.params, {
    deck: "Deck::Sub",
    path: "/tmp/x.apkg",
    includeSched: true,
  });

  await anki.addTags([1, 2], "abid:hello");
  assert.deepEqual(calls.at(-1).body.params, { notes: [1, 2], tags: "abid:hello" });

  await anki.sync();
  assert.deepEqual(calls.at(-1).body, { action: "sync", version: 6, params: {} });
});

test("invoke throws when AnkiConnect returns an error", async () => {
  const { fetchImpl } = fakeFetch({ result: null, error: "model was not found" });
  const anki = createAnkiConnect({ fetchImpl });
  await assert.rejects(() => anki.modelFieldNames("Nope"), /model was not found/);
});

test("invoke throws on non-OK HTTP", async () => {
  const { fetchImpl } = fakeFetch({}, { ok: false, status: 500 });
  const anki = createAnkiConnect({ fetchImpl });
  await assert.rejects(() => anki.version(), /HTTP 500/);
});

test("invoke wraps an unreachable endpoint with a helpful message", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNREFUSED");
  };
  const anki = createAnkiConnect({ fetchImpl });
  await assert.rejects(() => anki.version(), /unreachable.*ECONNREFUSED/s);
});

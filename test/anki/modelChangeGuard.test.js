import test from "node:test";
import assert from "node:assert/strict";
import { describeModelChange, modelUsage, syncStructure } from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";
import { unifiedDiff } from "../../src/util/unifiedDiff.js";

const SPEC = noteTypeSpec("ja");
const live = (spec) =>
  Object.fromEntries(spec.templates.map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }]));

/**
 * A fake AnkiConnect that records writes. Every test here drives it directly: nothing in this file
 * touches port 8765, and nothing needs Anki running.
 */
function fake({ templates = live(SPEC), css = SPEC.css, decks = null } = {}) {
  const writes = [];
  const logs = [];
  return {
    writes,
    logs,
    log: (m) => logs.push(m),
    client: {
      modelNames: async () => [SPEC.modelName],
      modelFieldNames: async () => [...SPEC.fields],
      modelFieldAdd: async () => writes.push("modelFieldAdd"),
      modelFieldReposition: async () => writes.push("modelFieldReposition"),
      modelTemplates: async () => templates,
      updateModelTemplates: async () => writes.push("updateModelTemplates"),
      modelStyling: async () => ({ css }),
      updateModelStyling: async () => writes.push("updateModelStyling"),
      createModel: async () => writes.push("createModel"),
      findCards: async () => [1, 2, 3],
      getDecks: async () =>
        decks ?? {
          "Japanese for Busy People Book 1: Kana::Lesson 01": [1, 2],
          "Nihongo 101 Course (N5)::Lesson 03": [3],
        },
    },
  };
}

test("a template change is REFUSED on a real deliver without explicit consent", async () => {
  const { client, writes } = fake({
    templates: {
      Recognition: { Front: "old", Back: "old" },
      Production: { Front: "o", Back: "o" },
    },
  });
  await assert.rejects(
    () => syncStructure(client, SPEC, false),
    /refusing to rewrite the note type/,
  );
  assert.deepEqual(writes, [], "nothing was written before the refusal");
});

test("the refusal names the blast radius: how many cards, and which decks", async () => {
  const { client } = fake({ css: ".card { color: red }" });
  await assert.rejects(
    () => syncStructure(client, SPEC, false),
    /all 3 card\(s\) across 2 deck\(s\)/,
  );
});

test("--allow-model-change lets the same write through", async () => {
  const { client, writes } = fake({ css: ".card { color: red }" });
  const out = await syncStructure(client, SPEC, false, { allowModelChange: true });
  assert.equal(out.css, true);
  assert.deepEqual(writes, ["updateModelStyling"]);
});

test("a dry run never needs consent, writes nothing, and reports the diff and the decks", async () => {
  const { client, writes, logs, log } = fake({
    templates: { Recognition: { Front: "old front", Back: "old back" }, Production: null },
  });
  const out = await syncStructure(client, SPEC, true, { log });
  assert.deepEqual(writes, []);
  assert.equal(out.templates, true);
  assert.equal(out.modelChange.usage.cards, 3);
  assert.deepEqual(out.modelChange.usage.decks, [
    "Japanese for Busy People Book 1: Kana::Lesson 01",
    "Nihongo 101 Course (N5)::Lesson 03",
  ]);
  assert.match(out.modelChange.diff, /-old front/);
  assert.match(logs.join("\n"), /reaches 3 card\(s\) in 2 deck\(s\)/);
});

test("adding a FIELD is not gated — it cannot change what an existing card looks like", async () => {
  const { client, writes } = fake();
  const trimmed = { ...SPEC, fields: [...SPEC.fields] };
  const shortClient = {
    ...client,
    modelFieldNames: async () => SPEC.fields.slice(0, -1),
  };
  const out = await syncStructure(shortClient, trimmed, false);
  assert.equal(out.addedFields.length, 1);
  assert.equal(out.modelChange, null);
  assert.ok(!writes.includes("updateModelTemplates"));
});

test("creating the model from scratch is not gated either", async () => {
  const { client, writes } = fake();
  const out = await syncStructure({ ...client, modelNames: async () => [] }, SPEC, false);
  assert.equal(out.createModel, true);
  assert.equal(out.modelChange, null);
  assert.deepEqual(writes, ["createModel"]);
});

test("modelUsage reports nothing for a note type no card uses", async () => {
  const { client } = fake();
  const usage = await modelUsage({ ...client, findCards: async () => [] }, SPEC.modelName);
  assert.deepEqual(usage, { cards: 0, decks: [] });
});

test("describeModelChange diffs every template side and the CSS", async () => {
  const { client } = fake();
  const { diff } = await describeModelChange(client, SPEC, {
    liveTemplates: { Recognition: { Front: "A", Back: "B" } },
    liveCss: "C",
  });
  assert.match(diff, /Recognition \/ Front/);
  assert.match(diff, /Recognition \/ Back/);
  assert.match(diff, /Production \/ Front/);
  assert.match(diff, /\/ CSS/);
});

test("unifiedDiff shows every changed line and is empty for identical input", () => {
  assert.equal(unifiedDiff("a\nb\nc", "a\nb\nc"), "");
  const diff = unifiedDiff("a\nb\nc", "a\nB\nc", { label: "x" });
  assert.match(diff, /^--- x \(in Anki now\)/m);
  assert.match(diff, /^\+\+\+ x \(this build\)/m);
  assert.match(diff, /^-b$/m);
  assert.match(diff, /^\+B$/m);
});

test("unifiedDiff elides long unchanged runs rather than printing the whole template", () => {
  const before = ["head", ...Array.from({ length: 40 }, (_, i) => `line ${i}`), "tail"].join("\n");
  const after = before.replace("tail", "TAIL");
  const diff = unifiedDiff(before, after);
  assert.match(diff, /@@ \d+ unchanged line\(s\) @@/);
  assert.match(diff, /^-tail$/m);
  assert.ok(diff.split("\n").length < 12, "a one-line change stays a short diff");
});

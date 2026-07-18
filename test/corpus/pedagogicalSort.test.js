import test from "node:test";
import assert from "node:assert";
import {
  sortItemsPedagogically,
  renderPedagogicalSortPrompt,
} from "../../src/corpus/pedagogicalSort.js";

const ITEMS = [
  { id: "kore-wa-3000", english: "This is 3,000 yen.", target: "これは さんぜんえんです。" },
  { id: "sanzen", english: "3,000", target: "さんぜん" },
  { id: "en", english: "Yen", target: "えん" },
];

test("reorders items to follow the model's returned id order", () => {
  const runClaude = () => JSON.stringify({ order: ["sanzen", "en", "kore-wa-3000"] });
  const { items, changed } = sortItemsPedagogically({
    items: ITEMS,
    targetLanguage: "Japanese",
    runClaude,
  });

  assert.deepEqual(
    items.map((i) => i.id),
    ["sanzen", "en", "kore-wa-3000"],
  );
  assert.equal(changed, true);
  // Same objects, just re-sequenced — nothing rewritten.
  assert.strictEqual(items[2], ITEMS[0]);
});

test("changed is false when the model returns the existing order", () => {
  const runClaude = () => JSON.stringify({ order: ITEMS.map((i) => i.id) });
  const { items, changed } = sortItemsPedagogically({ items: ITEMS, runClaude });
  assert.equal(changed, false);
  assert.deepEqual(
    items.map((i) => i.id),
    ITEMS.map((i) => i.id),
  );
});

test("appends items the model omitted, in their original relative order", () => {
  // Model only names the last item; the other two must be preserved, not dropped.
  const runClaude = () => JSON.stringify({ order: ["kore-wa-3000"] });
  const { items } = sortItemsPedagogically({ items: ITEMS, runClaude });
  assert.equal(items.length, ITEMS.length);
  assert.deepEqual(
    items.map((i) => i.id),
    ["kore-wa-3000", "sanzen", "en"],
  );
});

test("ignores unknown ids and de-duplicates repeats without losing items", () => {
  const runClaude = () =>
    JSON.stringify({ order: ["en", "ghost", "en", "sanzen", "kore-wa-3000"] });
  const { items } = sortItemsPedagogically({ items: ITEMS, runClaude });
  assert.equal(items.length, ITEMS.length);
  assert.deepEqual(
    items.map((i) => i.id),
    ["en", "sanzen", "kore-wa-3000"],
  );
});

test("fails open (original order, changed:false) on unparseable output", () => {
  const logs = [];
  const runClaude = () => "sorry, I could not help with that";
  const { items, changed } = sortItemsPedagogically({
    items: ITEMS,
    runClaude,
    log: (m) => logs.push(m),
  });
  assert.equal(changed, false);
  assert.deepEqual(
    items.map((i) => i.id),
    ITEMS.map((i) => i.id),
  );
  assert.ok(logs.some((m) => m.includes("pedagogical sort: failed")));
});

test("fails open when order is the wrong shape", () => {
  const runClaude = () => JSON.stringify({ order: [1, 2, 3] });
  const { items, changed } = sortItemsPedagogically({ items: ITEMS, runClaude });
  assert.equal(changed, false);
  assert.deepEqual(
    items.map((i) => i.id),
    ITEMS.map((i) => i.id),
  );
});

test("no-ops without calling runClaude for fewer than two items", () => {
  let called = false;
  const runClaude = () => {
    called = true;
    return "{}";
  };
  const single = [ITEMS[0]];
  const { items, changed } = sortItemsPedagogically({ items: single, runClaude });
  assert.equal(called, false);
  assert.equal(changed, false);
  assert.strictEqual(items, single);
});

test("tolerates a fenced JSON response", () => {
  const runClaude = () => '```json\n{ "order": ["en", "sanzen", "kore-wa-3000"] }\n```';
  const { items } = sortItemsPedagogically({ items: ITEMS, runClaude });
  assert.deepEqual(
    items.map((i) => i.id),
    ["en", "sanzen", "kore-wa-3000"],
  );
});

test("renderPedagogicalSortPrompt substitutes every placeholder and includes item targets", () => {
  const prompt = renderPedagogicalSortPrompt({
    targetLanguage: "Japanese",
    items: ITEMS,
    bookConventions: "Book teaches kana first.",
  });
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(prompt), "no unresolved placeholders remain");
  assert.ok(prompt.includes("Japanese"));
  assert.ok(prompt.includes("これは さんぜんえんです。"));
  assert.ok(prompt.includes("Book teaches kana first."));
  assert.ok(prompt.includes('"order"'));
});

test("renderPedagogicalSortPrompt uses a placeholder note when no conventions are given", () => {
  const prompt = renderPedagogicalSortPrompt({ targetLanguage: "Japanese", items: ITEMS });
  assert.ok(prompt.includes("no book-wide conventions available"));
});

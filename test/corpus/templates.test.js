import test from "node:test";
import assert from "node:assert";
import { listTemplates, loadTemplate } from "../../src/corpus/templates.js";

test("listTemplates() returns available templates", () => {
  const templates = listTemplates();
  assert(Array.isArray(templates));
  assert(templates.length > 0);
  assert(templates.includes("travel-essentials"));
  assert(templates.includes("numbers"));
});

test("loadTemplate() returns a schema-valid corpus for travel-essentials", () => {
  const corpus = loadTemplate("travel-essentials", "Spanish");
  assert(corpus);
  assert(corpus.meta);
  assert.strictEqual(corpus.meta.sourceType, "template");
  assert(corpus.items);
  assert(Array.isArray(corpus.items));
  assert(corpus.items.length > 0);
});

test("loadTemplate() injects the caller's target language into meta", () => {
  const es = loadTemplate("travel-essentials", "Spanish");
  assert.strictEqual(es.meta.targetLanguage, "Spanish");
  // Same template, different language — proves the language isn't baked in.
  const fr = loadTemplate("travel-essentials", "French");
  assert.strictEqual(fr.meta.targetLanguage, "French");
});

test("loadTemplate() throws when no target language is given", () => {
  assert.throws(() => loadTemplate("travel-essentials"), /requires a targetLanguage/);
});

test("loadTemplate() loads the numbers template with a full number range", () => {
  const corpus = loadTemplate("numbers", "es");
  assert.strictEqual(corpus.meta.sourceType, "template");
  assert.strictEqual(corpus.meta.targetLanguage, "es");
  assert(corpus.items.length >= 20);
  for (const item of corpus.items) {
    assert.strictEqual(item.category, "Numbers", `${item.id} should be a Numbers item`);
    assert.strictEqual(item.target, null);
  }
});

test("travel-essentials template includes all required categories", () => {
  const corpus = loadTemplate("travel-essentials", "Spanish");
  const categories = new Set(corpus.items.map((item) => item.category));

  const requiredCategories = [
    "Greetings",
    "Numbers",
    "Directions",
    "Food",
    "Transport",
    "Money",
    "Time",
    "Emergencies",
  ];

  for (const category of requiredCategories) {
    assert(categories.has(category), `Missing category: ${category}`);
  }
});

test("loadTemplate() throws for unknown template", () => {
  assert.throws(() => {
    loadTemplate("nonexistent");
  }, /Unknown template: nonexistent/);
});

test("every bundled template validates against corpus schema", () => {
  const templates = listTemplates();
  for (const name of templates) {
    const corpus = loadTemplate(name, "es");
    assert(corpus, `Failed to load template: ${name}`);
    assert(corpus.meta, `Template ${name} missing meta`);
    assert(corpus.items, `Template ${name} missing items`);
  }
});

test("loadTemplate() normalizes every item to the superset shape (notes/target always present, nullable)", () => {
  const corpus = loadTemplate("travel-essentials", "Spanish");
  for (const item of corpus.items) {
    assert("notes" in item, `item ${item.id} missing "notes" key`);
    assert("target" in item, `item ${item.id} missing "target" key`);
    assert.strictEqual(item.target, null, `template items should never have a pre-set target`);
  }
});

test("loadTemplate() sets meta.reviewed to false on a fresh corpus", () => {
  const corpus = loadTemplate("travel-essentials", "Spanish");
  assert.strictEqual(corpus.meta.reviewed, false);
});

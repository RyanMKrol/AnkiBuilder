import test from "node:test";
import assert from "node:assert";
import { listTemplates, loadTemplate } from "../../src/corpus/templates.js";

test("listTemplates() returns available templates", () => {
  const templates = listTemplates();
  assert(Array.isArray(templates));
  assert(templates.length > 0);
  assert(templates.includes("travel-essentials"));
});

test("loadTemplate() returns a schema-valid corpus for travel-essentials", () => {
  const corpus = loadTemplate("travel-essentials");
  assert(corpus);
  assert(corpus.meta);
  assert.strictEqual(corpus.meta.sourceType, "template");
  assert(corpus.items);
  assert(Array.isArray(corpus.items));
  assert(corpus.items.length > 0);
});

test("travel-essentials template includes all required categories", () => {
  const corpus = loadTemplate("travel-essentials");
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
    const corpus = loadTemplate(name);
    assert(corpus, `Failed to load template: ${name}`);
    assert(corpus.meta, `Template ${name} missing meta`);
    assert(corpus.items, `Template ${name} missing items`);
  }
});

test("loadTemplate() normalizes every item to the superset shape (notes/target always present, nullable)", () => {
  const corpus = loadTemplate("travel-essentials");
  for (const item of corpus.items) {
    assert("notes" in item, `item ${item.id} missing "notes" key`);
    assert("target" in item, `item ${item.id} missing "target" key`);
    assert.strictEqual(item.target, null, `template items should never have a pre-set target`);
  }
});

test("loadTemplate() sets meta.reviewed to false on a fresh corpus", () => {
  const corpus = loadTemplate("travel-essentials");
  assert.strictEqual(corpus.meta.reviewed, false);
});

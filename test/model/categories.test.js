import test from "node:test";
import assert from "node:assert";
import { CATEGORIES } from "../../src/model/categories.js";

test("CATEGORIES is a non-empty array of unique strings", () => {
  assert(Array.isArray(CATEGORIES));
  assert(CATEGORIES.length > 0);
  for (const category of CATEGORIES) {
    assert.strictEqual(typeof category, "string");
    assert(category.length > 0);
  }
  assert.strictEqual(new Set(CATEGORIES).size, CATEGORIES.length, "no duplicate categories");
});

test("CATEGORIES includes an Other fallback", () => {
  assert(CATEGORIES.includes("Other"));
});

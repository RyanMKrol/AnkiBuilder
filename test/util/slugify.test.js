import test from "node:test";
import assert from "node:assert";
import { slugify } from "../../src/util/slugify.js";

test("slugify() lowercases and hyphenates spaces", () => {
  assert.equal(slugify("Japanese for Busy People"), "japanese-for-busy-people");
});

test("slugify() collapses punctuation runs into a single hyphen", () => {
  assert.equal(slugify("Whose Pen Is This?!"), "whose-pen-is-this");
});

test("slugify() trims leading and trailing hyphens", () => {
  assert.equal(slugify("  --Hello World--  "), "hello-world");
});

test("slugify() transliterates accented characters to ASCII", () => {
  assert.equal(slugify("Café Français"), "cafe-francais");
});

test("slugify() deletes apostrophes instead of hyphenating them", () => {
  assert.equal(slugify("Assimil's Method"), "assimils-method");
});

test("slugify() truncates to maxLength with no dangling trailing hyphen", () => {
  const longTitle = "a".repeat(58) + " b c d e";
  const result = slugify(longTitle);
  assert.ok(result.length <= 60);
  assert.ok(!result.endsWith("-"));
});

test("slugify() returns 'untitled' for empty input", () => {
  assert.equal(slugify(""), "untitled");
});

test("slugify() returns 'untitled' for punctuation-only input", () => {
  assert.equal(slugify("!!!???"), "untitled");
});

test("slugify() returns 'untitled' for null/undefined input", () => {
  assert.equal(slugify(null), "untitled");
  assert.equal(slugify(undefined), "untitled");
});

test("slugify() is idempotent", () => {
  const once = slugify("Lesson 2: Possession: Whose Pen Is This?");
  assert.equal(slugify(once), once);
});

test("slugify() respects a custom maxLength", () => {
  assert.equal(slugify("abcdefghij", { maxLength: 5 }), "abcde");
});

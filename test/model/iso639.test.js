import test from "node:test";
import assert from "node:assert";
import { ISO_639_1_CODES, resolveIso639Code } from "../../src/model/iso639.js";

test("ISO_639_1_CODES contains well-known codes and has the expected count", () => {
  for (const code of ["en", "ja", "es", "fr", "zh", "ko", "de"]) {
    assert.ok(ISO_639_1_CODES.has(code), `expected ${code} to be a recognized code`);
  }
  assert.equal(ISO_639_1_CODES.size, 184);
});

test("resolveIso639Code() returns the code unchanged when already lowercase", () => {
  assert.equal(resolveIso639Code("ja"), "ja");
  assert.equal(resolveIso639Code("es"), "es");
});

test("resolveIso639Code() is case-insensitive", () => {
  assert.equal(resolveIso639Code("JA"), "ja");
  assert.equal(resolveIso639Code("Ja"), "ja");
});

test("resolveIso639Code() trims surrounding whitespace", () => {
  assert.equal(resolveIso639Code("  ja  "), "ja");
});

test("resolveIso639Code() returns null for a full language name", () => {
  assert.equal(resolveIso639Code("Japanese"), null);
});

test("resolveIso639Code() returns null for an unrecognized two-letter string", () => {
  assert.equal(resolveIso639Code("xx"), null);
});

test("resolveIso639Code() returns null for empty, missing, or non-string input", () => {
  assert.equal(resolveIso639Code(""), null);
  assert.equal(resolveIso639Code(undefined), null);
  assert.equal(resolveIso639Code(null), null);
  assert.equal(resolveIso639Code(42), null);
});

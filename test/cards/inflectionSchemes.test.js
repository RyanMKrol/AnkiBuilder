import test from "node:test";
import assert from "node:assert/strict";
import { inflectionScheme, formsFor, describeScheme } from "../../src/cards/inflectionSchemes.js";

test("Japanese declares the verb and adjective paradigms worth carding", () => {
  assert.deepEqual(
    formsFor("ja", "verb").map((f) => f.id),
    ["dictionary", "polite-present", "polite-past", "polite-negative", "polite-past-negative"],
  );
  assert.deepEqual(
    formsFor("ja", "adjective").map((f) => f.id),
    ["present", "past", "negative", "past-negative"],
  );
  assert.equal(inflectionScheme("ja").verb.citation, "polite-present");
});

test("a language NAME is not a code, and resolves to nothing", () => {
  // `resolveIso639Code` takes ISO 639-1 codes, as every language-keyed registry here does. Pinned so
  // a caller who passes "Japanese" and gets no paradigm can find out why from a test rather than
  // from a chapter built without one.
  assert.equal(inflectionScheme("Japanese"), null);
  assert.equal(inflectionScheme("ja")?.verb?.forms?.length, 5);
});

test("an unconfigured language is null, never an empty paradigm", () => {
  // Empty would let a caller loop over nothing and conclude "every form is present", which is the
  // failure the whole registry pattern exists to avoid.
  assert.equal(inflectionScheme("Spanish"), null);
  assert.equal(formsFor("es", "verb"), null);
  assert.equal(formsFor("ja", "noun"), null, "a part of speech with no paradigm is null too");
});

test("the description tells a prompt to card taught forms and invent none", () => {
  // The line this whole feature turns on. Supplying forms the source has not reached was tried on
  // this deck in 2026-09, reviewed, and stripped back out.
  const text = describeScheme("ja");
  assert.match(text, /WHEN THIS CHAPTER TEACHES IT/);
  assert.match(text, /Do NOT\ninvent a form the chapter has not reached/);
  assert.match(text, /polite past negative/);
});

test("an unconfigured language gets a plain instruction, not a made-up paradigm", () => {
  const text = describeScheme("Spanish");
  assert.match(text, /No inflection paradigm is configured/);
  assert.match(text, /Do not invent a paradigm/);
});

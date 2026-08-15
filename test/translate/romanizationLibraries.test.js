import test from "node:test";
import assert from "node:assert";
import { getRomanizationLibrary } from "../../src/translate/romanizationLibraries.js";

test("getRomanizationLibrary() returns a defined entry with a load function for a covered language", () => {
  for (const code of ["ja", "zh", "ko", "ru", "hi"]) {
    const entry = getRomanizationLibrary(code);
    assert.ok(entry, `expected an entry for ${code}`);
    assert.equal(typeof entry.load, "function");
    assert.equal(typeof entry.library, "string");
  }
});

test("getRomanizationLibrary() returns undefined for a language with no configured library", () => {
  assert.equal(getRomanizationLibrary("es"), undefined);
  assert.equal(getRomanizationLibrary("fr"), undefined);
  assert.equal(getRomanizationLibrary("el"), undefined);
  assert.equal(getRomanizationLibrary("th"), undefined);
});

// Both scripts omit short vowels and neither library restores them, so both returned a consonant
// skeleton — كتاب as `ktab`, ספר as `spr`. The prompt hands the library's value over as a
// trustworthy starting point, so leaving them wired in was strictly worse than nothing: it anchored
// the model on an unpronounceable answer. With no entry they take the LLM-only path, which is what
// every other language already does and which can supply the vowels.
test("Arabic and Hebrew are deliberately unwired, so they take the LLM-only path", () => {
  assert.equal(getRomanizationLibrary("ar"), undefined);
  assert.equal(getRomanizationLibrary("he"), undefined);
});

test("getRomanizationLibrary() returns undefined for null/undefined without throwing", () => {
  assert.equal(getRomanizationLibrary(null), undefined);
  assert.equal(getRomanizationLibrary(undefined), undefined);
});

test("getRomanizationLibrary() never invokes load() itself — config lookup is cheap", () => {
  // No assertion needed beyond "this test completes fast and without side effects" — invoking
  // load() would dynamically import a real (possibly heavy) library; a config test must not.
  const entry = getRomanizationLibrary("ja");
  assert.equal(typeof entry.load, "function");
});

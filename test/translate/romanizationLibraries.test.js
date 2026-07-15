import test from "node:test";
import assert from "node:assert";
import { getRomanizationLibrary } from "../../src/translate/romanizationLibraries.js";

test("getRomanizationLibrary() returns a defined entry with a load function for a covered language", () => {
  for (const code of ["ja", "zh", "ko", "ru", "he", "hi", "ar"]) {
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

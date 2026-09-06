import test from "node:test";
import assert from "node:assert/strict";
import {
  INVARIANT_KEYS,
  bookInvariants,
  bookHints,
  renderBookHints,
  assertConfigSeparation,
} from "../../src/corpus/bookConfig.js";

test("bookInvariants reads the split shape and the legacy flat one", () => {
  assert.deepEqual(bookInvariants({ invariants: { labelDecoding: 3 } }), { labelDecoding: 3 });
  // Books registered before the split stored it at the top level. Their file is never rewritten,
  // so reading the old shape is not a migration courtesy, it is the permanent contract.
  assert.deepEqual(bookInvariants({ title: "x", labelDecoding: 2 }), { labelDecoding: 2 });
  assert.deepEqual(bookInvariants({}), {});
  assert.deepEqual(bookInvariants(null), {});
});

test("a hint cannot become a code dependency by being read", () => {
  // This is the whole mechanism. A key only code may branch on is one named in INVARIANT_KEYS, so
  // putting it under `hints` does not smuggle it into the invariants a caller acts on.
  assert.deepEqual(bookInvariants({ hints: { labelDecoding: 9 } }), {});
});

test("bookInvariants returns only allow-listed keys, so promoting one is a code change", () => {
  const meta = { invariants: { labelDecoding: 2, vocabularyTables: 'class="voca"' } };
  assert.deepEqual(Object.keys(bookInvariants(meta)), ["labelDecoding"]);
  assert.ok(!INVARIANT_KEYS.includes("vocabularyTables"));
});

test("hints are frozen, because the only correct use is reading them into a prompt", () => {
  const hints = bookHints({ hints: { vocabularyTables: 'class="voca"' } });
  assert.ok(Object.isFrozen(hints));
  assert.equal(hints.vocabularyTables, 'class="voca"');
});

test("renderBookHints is null for a book with none, never a silent empty section", () => {
  assert.equal(renderBookHints({}), null);
  assert.equal(renderBookHints({ hints: {} }), null);
  assert.equal(
    renderBookHints({ hints: { b: "second", a: "first" } }),
    "- **a**: first\n- **b**: second",
  );
});

test("a key declared as both is a hard error, not a precedence puzzle", () => {
  assert.throws(
    () => assertConfigSeparation({ invariants: { labelDecoding: 1 }, hints: { labelDecoding: 2 } }),
    /both an invariant and a hint/,
  );
  assert.doesNotThrow(() =>
    assertConfigSeparation({ invariants: { labelDecoding: 1 }, hints: { vocabularyTables: "x" } }),
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { EPUB_PASS_PINS } from "../../src/corpus/epubLlmRunClaude.js";
import { TRANSLATE_PASS_PINS } from "../../src/translate/runClaude.js";
import { MODEL_RANK } from "../../src/agents/roles.js";

// v2's rule is that every agent a script invokes declares its own model and effort. The v2 roles are
// held to it by test/agents/roles.test.js. These are the v1 passes that SURVIVE around them, and
// until this file existed they declared no model at all: they fell through to DEFAULT_MODEL in
// runClaude.js, which is a real pin but an invisible one. A pass got its model from a constant three
// files away, and changing that constant would have moved eight passes at once with nothing saying so.

const FAMILIES = [
  ["epub", EPUB_PASS_PINS],
  ["translate", TRANSLATE_PASS_PINS],
];

test("every surviving pass names a model and an effort", () => {
  for (const [family, pins] of FAMILIES) {
    const scopes = Object.keys(pins);
    assert.ok(scopes.length > 3, `${family}: sanity, the table was found`);
    for (const [scope, pin] of Object.entries(pins)) {
      assert.ok(pin.model, `${family}/${scope} declares no model`);
      assert.ok(pin.effort, `${family}/${scope} declares no effort`);
      assert.ok(
        MODEL_RANK[pin.model],
        `${family}/${scope} names "${pin.model}", which is not in MODEL_RANK. Add it there ` +
          `deliberately rather than letting a role rank as unknown.`,
      );
    }
  }
});

test("a checking pass is pinned strictly above what it checks", () => {
  // The reason this is asserted rather than trusted: noticing that something is wrong is harder than
  // producing it, and a model checking its own family's output is biased toward approving it. Getting
  // it backwards leaves the pipeline looking verified while the verification is its weakest link.
  let asserted = 0;
  for (const [family, pins] of FAMILIES) {
    for (const [scope, pin] of Object.entries(pins)) {
      for (const checked of pin.checks ?? []) {
        const target = pins[checked];
        assert.ok(target, `${family}/${scope} checks "${checked}", which is not a pass here`);
        assert.ok(
          MODEL_RANK[pin.model] > MODEL_RANK[target.model],
          `${family}/${scope} (${pin.model}) checks ${checked} (${target.model}) and must outrank it`,
        );
        asserted++;
      }
    }
  }
  assert.ok(asserted > 0, "no checking pass declared `checks` — the assertion checked nothing");
});

test("the forward-flag pass is the one that outranks, and it checks extraction", () => {
  // Pinned here so the relationship survives someone editing the table without reading the comment.
  assert.deepEqual(EPUB_PASS_PINS.FORWARD_FLAGS.checks, ["EXTRACT"]);
  assert.equal(EPUB_PASS_PINS.FORWARD_FLAGS.model, "claude-opus-5");
});

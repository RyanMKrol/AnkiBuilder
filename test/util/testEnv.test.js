import test from "node:test";
import assert from "node:assert/strict";
import { isTestEnv, assertExternalCallAllowed } from "../../src/util/testEnv.js";
import { runClaude as translateRunClaude } from "../../src/translate/runClaude.js";
import { runClaude as epubRunClaude } from "../../src/corpus/epubLlmRunClaude.js";

test("isTestEnv detects the node:test runner", () => {
  assert.equal(isTestEnv(), true);
});

test("assertExternalCallAllowed refuses under the runner, and says what to do instead", () => {
  assert.throws(() => assertExternalCallAllowed("spend money"), /inject a stub instead/);
});

// The guard that matters: a test which forgets to inject a stub runner fails loudly instead of
// quietly spawning (and paying for) a real model call.
test("neither runClaude will spawn a real `claude` from a test", () => {
  assert.throws(() => translateRunClaude("hello"), /refusing to spawn/);
  assert.throws(() => epubRunClaude("hello"), /refusing to spawn/);
});

test("an explicit opt-out env var lifts the refusal", () => {
  process.env.ANKI_BUILDER_ALLOW_LLM_IN_TESTS = "1";
  try {
    assert.doesNotThrow(() => assertExternalCallAllowed("spend money"));
  } finally {
    delete process.env.ANKI_BUILDER_ALLOW_LLM_IN_TESTS;
  }
});

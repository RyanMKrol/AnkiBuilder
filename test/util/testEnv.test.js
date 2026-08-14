import test from "node:test";
import assert from "node:assert/strict";
import { isTestEnv, assertExternalCallAllowed } from "../../src/util/testEnv.js";
import * as translateRunners from "../../src/translate/runClaude.js";
import * as epubRunners from "../../src/corpus/epubLlmRunClaude.js";

const translateRunClaude = translateRunners.runClaude;
const epubRunClaude = epubRunners.runClaude;

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

// Same guard, over EVERY per-pass runner. Each pass now has its own wrapper, and a new one wired
// straight to `spawnSync` instead of through the shared core would be a silent hole in the refusal.
test("no per-pass runner will spawn a real `claude` from a test", () => {
  const runners = Object.entries({ ...translateRunners, ...epubRunners }).filter(
    ([name]) => name !== "runClaudeAsync" && name !== "runKanjiOrthographyClaude",
  );
  assert.ok(runners.length >= 12, `expected every pass to have a runner, saw ${runners.length}`);
  for (const [name, runner] of runners) {
    assert.throws(() => runner("hello"), /refusing to spawn/, `${name} did not refuse`);
  }
});

test("the async runners refuse too", async () => {
  await assert.rejects(() => translateRunners.runClaudeAsync("hello"), /refusing to spawn/);
  await assert.rejects(
    () => translateRunners.runKanjiOrthographyClaude("hello"),
    /refusing to spawn/,
  );
});

test("an explicit opt-out env var lifts the refusal", () => {
  process.env.ANKI_BUILDER_ALLOW_LLM_IN_TESTS = "1";
  try {
    assert.doesNotThrow(() => assertExternalCallAllowed("spend money"));
  } finally {
    delete process.env.ANKI_BUILDER_ALLOW_LLM_IN_TESTS;
  }
});

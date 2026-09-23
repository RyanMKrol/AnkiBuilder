import test from "node:test";
import assert from "node:assert/strict";
import "../../src/agents/roles.js";
import "../../src/corpus/epubLlmRunClaude.js";
import "../../src/translate/runClaude.js";
import "../../src/remaster/remasterRunners.js";
import {
  pinOrderProblems,
  runClaudeWithPrompt,
  resetPinOrderCheck,
} from "../../src/util/runClaude.js";

// The tables are held to "a checker outranks what it checks" by test/agents/survivingPassPins and
// roles.test. These tests hold the ENVIRONMENT to it: one override can move every pass at once.

function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLEAN = {
  ANKI_BUILDER_LLM_MODEL: undefined,
  ANKI_BUILDER_LLM_EFFORT: undefined,
  ANKI_BUILDER_ALLOW_PIN_INVERSION: undefined,
};

test("the pins as declared are in order", () => {
  withEnv(CLEAN, () => assert.deepEqual(pinOrderProblems(), []));
});

test("one global model override inverts every checker, and each inversion is named", () => {
  withEnv({ ...CLEAN, ANKI_BUILDER_LLM_MODEL: "claude-sonnet-5" }, () => {
    const problems = pinOrderProblems().join("\n");
    assert.match(problems, /remaster\/SETTLE .* checks TRANSCRIBE/);
    assert.match(problems, /epub\/FORWARD_FLAGS .* checks EXTRACT/);
    assert.match(problems, /agents\/finalReview .* checks/);
  });
});

test("an effort override alone can invert a same-model checker", () => {
  withEnv({ ...CLEAN, ANKI_BUILDER_LLM_EFFORT: "medium" }, () => {
    assert.match(pinOrderProblems().join("\n"), /agents\/coverageAdversary .* checks/);
  });
});

test("a scoped override that keeps the order is fine", () => {
  withEnv({ ...CLEAN, ANKI_BUILDER_REMASTER_TRANSCRIBE_EFFORT: "medium" }, () => {
    assert.deepEqual(pinOrderProblems(), []);
  });
});

test("an unranked model is reported rather than guessed at", () => {
  withEnv({ ...CLEAN, ANKI_BUILDER_REMASTER_SETTLE_MODEL: "claude-mystery-9" }, () => {
    assert.match(pinOrderProblems().join("\n"), /"claude-mystery-9" is not in MODEL_RANK/);
  });
});

test("an inversion stops the run before the first spawn, unless it is allowed", () => {
  const spawnOk = () => ({ status: 0, stdout: "ok", stderr: "" });
  withEnv(
    { ...CLEAN, ANKI_BUILDER_LLM_MODEL: "claude-sonnet-5", ANKI_BUILDER_ALLOW_LLM_IN_TESTS: "1" },
    () => {
      resetPinOrderCheck();
      let spawned = 0;
      assert.throws(
        () => runClaudeWithPrompt("p", { spawn: () => (spawned++, spawnOk()) }),
        /put a checking pass at or below what it checks/,
      );
      assert.equal(spawned, 0);

      resetPinOrderCheck();
      const warnings = [];
      const warn = console.warn;
      console.warn = (message) => warnings.push(message);
      try {
        withEnv({ ANKI_BUILDER_ALLOW_PIN_INVERSION: "1" }, () => {
          assert.equal(runClaudeWithPrompt("p", { spawn: spawnOk }), "ok");
        });
      } finally {
        console.warn = warn;
      }
      assert.match(warnings[0], /^WARNING: .*checking pass/s);
      resetPinOrderCheck();
    },
  );
});

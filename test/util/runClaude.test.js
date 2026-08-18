import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  runClaudeWithPrompt,
  runClaudeWithPromptAsync,
  resetQuotaState,
} from "../../src/util/runClaude.js";

// The core refuses to run under the test runner unless explicitly allowed — these tests
// inject a fake spawn, so lift the refusal around each call and restore afterwards.
function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries({
    ANKI_BUILDER_ALLOW_LLM_IN_TESTS: "1",
    ...overrides,
  })) {
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

const ok = (stdout = "OK") => ({ status: 0, stdout, stderr: "" });

test("passes the prompt on stdin, never argv", () => {
  withEnv({}, () => {
    const calls = [];
    const out = runClaudeWithPrompt("THE PROMPT", {
      spawn: (cmd, args, opts) => {
        calls.push({ cmd, args, opts });
        return ok("result text");
      },
    });

    assert.equal(out, "result text");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, "claude");
    assert.equal(calls[0].opts.input, "THE PROMPT");
    assert.ok(!calls[0].args.includes("THE PROMPT"));
    assert.ok(calls[0].opts.timeout > 0);
  });
});

test("model/effort precedence: scope pair > unified pair > default", () => {
  const argsFor = (env) =>
    withEnv(env, () => {
      let seen;
      runClaudeWithPrompt("p", {
        scopeEnvPrefix: "ANKI_BUILDER_TRANSLATE",
        spawn: (cmd, args) => {
          seen = args;
          return ok();
        },
      });
      return seen;
    });

  const defaults = argsFor({
    ANKI_BUILDER_TRANSLATE_MODEL: undefined,
    ANKI_BUILDER_TRANSLATE_EFFORT: undefined,
    ANKI_BUILDER_LLM_MODEL: undefined,
    ANKI_BUILDER_LLM_EFFORT: undefined,
  });
  assert.deepEqual(defaults, ["-p", "--model", "claude-sonnet-5", "--effort", "medium"]);

  const unified = argsFor({
    ANKI_BUILDER_TRANSLATE_MODEL: undefined,
    ANKI_BUILDER_TRANSLATE_EFFORT: undefined,
    ANKI_BUILDER_LLM_MODEL: "claude-opus-5",
    ANKI_BUILDER_LLM_EFFORT: "high",
  });
  assert.deepEqual(unified, ["-p", "--model", "claude-opus-5", "--effort", "high"]);

  const scoped = argsFor({
    ANKI_BUILDER_TRANSLATE_MODEL: "claude-haiku-4-5-20251001",
    ANKI_BUILDER_TRANSLATE_EFFORT: undefined,
    ANKI_BUILDER_LLM_MODEL: "claude-opus-5",
    ANKI_BUILDER_LLM_EFFORT: "high",
  });
  assert.deepEqual(scoped, ["-p", "--model", "claude-haiku-4-5-20251001", "--effort", "high"]);
});

test("retries once on failure, then succeeds", () => {
  withEnv({}, () => {
    let calls = 0;
    const out = runClaudeWithPrompt("p", {
      spawn: () => {
        calls++;
        return calls === 1 ? { status: 1, stdout: "", stderr: "transient" } : ok("second try");
      },
    });

    assert.equal(calls, 2);
    assert.equal(out, "second try");
  });
});

test("throws the last error once the retry is exhausted", () => {
  withEnv({}, () => {
    let calls = 0;
    assert.throws(
      () =>
        runClaudeWithPrompt("p", {
          spawn: () => {
            calls++;
            return { status: 1, stdout: "", stderr: `boom ${calls}` };
          },
        }),
      /exited with status 1 \(stderr: boom 2\)/,
    );
    assert.equal(calls, 2);
  });
});

test("maps a spawn timeout to a clear error naming the ceiling", () => {
  withEnv({ ANKI_BUILDER_LLM_TIMEOUT_MS: "1234" }, () => {
    assert.throws(
      () =>
        runClaudeWithPrompt("p", {
          spawn: () => ({
            error: Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" }),
          }),
        }),
      /timed out after 1234 ms/,
    );
  });
});

test("refuses to spawn without the explicit opt-out under the test runner", () => {
  // No withEnv here — the refusal must fire before any spawn happens.
  let spawned = false;
  assert.throws(
    () =>
      runClaudeWithPrompt("p", {
        spawn: () => {
          spawned = true;
          return ok();
        },
      }),
    /refusing to spawn/,
  );
  assert.equal(spawned, false);
});

// --- async twin ---

function fakeChild({ code = 0, stdout = "", stderr = "", neverClose = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  child.stdin = {
    on: () => {},
    end: (input) => {
      child.promptReceived = input;
      if (neverClose) return;
      queueMicrotask(() => {
        if (stdout) child.stdout.emit("data", stdout);
        if (stderr) child.stderr.emit("data", stderr);
        child.emit("close", code);
      });
    },
  };
  return child;
}

test("async: resolves stdout and passes the prompt on stdin", async () => {
  await withEnv({}, async () => {
    let child;
    const out = await runClaudeWithPromptAsync("ASYNC PROMPT", {
      spawnImpl: (cmd, args) => {
        assert.equal(cmd, "claude");
        assert.ok(!args.includes("ASYNC PROMPT"));
        child = fakeChild({ stdout: "async result" });
        return child;
      },
    });
    assert.equal(out, "async result");
    assert.equal(child.promptReceived, "ASYNC PROMPT");
  });
});

test("async: retries once on a non-zero exit, then surfaces the last error", async () => {
  await withEnv({}, async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        runClaudeWithPromptAsync("p", {
          spawnImpl: () => {
            calls++;
            return fakeChild({ code: 1, stderr: `boom ${calls}` });
          },
        }),
      /exited with status 1 \(stderr: boom 2\)/,
    );
    assert.equal(calls, 2);
  });
});

test("async: a hung child is killed at the timeout and reported", async () => {
  await withEnv({ ANKI_BUILDER_LLM_TIMEOUT_MS: "30" }, async () => {
    const children = [];
    await assert.rejects(
      () =>
        runClaudeWithPromptAsync("p", {
          spawnImpl: () => {
            const child = fakeChild({ neverClose: true });
            children.push(child);
            return child;
          },
        }),
      /timed out after 30 ms/,
    );
    assert.ok(children.every((child) => child.killed));
  });
});

// ---------------------------------------------------------------------------
// Per-pass scopes. The pass's own scope wins over its family's, which wins over the unified pair,
// which wins over the pass's own built-in default — and the TIMEOUT resolves down the same chain,
// which is the point: raising a slow pass's effort without its timeout would turn a quality knob
// into a mid-pass abort.
// ---------------------------------------------------------------------------

function pinningFor(env, options) {
  return withEnv(env, () => {
    let seen;
    let opts;
    runClaudeWithPrompt("p", {
      ...options,
      spawn: (cmd, args, spawnOpts) => {
        seen = args;
        opts = spawnOpts;
        return ok();
      },
    });
    return { model: seen[2], effort: seen[4], timeout: opts.timeout };
  });
}

const CLEAR = {
  ANKI_BUILDER_EXTRACT_MODEL: undefined,
  ANKI_BUILDER_EXTRACT_EFFORT: undefined,
  ANKI_BUILDER_EXTRACT_TIMEOUT_MS: undefined,
  ANKI_BUILDER_EPUB_LLM_MODEL: undefined,
  ANKI_BUILDER_EPUB_LLM_EFFORT: undefined,
  ANKI_BUILDER_EPUB_LLM_TIMEOUT_MS: undefined,
  ANKI_BUILDER_LLM_MODEL: undefined,
  ANKI_BUILDER_LLM_EFFORT: undefined,
  ANKI_BUILDER_LLM_TIMEOUT_MS: undefined,
};

const SCOPED = {
  scopeEnvPrefix: ["ANKI_BUILDER_EXTRACT", "ANKI_BUILDER_EPUB_LLM"],
  defaults: { effort: "high", timeoutMs: 1_500_000 },
};

test("a pass's own built-in default applies when nothing is set in the environment", () => {
  const pinning = pinningFor(CLEAR, SCOPED);
  assert.equal(pinning.model, "claude-sonnet-5");
  assert.equal(pinning.effort, "high");
  assert.equal(pinning.timeout, 1_500_000);
});

test("the family scope still moves a pass that has its own scope — nothing already set breaks", () => {
  const pinning = pinningFor(
    { ...CLEAR, ANKI_BUILDER_EPUB_LLM_MODEL: "claude-haiku-4-5-20251001" },
    SCOPED,
  );
  assert.equal(pinning.model, "claude-haiku-4-5-20251001");
});

test("the pass's own scope beats its family's", () => {
  const pinning = pinningFor(
    {
      ...CLEAR,
      ANKI_BUILDER_EXTRACT_MODEL: "claude-opus-5",
      ANKI_BUILDER_EPUB_LLM_MODEL: "claude-haiku-4-5-20251001",
      ANKI_BUILDER_LLM_MODEL: "claude-sonnet-5",
    },
    SCOPED,
  );
  assert.equal(pinning.model, "claude-opus-5");
});

test("an env setting beats the pass's built-in default, at every level", () => {
  assert.equal(pinningFor({ ...CLEAR, ANKI_BUILDER_LLM_EFFORT: "low" }, SCOPED).effort, "low");
  assert.equal(pinningFor({ ...CLEAR, ANKI_BUILDER_EPUB_LLM_EFFORT: "low" }, SCOPED).effort, "low");
  assert.equal(pinningFor({ ...CLEAR, ANKI_BUILDER_EXTRACT_EFFORT: "low" }, SCOPED).effort, "low");
});

test("the timeout resolves down the same chain as model and effort", () => {
  assert.equal(pinningFor({ ...CLEAR, ANKI_BUILDER_LLM_TIMEOUT_MS: "111" }, SCOPED).timeout, 111);
  assert.equal(
    pinningFor(
      { ...CLEAR, ANKI_BUILDER_LLM_TIMEOUT_MS: "111", ANKI_BUILDER_EPUB_LLM_TIMEOUT_MS: "222" },
      SCOPED,
    ).timeout,
    222,
  );
  assert.equal(
    pinningFor(
      {
        ...CLEAR,
        ANKI_BUILDER_LLM_TIMEOUT_MS: "111",
        ANKI_BUILDER_EPUB_LLM_TIMEOUT_MS: "222",
        ANKI_BUILDER_EXTRACT_TIMEOUT_MS: "333",
      },
      SCOPED,
    ).timeout,
    333,
  );
});

test("a pass with no built-in timeout still gets the shared 10-minute floor", () => {
  const pinning = pinningFor(CLEAR, {
    scopeEnvPrefix: ["ANKI_BUILDER_SORT", "ANKI_BUILDER_EPUB_LLM"],
  });
  assert.equal(pinning.timeout, 10 * 60 * 1000);
  assert.equal(pinning.effort, "medium");
});

test("a plain string scopeEnvPrefix still works, so an old call site is untouched", () => {
  const pinning = pinningFor(
    { ...CLEAR, ANKI_BUILDER_EPUB_LLM_MODEL: "claude-opus-5" },
    { scopeEnvPrefix: "ANKI_BUILDER_EPUB_LLM" },
  );
  assert.equal(pinning.model, "claude-opus-5");
});

test("a failure reports BOTH streams, because the CLI puts detail on stdout", () => {
  // A run of five passes once died with "exited with status 1: " and nothing after the colon: the
  // message interpolated stderr alone, and the CLI had written its reason to stdout.
  withEnv({}, () => {
    resetQuotaState();
    assert.throws(
      () =>
        runClaudeWithPrompt("p", {
          spawn: () => ({ status: 1, stdout: "Unexpected token < in JSON", stderr: "" }),
        }),
      /stdout: Unexpected token/,
    );
    assert.throws(
      () => runClaudeWithPrompt("p", { spawn: () => ({ status: 1, stdout: "", stderr: "" }) }),
      /no output on either stream/,
    );
  });
});

test("a quota refusal stops the run instead of retrying, and stops the NEXT call too", () => {
  // Quota is the one failure where retrying, and where continuing at all, is pure waste: every
  // remaining pass fails the same way. One build burned ten spawns after the limit was already hit,
  // then reported five separate "failed" passes as if they were five separate problems.
  withEnv({}, () => {
    resetQuotaState();
    let spawns = 0;
    assert.throws(
      () =>
        runClaudeWithPrompt("p", {
          spawn: () => {
            spawns++;
            return { status: 1, stdout: "Claude usage limit reached · resets 3am", stderr: "" };
          },
        }),
      /usage limit appears to be reached/,
    );
    assert.equal(spawns, 1, "no retry is spent on a quota refusal");

    // The breaker is process-scoped: the next pass in the same run must not spawn at all.
    let laterSpawns = 0;
    assert.throws(
      () =>
        runClaudeWithPrompt("p", {
          spawn: () => {
            laterSpawns++;
            return { status: 0, stdout: "ok" };
          },
        }),
      /usage limit appears to be reached/,
    );
    assert.equal(laterSpawns, 0, "the rest of the run does not spawn");
    resetQuotaState();
  });
});

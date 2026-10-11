import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  appendRunLog,
  readRunLogs,
  hasRunLogs,
  logDirFor,
  withRunLogDir,
  currentRunLogDir,
} from "../../src/agents/runLog.js";
import { runRole } from "../../src/agents/runRole.js";

/** Every test writes to a throwaway dir: golden rule 6, nothing here touches output/. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "anki-runlog-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a unit with no logs reports absence, not a clean run", () => {
  const { dir, cleanup } = scratch();
  try {
    assert.equal(hasRunLogs(dir), false);
    assert.deepEqual(readRunLogs(dir), []);
  } finally {
    cleanup();
  }
});

test("appendRunLog writes one file per call and readRunLogs returns them in order", () => {
  const { dir, cleanup } = scratch();
  try {
    const logDir = logDirFor(dir);
    appendRunLog(logDir, { role: "gapAuthor", ok: true, prompt: "p1", response: "r1" });
    appendRunLog(logDir, { role: "inventiveAuthor", ok: true, prompt: "p2", response: "r2" });
    const logs = readRunLogs(dir);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].role, "gapAuthor");
    assert.equal(logs[1].role, "inventiveAuthor");
    assert.equal(logs[0].response, "r1");
    assert.equal(hasRunLogs(dir), true);
  } finally {
    cleanup();
  }
});

test("a failed call is written too, and named so it is visible in a directory listing", () => {
  const { dir, cleanup } = scratch();
  try {
    const path = appendRunLog(logDirFor(dir), {
      role: "gapAuthor",
      ok: false,
      prompt: "p",
      error: "boom",
    });
    assert.ok(path.includes("FAILED"), `expected FAILED in ${path}`);
    assert.equal(readRunLogs(dir)[0].error, "boom");
  } finally {
    cleanup();
  }
});

test("the prompt is kept as a head plus a length, so a huge prompt cannot dwarf the deck", () => {
  const { dir, cleanup } = scratch();
  try {
    const huge = "x".repeat(50_000);
    appendRunLog(logDirFor(dir), { role: "chapterReader", ok: true, prompt: huge, response: "r" });
    const log = readRunLogs(dir)[0];
    assert.equal(log.promptChars, 50_000);
    assert.ok(log.promptHead.length < 5000);
  } finally {
    cleanup();
  }
});

test("appendRunLog with no directory is a no-op, so logging is opt-in", () => {
  assert.equal(appendRunLog(null, { role: "x", ok: true }), null);
});

test("withRunLogDir restores the previous directory, including when the body throws", () => {
  assert.equal(currentRunLogDir(), null);
  assert.throws(() => {
    withRunLogDir("/tmp/a", () => {
      assert.equal(currentRunLogDir(), "/tmp/a");
      throw new Error("phase died");
    });
  });
  assert.equal(currentRunLogDir(), null, "a failed phase must not leak its log dir into the next");
});

test("runRole tees a successful response into the ambient directory", () => {
  const { dir, cleanup } = scratch();
  try {
    withRunLogDir(logDirFor(dir), () => {
      runRole("gapAuthor", "the prompt", { runClaude: () => '{"items":[]}' });
    });
    const logs = readRunLogs(dir);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].ok, true);
    assert.equal(logs[0].response, '{"items":[]}');
    assert.equal(logs[0].model, "claude-sonnet-5");
  } finally {
    cleanup();
  }
});

test("runRole tees a response BEFORE the caller parses it, which is the gap this closed", () => {
  const { dir, cleanup } = scratch();
  try {
    // The real failure shape: the model returns something, a guard rejects it, and the evidence used
    // to be destroyed by the act of judging it. The response must be on disk regardless.
    assert.throws(() => {
      withRunLogDir(logDirFor(dir), () => {
        const raw = runRole("gapAuthor", "p", { runClaude: () => "not json at all" });
        JSON.parse(raw);
      });
    });
    // Both tries are on disk: the first bad reply is evidence too.
    const logs = readRunLogs(dir);
    assert.equal(logs.length, 2);
    assert.equal(logs[0].response, "not json at all");
    assert.equal(logs[1].response, "not json at all");
  } finally {
    cleanup();
  }
});

test("runRole asks once more when a reply has no JSON object, and returns the good one", () => {
  const { dir, cleanup } = scratch();
  try {
    // The Lesson 21 shape: a chatty line where the JSON should be, then a normal answer.
    const replies = ["Tool's loaded and ready whenever you need it.", '{"items":[1]}'];
    let calls = 0;
    const raw = withRunLogDir(logDirFor(dir), () =>
      runRole("inventiveAuthor", "p", { runClaude: () => replies[calls++] }),
    );
    assert.equal(calls, 2);
    assert.equal(raw, '{"items":[1]}');
    assert.equal(readRunLogs(dir).length, 2);
  } finally {
    cleanup();
  }
});

test("runRole does not retry a reply that parses, fenced or bare", () => {
  for (const reply of ['{"a":1}', 'Here you go:\n```json\n{"a":1}\n```']) {
    let calls = 0;
    runRole("gapAuthor", "p", {
      runClaude: () => {
        calls++;
        return reply;
      },
    });
    assert.equal(calls, 1);
  }
});

test("runRole retries only once: a second bad reply goes back to the caller as is", () => {
  let calls = 0;
  const raw = runRole("gapAuthor", "p", {
    runClaude: () => {
      calls++;
      return `chat ${calls}`;
    },
  });
  assert.equal(calls, 2);
  assert.equal(raw, "chat 2");
});

test("runRole tees a call that threw, then rethrows", () => {
  const { dir, cleanup } = scratch();
  try {
    assert.throws(() =>
      withRunLogDir(logDirFor(dir), () =>
        runRole("gapAuthor", "p", {
          runClaude: () => {
            throw new Error("timeout");
          },
        }),
      ),
    );
    const logs = readRunLogs(dir);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].ok, false);
    assert.match(logs[0].error, /timeout/);
  } finally {
    cleanup();
  }
});

test("runRole logs nothing when no directory is in scope", () => {
  const { dir, cleanup } = scratch();
  try {
    runRole("gapAuthor", "p", { runClaude: () => "r" });
    assert.equal(existsSync(logDirFor(dir)), false);
  } finally {
    cleanup();
  }
});

import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { tmpdir, hostname } from "os";
import { setTimeout } from "node:timers";
import { join } from "path";
import {
  CLAIM_HARD_MAX_MS,
  claimLiveness,
  claimMatches,
  claimPath,
  clearClaim,
  describeClaim,
  isPidAlive,
  readClaim,
  updateClaim,
  withClaim,
  writeClaim,
} from "../../src/cli/runClaim.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "run-claim-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DEAD_PID = 999999;

test("writeClaim stamps pid, host and startedAt; readClaim round-trips it", () => {
  withTempDir((dir) => {
    const written = writeClaim(dir, { kind: "chapter", chapterNumber: 7 });
    assert.equal(written.pid, process.pid);
    assert.equal(written.host, hostname());
    assert.ok(Date.parse(written.startedAt));

    const read = readClaim(dir);
    assert.equal(read.chapterNumber, 7);
    assert.equal(read.kind, "chapter");
  });
});

test("readClaim returns null for a missing or unparseable claim", () => {
  withTempDir((dir) => {
    assert.equal(readClaim(dir), null);
    writeFileSync(claimPath(dir), "{ not json");
    assert.equal(readClaim(dir), null, "an unreadable claim must not throw");
  });
});

test("writeClaim with exclusive refuses to overwrite an existing claim", () => {
  withTempDir((dir) => {
    writeClaim(dir, { chapterNumber: 1 });
    assert.throws(
      () => writeClaim(dir, { chapterNumber: 2 }, { exclusive: true }),
      (err) => err.code === "EEXIST",
    );
    assert.equal(readClaim(dir).chapterNumber, 1, "the original claim must survive");
  });
});

test("updateClaim merges a patch and is a no-op when there is no claim", () => {
  withTempDir((dir) => {
    assert.equal(updateClaim(dir, { stage: "audio" }), null);
    writeClaim(dir, { kind: "chapter", stage: "assemble", chapterNumber: 3 });
    const next = updateClaim(dir, { stage: "audio" });
    assert.equal(next.stage, "audio");
    assert.equal(next.chapterNumber, 3, "unpatched fields are preserved");
  });
});

test("clearClaim removes the file and tolerates it already being gone", () => {
  withTempDir((dir) => {
    writeClaim(dir, {});
    clearClaim(dir);
    assert.equal(existsSync(claimPath(dir)), false);
    clearClaim(dir); // must not throw
  });
});

test("isPidAlive is true for this process and false for a dead pid", () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(DEAD_PID), false);
  assert.equal(isPidAlive(0), false);
  assert.equal(isPidAlive(undefined), false);
});

test("claimLiveness: live, stale, unknown, and the pid-recycle backstop", () => {
  const host = () => "this-host";
  const base = { pid: 5, host: "this-host", startedAt: new Date(1000).toISOString() };

  assert.equal(
    claimLiveness(base, { isPidAlive: () => true, hostname: host, now: () => 2000 }),
    "live",
  );
  assert.equal(
    claimLiveness(base, { isPidAlive: () => false, hostname: host, now: () => 2000 }),
    "stale",
  );
  assert.equal(
    claimLiveness({ ...base, host: "other-host" }, { isPidAlive: () => true, hostname: host }),
    "unknown",
    "a claim from another machine cannot be probed, so it is never declared stale",
  );
  assert.equal(
    claimLiveness(base, {
      isPidAlive: () => true,
      hostname: host,
      now: () => 1000 + CLAIM_HARD_MAX_MS + 1,
    }),
    "stale",
    "a live-looking pid past the hard ceiling is a recycled pid, not the original process",
  );
  assert.equal(claimLiveness(null), "stale");
});

test("claimMatches compares every field of the key", () => {
  const claim = { kind: "chapter", epubHash: "abc", chapterNumber: 7 };
  assert.equal(claimMatches(claim, { epubHash: "abc", chapterNumber: 7 }), true);
  assert.equal(claimMatches(claim, { epubHash: "abc", chapterNumber: 8 }), false);
  assert.equal(claimMatches(claim, { epubHash: "zzz", chapterNumber: 7 }), false);
  assert.equal(claimMatches(null, { epubHash: "abc" }), false);
});

test("describeClaim names the stage, pid, host and start time", () => {
  const text = describeClaim({
    stage: "assemble",
    pid: 42,
    host: "mac",
    startedAt: "2026-07-25T14:32:00.000Z",
  });
  assert.match(text, /assemble/);
  assert.match(text, /42/);
  assert.match(text, /mac/);
  assert.match(text, /2026-07-25/);
});

test("withClaim holds a claim for the body and clears it on success", () => {
  withTempDir((dir) => {
    let sawClaim = null;
    withClaim(dir, { stage: "translate" }, () => {
      sawClaim = readClaim(dir);
    });
    assert.equal(sawClaim.stage, "translate", "the claim must exist while the body runs");
    assert.equal(existsSync(claimPath(dir)), false, "and be gone once it succeeds");
  });
});

test("withClaim clears the claim on failure by default", () => {
  withTempDir((dir) => {
    assert.throws(() =>
      withClaim(dir, { stage: "audio" }, () => {
        throw new Error("boom");
      }),
    );
    assert.equal(existsSync(claimPath(dir)), false);
  });
});

// The rule that makes crash-resume work: a failed assemble must LEAVE its claim, because the
// run dir has no corpus.json yet and the claim is the only thing identifying it as this
// chapter's crashed attempt rather than an orphan.
test("withClaim keeps the claim on failure when clearOnFailure is false", () => {
  withTempDir((dir) => {
    assert.throws(
      () =>
        withClaim(
          dir,
          { stage: "assemble", chapterNumber: 7 },
          () => {
            throw new Error("extraction failed");
          },
          { clearOnFailure: false },
        ),
      /extraction failed/,
    );
    const claim = readClaim(dir);
    assert.equal(claim.chapterNumber, 7, "the crashed attempt must remain identifiable");
  });
});

test("withClaim holds the claim until an async body settles", async () => {
  const dir = mkdtempSync(join(tmpdir(), "run-claim-"));
  try {
    let claimDuringAwait = null;
    await withClaim(dir, { stage: "audio" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      claimDuringAwait = readClaim(dir);
    });
    assert.equal(claimDuringAwait.stage, "audio", "the claim must survive across an await");
    assert.equal(existsSync(claimPath(dir)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withClaim clears the claim when an async body rejects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "run-claim-"));
  try {
    await assert.rejects(
      withClaim(dir, { stage: "audio" }, async () => {
        throw new Error("tts failed");
      }),
      /tts failed/,
    );
    assert.equal(existsSync(claimPath(dir)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a claim written by withClaim is valid JSON on disk", () => {
  withTempDir((dir) => {
    withClaim(dir, { stage: "assemble", chapterNumber: 2 }, () => {
      const raw = readFileSync(claimPath(dir), "utf-8");
      assert.doesNotThrow(() => JSON.parse(raw));
      assert.ok(raw.endsWith("\n"));
    });
  });
});

// A run directory is reserved with an identity claim ({kind, epubHash, chapterNumber}) minutes
// before its corpus.json exists. withClaim used to REPLACE that with a bare {stage}, which quietly
// disabled both reuse rules that depend on claimMatches: a retry after a crash could no longer
// recognize its own directory, and the double-run guard could never fire.
test("withClaim preserves the reservation's identity fields", () => {
  withTempDir((dir) => {
    writeClaim(dir, { kind: "chapter", epubHash: "hash", chapterNumber: 7 });

    withClaim(dir, { stage: "assemble" }, () => {
      const claim = readClaim(dir);
      assert.equal(claim.stage, "assemble");
      assert.ok(
        claimMatches(claim, { kind: "chapter", epubHash: "hash", chapterNumber: 7 }),
        "the reservation identity must survive the stage claim",
      );
    });
  });
});

test("withClaim refuses a claim held by a DIFFERENT live process, but not by this one", () => {
  withTempDir((dir) => {
    // pid 1 always exists (process.kill(1, 0) throws EPERM, which reads as alive).
    writeFileSync(
      claimPath(dir),
      JSON.stringify({ version: 1, stage: "prepare", pid: 1, host: hostname() }) + "\n",
    );
    assert.throws(
      () => withClaim(dir, { stage: "audio" }, () => {}),
      /is already being built/,
      "a live claim owned by another process must not be taken over",
    );

    // Our own live claim is the normal case: reservation writes one just before the stage runs.
    writeClaim(dir, { kind: "chapter", epubHash: "hash", chapterNumber: 7 });
    assert.doesNotThrow(() => withClaim(dir, { stage: "assemble" }, () => {}));
  });
});

test("Ctrl-C during a clearOnFailure:false stage keeps the claim, like a hard kill", () => {
  withTempDir((dir) => {
    writeClaim(dir, { kind: "chapter", epubHash: "hash", chapterNumber: 7 });
    const before = process.listeners("SIGINT").length;
    try {
      withClaim(
        dir,
        { stage: "assemble" },
        () => {
          // Reach in and run the handler withClaim installed, which is what a real SIGINT does —
          // minus the re-kill, which would take the test runner down with it.
          const handler = process.listeners("SIGINT")[before];
          assert.ok(handler, "withClaim must install a SIGINT handler");
          const kill = process.kill;
          process.kill = () => {};
          try {
            handler("SIGINT");
          } finally {
            process.kill = kill;
          }
          assert.ok(
            existsSync(claimPath(dir)),
            "interrupting a stage that keeps its claim on failure must not delete it",
          );
        },
        { clearOnFailure: false },
      );
    } finally {
      process.removeAllListeners("SIGINT");
    }
  });
});

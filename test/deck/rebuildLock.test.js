import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { tmpdir, hostname } from "os";
import { join } from "path";
import { setTimeout as delay } from "timers/promises";
import {
  RebuildBusyError,
  isRebuildLocked,
  lockPath,
  withRebuildLock,
} from "../../src/deck/rebuildLock.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DEAD_PID = 999999;

test("withRebuildLock holds the lock for the body and releases it afterwards", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    let lockedDuringBody = false;
    const result = await withRebuildLock(dir, () => {
      lockedDuringBody = isRebuildLocked(dir);
      return "built";
    });
    assert.equal(result, "built");
    assert.ok(lockedDuringBody, "the lock must be held while the rebuild runs");
    assert.equal(isRebuildLocked(dir), false, "and released once it finishes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withRebuildLock releases the lock when the body throws", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    await assert.rejects(
      withRebuildLock(dir, () => {
        throw new Error("no finished lessons");
      }),
      /no finished lessons/,
    );
    assert.equal(isRebuildLocked(dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The reason the lock exists: a waiter must WAIT, not skip. If it skipped, a lesson marked
// done while another rebuild was mid-flight would be missing from the package.
test("a second acquirer waits for the first and then runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    const order = [];
    const first = withRebuildLock(dir, async () => {
      order.push("first-start");
      await delay(60);
      order.push("first-end");
    });
    await delay(10); // let `first` take the lock
    const second = withRebuildLock(dir, () => {
      order.push("second");
    });
    await Promise.all([first, second]);

    assert.deepEqual(
      order,
      ["first-start", "first-end", "second"],
      "the waiter must run AFTER the holder finishes, not be skipped",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a lock whose holder is dead is stolen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: DEAD_PID, host: hostname(), startedAt: new Date().toISOString() }),
    );
    let ran = false;
    await withRebuildLock(dir, () => {
      ran = true;
    });
    assert.ok(ran, "a lock held by a process that no longer exists must not block forever");
    assert.equal(isRebuildLocked(dir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a lock older than its TTL is stolen even if the pid looks alive", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    writeFileSync(
      lockPath(dir),
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        startedAt: new Date(Date.now() - 120_000).toISOString(),
      }),
    );
    let ran = false;
    await withRebuildLock(
      dir,
      () => {
        ran = true;
      },
      { ttlMs: 60_000 },
    );
    assert.ok(ran);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("waiting past the timeout throws RebuildBusyError naming the holder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    writeFileSync(
      lockPath(dir),
      JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }),
    );
    await assert.rejects(
      withRebuildLock(dir, () => {}, { timeoutMs: 60, pollMs: 10 }),
      (err) => {
        assert.ok(err instanceof RebuildBusyError);
        assert.match(err.message, new RegExp(String(process.pid)));
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unparseable lock file is treated as stale rather than blocking forever", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-lock-"));
  try {
    writeFileSync(lockPath(dir), "{ not json");
    let ran = false;
    await withRebuildLock(dir, () => {
      ran = true;
    });
    assert.ok(ran);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the lock file is a dotfile so directory scans never see it as a unit", () => {
  withTempDir((dir) => {
    writeFileSync(lockPath(dir), "{}");
    const name = lockPath(dir).split("/").pop();
    assert.ok(
      name.startsWith("."),
      `lock file ${name} must be hidden from listBooks/scanNumberedUnits`,
    );
    assert.ok(existsSync(lockPath(dir)));
    assert.doesNotThrow(() => JSON.parse(readFileSync(lockPath(dir), "utf-8")));
  });
});

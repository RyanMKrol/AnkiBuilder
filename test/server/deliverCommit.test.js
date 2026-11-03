import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDeckServer } from "../../src/server/index.js";

// The Deliver route's commit half, with a fake deliverer and a fake git: what matters here is the
// ORDER (check, deliver, record, commit) and that a refusal stops before Anki is touched. The git
// logic itself is covered against a real scratch repo in dashboardGit.test.js.

function fakeGit({ ok = true, commitPaths = ["output/x/cards.json"] } = {}) {
  const calls = [];
  const gate = {
    ok,
    branch: "main",
    reasons: [],
    foreign: ok ? [] : [{ path: "src.js", why: "changed outside the dashboard" }],
    commitPaths,
    untrackedLeft: 0,
  };
  return {
    calls,
    repoRoot: "/scratch",
    snapshot: async () => (calls.push("snapshot"), new Map()),
    record: async () => void calls.push("record"),
    assess: async () => (calls.push("assess"), gate),
    commitAndPush: async (paths) => (
      calls.push("commit"),
      { committed: true, sha: "abc1234", paths, pushed: true }
    ),
  };
}

async function post(url, path) {
  const r = await fetch(url + path, { method: "POST" });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // A 404 is an HTML page, not JSON.
  }
  return { status: r.status, body };
}

async function withServer(opts, fn) {
  const root = mkdtempSync(join(tmpdir(), "deliver-commit-"));
  const { server, url } = await startDeckServer({ port: 0, outputRoot: root, ...opts });
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

const fakeDeliver =
  (log) =>
  async (_root, _sel, { dry }) => {
    log.push(dry ? "deliver-dry" : "deliver");
    return { content: [], structure: [], backupDir: "/b" };
  };

test("a delivery commits and pushes what the dashboard wrote, after Anki has it", async () => {
  const git = fakeGit();
  const log = git.calls;
  await withServer({ git, deliver: fakeDeliver(log), createClient: () => ({}) }, async (url) => {
    const { status, body } = await post(url, "/api/anki/deliver");
    assert.equal(status, 200);
    assert.deepEqual(body.git, {
      committed: true,
      sha: "abc1234",
      paths: ["output/x/cards.json"],
      pushed: true,
    });
  });
  assert.deepEqual(log, ["assess", "snapshot", "deliver", "record", "assess", "commit"]);
});

test("the preview reports what would be committed and commits nothing", async () => {
  const git = fakeGit();
  await withServer(
    { git, deliver: fakeDeliver(git.calls), createClient: () => ({}) },
    async (url) => {
      const { body } = await post(url, "/api/anki/deliver?dry=1");
      assert.deepEqual(body.git.commitPaths, ["output/x/cards.json"]);
    },
  );
  assert.ok(!git.calls.includes("commit"));
});

test("foreign changes refuse the delivery before Anki is touched", async () => {
  const git = fakeGit({ ok: false });
  await withServer(
    { git, deliver: fakeDeliver(git.calls), createClient: () => ({}) },
    async (url) => {
      const { status, body } = await post(url, "/api/anki/deliver");
      assert.equal(status, 409);
      assert.match(body.error, /src\.js \(changed outside the dashboard\)/);
    },
  );
  assert.deepEqual(git.calls, ["assess"]);
});

test("every dashboard write is recorded, so Deliver can tell it from anyone else's", async () => {
  const git = fakeGit();
  await withServer({ git }, async (url) => {
    // Any POST goes through the wrapper, even one that 404s: attribution cannot depend on the
    // route succeeding, because a write that failed halfway still wrote.
    await post(url, "/api/deck/epub/nope/rebuild");
  });
  assert.deepEqual(git.calls, ["snapshot", "record"]);
});

test("two dashboard writes sent together run one at a time, snapshot to record", async () => {
  // Two Mark ready clicks on different cards in one file overlapped (2026-11-03): the second took its
  // snapshot after the first had written but before the first was recorded, found a hash the journal
  // did not know, and marked five Busy People files mixed. Holding the reply does not help when the
  // page does not wait for it. No snapshot may start until the previous write is recorded.
  const git = fakeGit();
  git.record = async () => {
    await new Promise((r) => setTimeout(r, 100));
    git.calls.push("record");
  };
  await withServer({ git }, async (url) => {
    await Promise.all([
      post(url, "/api/deck/epub/nope/rebuild"),
      post(url, "/api/deck/epub/nope/rebuild"),
    ]);
  });
  assert.deepEqual(git.calls, ["snapshot", "record", "snapshot", "record"]);
});

test("a failed dashboard write does not stall the writes queued behind it", async () => {
  const git = fakeGit();
  let first = true;
  git.snapshot = async () => {
    if (first) {
      first = false;
      throw new Error("git status failed");
    }
    git.calls.push("snapshot");
    return new Map();
  };
  await withServer({ git }, async (url) => {
    const a = await post(url, "/api/deck/epub/nope/rebuild");
    assert.equal(a.status, 500);
    const b = await post(url, "/api/deck/epub/nope/rebuild");
    assert.equal(b.status, 404, "the next write still runs");
  });
  assert.deepEqual(git.calls, ["snapshot", "record"]);
});

test("a dashboard write answers only after it is recorded, so a quick second edit cannot race it", async () => {
  // Two quick trims on one card blocked Deliver (2026-10-19): the first answered before its write
  // was recorded, the page sent the second at once, and the second found the file at a hash the
  // journal did not know yet, so it was marked mixed. The reply must wait for the record.
  const git = fakeGit();
  let recorded = false;
  git.record = async () => {
    await new Promise((r) => setTimeout(r, 150));
    recorded = true;
  };
  await withServer({ git }, async (url) => {
    const { status } = await post(url, "/api/deck/epub/nope/rebuild");
    assert.equal(status, 404, "the route still answers, including a 404");
    assert.equal(recorded, true, "but only once the write was recorded");
  });
});

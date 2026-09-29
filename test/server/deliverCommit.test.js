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

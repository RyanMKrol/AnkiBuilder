import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDashboardGit,
  openDashboardGit,
  describeRefusal,
} from "../../src/server/dashboardGit.js";

// A scratch checkout with its own bare remote, both in the temp dir. Hooks are pointed at an empty
// folder so the repo's own pre-push hook (which runs the whole CI suite) never fires here.
function scratchRepo() {
  const base = mkdtempSync(join(tmpdir(), "dash-git-"));
  const remote = join(base, "remote.git");
  const work = join(base, "work");
  const hooks = join(base, "no-hooks");
  mkdirSync(hooks);
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf-8" });
  git(base, "init", "--quiet", "--bare", "--initial-branch=main", remote);
  git(base, "clone", "--quiet", remote, work);
  for (const [k, v] of [
    ["user.name", "Test"],
    ["user.email", "test@example.com"],
    ["core.hooksPath", hooks],
    ["commit.gpgsign", "false"],
  ]) {
    git(work, "config", k, v);
  }
  git(work, "checkout", "--quiet", "-b", "main");
  mkdirSync(join(work, "output"));
  writeFileSync(join(work, "output", "cards.json"), '{"v":1}\n');
  writeFileSync(join(work, "output", "other.json"), '{"v":1}\n');
  writeFileSync(join(work, "src.js"), "export {};\n");
  git(work, "add", ".");
  git(work, "commit", "--quiet", "-m", "init");
  git(work, "push", "--quiet", "-u", "origin", "main");
  return { work, remote, git: (...args) => git(work, ...args) };
}

// What the server does around every dashboard write.
async function dashboardWrite(dg, fn) {
  const before = await dg.snapshot();
  fn();
  await dg.record(before);
}

test("a file only the dashboard wrote is committed and pushed", async () => {
  const { work, remote, git } = scratchRepo();
  const dg = createDashboardGit({ repoRoot: work });
  await dashboardWrite(dg, () => writeFileSync(join(work, "output", "cards.json"), '{"v":2}\n'));

  const gate = await dg.assess();
  assert.equal(gate.ok, true, describeRefusal(gate));
  assert.deepEqual(gate.commitPaths, ["output/cards.json"]);

  const result = await dg.commitAndPush(gate.commitPaths, "deliver");
  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(git("status", "--porcelain"), "");
  const pushed = execFileSync("git", ["show", "main:output/cards.json"], {
    cwd: remote,
    encoding: "utf-8",
  });
  assert.equal(pushed, '{"v":2}\n');
});

test("an edit made outside the dashboard refuses, naming the file", async () => {
  const { work } = scratchRepo();
  const dg = createDashboardGit({ repoRoot: work });
  await dashboardWrite(dg, () => writeFileSync(join(work, "output", "cards.json"), '{"v":2}\n'));
  writeFileSync(join(work, "src.js"), "export const x = 1;\n");

  const gate = await dg.assess();
  assert.equal(gate.ok, false);
  assert.deepEqual(
    gate.foreign.map((f) => f.path),
    ["src.js"],
  );
  assert.match(describeRefusal(gate), /src\.js \(changed outside the dashboard\)/);
});

test("a file someone else edited after the dashboard did is no longer the dashboard's", async () => {
  const { work } = scratchRepo();
  const dg = createDashboardGit({ repoRoot: work });
  const file = join(work, "output", "cards.json");
  await dashboardWrite(dg, () => writeFileSync(file, '{"v":2}\n'));
  writeFileSync(file, '{"v":3}\n');

  const gate = await dg.assess();
  assert.equal(gate.ok, false);
  assert.deepEqual(gate.commitPaths, []);
});

test("a dashboard write onto someone else's uncommitted edit is mixed, and blocks", async () => {
  const { work } = scratchRepo();
  const dg = createDashboardGit({ repoRoot: work });
  const file = join(work, "output", "cards.json");
  writeFileSync(file, '{"v":"session"}\n');
  await dashboardWrite(dg, () => writeFileSync(file, '{"v":"session+dashboard"}\n'));

  const gate = await dg.assess();
  assert.equal(gate.ok, false);
  assert.equal(gate.foreign[0].path, "output/cards.json");
  assert.match(gate.foreign[0].why, /dashboard AND by something else/);
});

test("the checkout must be on main with nothing unpushed", async () => {
  const { work, git } = scratchRepo();
  const dg = createDashboardGit({ repoRoot: work });

  git("checkout", "--quiet", "-b", "fix/something");
  assert.match((await dg.assess()).reasons.join(), /on branch fix\/something, not main/);

  git("checkout", "--quiet", "main");
  writeFileSync(join(work, "src.js"), "export const y = 2;\n");
  git("commit", "--quiet", "-am", "a session's unpushed commit");
  assert.match((await dg.assess()).reasons.join(), /1 local commit\(s\) that were never pushed/);
});

test("untracked files the dashboard did not create are left alone and never block", async () => {
  const { work, git } = scratchRepo();
  const dg = createDashboardGit({ repoRoot: work });
  writeFileSync(join(work, "scratch-notes.txt"), "not mine\n");
  await dashboardWrite(dg, () => writeFileSync(join(work, "output", "cards.json"), '{"v":2}\n'));

  const gate = await dg.assess();
  assert.equal(gate.ok, true);
  assert.equal(gate.untrackedLeft, 1);
  await dg.commitAndPush(gate.commitPaths, "deliver");
  assert.equal(git("status", "--porcelain").trim(), "?? scratch-notes.txt");
});

test("a push the remote rejects because it moved on is rebased and retried", async () => {
  const { work, remote } = scratchRepo();
  // Someone else pushes to main from another clone.
  const other = mkdtempSync(join(tmpdir(), "dash-git-other-"));
  const og = (...args) => execFileSync("git", args, { cwd: other, encoding: "utf-8" });
  og("clone", "--quiet", remote, ".");
  og("config", "user.name", "Other");
  og("config", "user.email", "other@example.com");
  og("config", "core.hooksPath", join(other, ".no-hooks"));
  writeFileSync(join(other, "output", "other.json"), '{"v":"theirs"}\n');
  og("commit", "--quiet", "-am", "theirs");
  og("push", "--quiet");

  const dg = createDashboardGit({ repoRoot: work });
  await dashboardWrite(dg, () => writeFileSync(join(work, "output", "cards.json"), '{"v":2}\n'));
  const gate = await dg.assess();
  const result = await dg.commitAndPush(gate.commitPaths, "deliver");
  assert.equal(result.pushed, true, result.pushError);
  assert.equal(readFileSync(join(work, "output", "other.json"), "utf-8"), '{"v":"theirs"}\n');
});

test("outside a git work tree there is no dashboard git, so delivery commits nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dash-git-none-"));
  assert.equal(await openDashboardGit(dir), null);
});

test("under the test runner it refuses a repo outside the temp dir", () => {
  assert.throws(
    () => createDashboardGit({ repoRoot: process.cwd() }),
    /refusing to commit .* under the test runner/,
  );
});

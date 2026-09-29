import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { isTestEnv } from "../util/testEnv.js";

const execFileAsync = promisify(execFile);

// The dashboard's own git: it commits and pushes what a Deliver to Anki shipped, and it refuses to
// when the checkout holds changes the dashboard did not make.
//
// Why this exists. Dashboard edits (a replaced clip, a trimmed take, an inline gloss fix) land in
// tracked JSON, and until 2026-09-29 nothing committed them: they sat in the working tree until some
// agent session noticed and swept them into an unrelated commit, or a discarded worktree lost them.
// The owner's ruling was that clicking Deliver IS the decision to keep them, so Deliver commits.
//
// Why the guard. The same checkout is also where agent sessions work. A commit that took the whole
// dirty tree would wrap up a half-finished session edit as "delivered", so the dashboard commits only
// files it can prove it wrote, and refuses the whole delivery (Anki untouched, nothing committed) when
// anything else is dirty. "Proving it wrote" is a journal: around every dashboard write the server
// snapshots the dirty set, and each path whose content changed during the request is recorded with
// the hash it was left at. At deliver time a dirty tracked path is the dashboard's only if its
// current hash still matches that record. A path that was ALREADY dirty with someone else's edit
// when the dashboard wrote to it is recorded as mixed, and blocks too: committing it would carry the
// other edit along.
//
// Untracked files never block and are never committed unless the dashboard created them. There are
// always a few (snapshot folders, a reading cache), and a commit made of named paths cannot pick them
// up by accident.
//
// The journal lives inside the git dir (`git rev-parse --git-path`), so it is per checkout, never
// tracked, and never inside output/ or .anki-builder/.

const JOURNAL_NAME = "anki-builder-dashboard-writes.json";
const DELETED = "<deleted>";

/**
 * The dashboard's git for the checkout containing `cwd`, or null when `cwd` is not in a git work
 * tree (a copied output folder, a test fixture). Null means the dashboard delivers without
 * committing, exactly as it did before this module existed.
 */
export async function openDashboardGit(cwd, { branch = "main", git = runGit } = {}) {
  let root;
  try {
    root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return null;
  }
  return createDashboardGit({ repoRoot: root, branch, git });
}

async function runGit(cwd, args) {
  const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

// Golden rule 6, in the code: under the test runner this may only ever touch a repo in the temp dir.
function assertScratchRepo(repoRoot) {
  if (!isTestEnv()) return;
  const tmp = resolve(tmpdir());
  const real = resolve(repoRoot);
  const privateTmp = join(sep, "private", tmp);
  if (!(real.startsWith(tmp + sep) || real.startsWith(privateTmp + sep))) {
    throw new Error(`refusing to commit in ${real} under the test runner: use a temp-dir repo`);
  }
}

export function createDashboardGit({ repoRoot, branch = "main", git = runGit }) {
  assertScratchRepo(repoRoot);
  const g = (args) => git(repoRoot, args);

  const gitPath = async (name) => {
    const p = (await g(["rev-parse", "--git-path", name])).trim();
    return isAbsolute(p) ? p : join(repoRoot, p);
  };

  // Journal writes are serialised: two dashboard requests finishing together must not lose one
  // another's records.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const next = chain.then(fn);
    chain = next.catch(() => {});
    return next;
  };

  async function loadJournal() {
    const p = await gitPath(JOURNAL_NAME);
    if (!existsSync(p)) return {};
    try {
      return JSON.parse(readFileSync(p, "utf-8"));
    } catch {
      // An unreadable journal proves nothing, so every dirty path reads as foreign and Deliver
      // refuses until the tree is committed by hand. That fails safe.
      return {};
    }
  }

  async function saveJournal(journal) {
    writeFileSync(await gitPath(JOURNAL_NAME), JSON.stringify(journal, null, 2) + "\n");
  }

  function hashFile(rel) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) return DELETED;
    return createHash("sha1").update(readFileSync(abs)).digest("hex");
  }

  /** Every dirty path (tracked or untracked, never ignored) with its current content hash. */
  async function snapshot() {
    const out = await g(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const parts = out.split("\0");
    const dirty = new Map();
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      if (entry.length < 4) continue;
      const xy = entry.slice(0, 2);
      const path = entry.slice(3);
      // A rename or copy is followed by its source path, which is dirty too (it went away).
      if (xy[0] === "R" || xy[0] === "C") {
        const from = parts[++i];
        if (from) dirty.set(from, { hash: hashFile(from), untracked: false });
      }
      dirty.set(path, { hash: hashFile(path), untracked: xy === "??" });
    }
    return dirty;
  }

  const ownedBy = (journal, path, hash) => {
    const rec = journal[path];
    return Boolean(rec && rec.hash === hash && !rec.mixed);
  };

  /**
   * Attribute a dashboard write: every path whose content changed since `before` was written by
   * the request that took `before`. Entries for paths that are clean again are dropped, so the
   * journal only ever describes the current dirty tree.
   */
  function record(before) {
    return serial(async () => {
      const after = await snapshot();
      const journal = await loadJournal();
      for (const [path, now] of after) {
        const was = before.get(path);
        if (was && was.hash === now.hash) continue;
        const foreignBefore = Boolean(was) && !ownedBy(journal, path, was.hash);
        journal[path] = { hash: now.hash, mixed: foreignBefore || Boolean(journal[path]?.mixed) };
      }
      for (const path of Object.keys(journal)) if (!after.has(path)) delete journal[path];
      await saveJournal(journal);
    });
  }

  /**
   * May the dashboard commit right now, and what? `ok` is false when the checkout is not on the
   * branch, a merge or rebase is half done, there are local commits nobody pushed, or a tracked path
   * is dirty with changes the dashboard cannot prove it made.
   */
  async function assess() {
    const reasons = [];
    const current = (await g(["symbolic-ref", "--short", "-q", "HEAD"]).catch(() => "")).trim();
    if (current !== branch) {
      reasons.push(
        current
          ? `the checkout is on branch ${current}, not ${branch}`
          : `the checkout is not on a branch (detached HEAD)`,
      );
    }
    for (const marker of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD"]) {
      if (existsSync(await gitPath(marker)))
        reasons.push(`a git operation is in progress (${marker})`);
    }
    if (current === branch) {
      const ahead = await g(["rev-list", "--count", "@{u}..HEAD"]).catch(() => null);
      if (ahead === null) reasons.push(`${branch} has no upstream to push to`);
      else if (Number(ahead.trim()) > 0) {
        reasons.push(`${branch} has ${ahead.trim()} local commit(s) that were never pushed`);
      }
    }

    const dirty = await snapshot();
    const journal = await loadJournal();
    const commitPaths = [];
    const foreign = [];
    let untrackedLeft = 0;
    for (const [path, { hash, untracked }] of dirty) {
      if (ownedBy(journal, path, hash)) commitPaths.push(path);
      else if (untracked) untrackedLeft++;
      else {
        foreign.push({
          path,
          why: journal[path]?.mixed
            ? "edited by the dashboard AND by something else"
            : "changed outside the dashboard",
        });
      }
    }
    commitPaths.sort();
    return {
      ok: reasons.length === 0 && foreign.length === 0,
      branch,
      reasons,
      foreign,
      commitPaths,
      untrackedLeft,
    };
  }

  /**
   * Commit exactly `paths` and push. A push the remote rejects because it moved on is rebased once
   * and retried; any other failure (the pre-push CI hook, no network) leaves the commit local and
   * says so.
   */
  function commitAndPush(paths, message) {
    return serial(async () => {
      await g(["add", "-A", "--", ...paths]);
      await g(["commit", "--quiet", "-m", message, "--", ...paths]);
      const sha = (await g(["rev-parse", "--short", "HEAD"])).trim();
      const journal = await loadJournal();
      for (const p of paths) delete journal[p];
      await saveJournal(journal);

      const push = () => g(["push", "--quiet"]);
      try {
        await push();
        return { committed: true, sha, paths, pushed: true };
      } catch (first) {
        const text = gitErrorText(first);
        if (!/rejected|fetch first|non-fast-forward/i.test(text)) {
          return { committed: true, sha, paths, pushed: false, pushError: tail(text) };
        }
        try {
          await g(["pull", "--rebase", "--quiet"]);
          await push();
          return { committed: true, sha, paths, pushed: true };
        } catch (second) {
          await g(["rebase", "--abort"]).catch(() => {});
          return {
            committed: true,
            sha,
            paths,
            pushed: false,
            pushError: tail(gitErrorText(second)),
          };
        }
      }
    });
  }

  return { repoRoot, snapshot, record, assess, commitAndPush };
}

function gitErrorText(error) {
  return [error.stderr, error.stdout, error.message].filter(Boolean).join("\n");
}

const tail = (text) => text.trim().split("\n").slice(-6).join("\n");

/** The refusal a person reads when Deliver is blocked. */
export function describeRefusal(gate) {
  const lines = ["Not delivered, and nothing committed."];
  for (const r of gate.reasons) lines.push(`- ${r}`);
  if (gate.foreign.length) {
    lines.push(
      "These files have uncommitted changes the dashboard did not make, so a delivery commit " +
        "would wrap up someone else's work. Commit or discard them, then deliver again:",
    );
    for (const f of gate.foreign.slice(0, 12)) lines.push(`- ${f.path} (${f.why})`);
    if (gate.foreign.length > 12) lines.push(`- and ${gate.foreign.length - 12} more`);
  }
  return lines.join("\n");
}

/** The commit message for a delivery's files. */
export function deliveryCommitMessage(paths) {
  return [
    `Dashboard: keep what Deliver to Anki shipped (${paths.length} file${paths.length === 1 ? "" : "s"})`,
    "",
    "Committed by the dashboard after a successful delivery. Only files the dashboard wrote are",
    "included.",
    "",
    ...paths.map((p) => `- ${p}`),
  ].join("\n");
}

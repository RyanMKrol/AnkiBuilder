#!/usr/bin/env node
/**
 * Runs the test suite and fails the run if it changed anything durable.
 *
 * The suite used to write into the real dedup library (a fake EPUB registry, four stub clips in the
 * audio cache) and stayed green the whole time, because nothing in this repo makes a claim about
 * WHERE a command writes. `libraryHome()`'s test-runner redirect closes that specific hole; this
 * closes the class. Any future test that reaches into `output/`, `.anki-builder/` or `anki-backups/`
 * now names itself at the end of the run instead of quietly editing the state the daily deck is
 * built from.
 *
 * Why a wrapper and not a test hook: node:test has no cross-process global hook, and `node --test`
 * runs ~75 files in separate processes. Stat-ing ~20,000 paths in each of them would be over a
 * million stat calls per run. Here it happens exactly twice, before and after, in one process.
 *
 * The manifest is (size, mtimeMs, kind) per path, not a content hash: hashing 500+ MB twice a run
 * would cost more than the whole suite. A write that preserves both size and mtime would slip
 * through, which no plausible accident does.
 *
 * Escape hatch: ANKI_BUILDER_ALLOW_DURABLE_WRITES=1, for the rare deliberate case (regenerating a
 * fixture that genuinely lives in one of these trees). It prints that it is off.
 */
import { spawnSync } from "child_process";
import { lstatSync, readdirSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

// The three trees that hold state no rerun can rebuild: the hand-reviewed decks, the dedup library
// plus paid audio cache, and the owner's Anki snapshots.
const GUARDED = ["output", ".anki-builder", "anki-backups"];

// Enough to see the pattern, not so many that the real failure scrolls away.
const MAX_REPORTED = 40;

function snapshot() {
  const manifest = new Map();

  const walk = (absolute) => {
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return; // Missing or unreadable: absence is itself recorded by the parent's entry list.
    }
    for (const entry of entries) {
      const child = join(absolute, entry.name);
      const key = relative(REPO_ROOT, child);
      if (entry.isDirectory()) {
        manifest.set(key, "dir");
        walk(child);
        continue;
      }
      try {
        // lstat, never stat: a symlink swap is a change, and following one could walk out of the
        // guarded tree entirely.
        const stats = lstatSync(child);
        manifest.set(key, `${stats.size}:${stats.mtimeMs}`);
      } catch {
        manifest.set(key, "unreadable");
      }
    }
  };

  for (const tree of GUARDED) walk(join(REPO_ROOT, tree));
  return manifest;
}

function diff(before, after) {
  const created = [];
  const modified = [];
  const deleted = [];

  for (const [path, stamp] of after) {
    if (!before.has(path)) created.push(path);
    else if (before.get(path) !== stamp) modified.push(path);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) deleted.push(path);
  }
  return { created, modified, deleted };
}

function report(label, paths) {
  if (paths.length === 0) return;
  console.error(`\n  ${label} (${paths.length}):`);
  for (const path of paths.slice(0, MAX_REPORTED)) console.error(`    ${path}`);
  if (paths.length > MAX_REPORTED) {
    console.error(`    ... and ${paths.length - MAX_REPORTED} more`);
  }
}

const disabled = Boolean(process.env.ANKI_BUILDER_ALLOW_DURABLE_WRITES);
if (disabled) {
  console.error(
    "durable-write guard: DISABLED by ANKI_BUILDER_ALLOW_DURABLE_WRITES — the suite may write into " +
      `${GUARDED.join(", ")}`,
  );
}

const before = disabled ? null : snapshot();

const suite = spawnSync(process.execPath, ["--test", ...process.argv.slice(2)], {
  cwd: REPO_ROOT,
  stdio: "inherit",
});

if (disabled) {
  process.exit(suite.status ?? 1);
}

const { created, modified, deleted } = diff(before, snapshot());
const total = created.length + modified.length + deleted.length;

if (total > 0) {
  console.error(
    `\ndurable-write guard: FAIL — the test suite changed ${total} path(s) under ` +
      `${GUARDED.join(", ")}. These trees hold hand-reviewed decks, the dedup library and the ` +
      `owner's Anki backups; a test must write to a tmpdir instead.`,
  );
  report("created", created);
  report("modified", modified);
  report("deleted", deleted);
  console.error(
    "\n  Fix the test (inject a scratch dir, or resolve through libraryHome(), which already " +
      "redirects under the runner). Do not silence this by restoring the files by hand.",
  );
  process.exit(1);
}

process.exit(suite.status ?? 1);

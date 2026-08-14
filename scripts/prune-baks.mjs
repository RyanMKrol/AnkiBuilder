#!/usr/bin/env node
// Ages out the `.bak` restore points the mutating scripts leave behind.
//
// Backups are now STAMPED (<file>.pre-<reason>-<YYYYMMDDHHmm>.bak), so every run of a tool keeps its
// own restore point instead of the first run's snapshot standing in for all of them. That is the
// right trade, but it means they accumulate: there are already ~330 of them, about 10 MB, from the
// unstamped era alone. This keeps the newest N per unit directory and deletes the rest.
//
// Per UNIT, not per file: the useful question is "how far back can I roll this lesson", and cards.json
// and corpus.json are written in lockstep, so keeping 5 means 5 recent points for the unit as a whole.
//
// Usage:
//   node scripts/prune-baks.mjs [<dir> ...]              report what would be deleted (default: output/)
//   node scripts/prune-baks.mjs --apply                  actually delete
//   ... --keep <n>                                       how many to keep per unit (default 5)
import { readdirSync, statSync, unlinkSync } from "fs";
import { join, relative, resolve } from "path";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const keepAt = args.indexOf("--keep");
const keep = keepAt === -1 ? 5 : Number(args[keepAt + 1]);
if (!Number.isInteger(keep) || keep < 0) {
  console.error("--keep needs a non-negative integer");
  process.exit(1);
}
const dirs = args.filter((a, i) => !a.startsWith("--") && i !== keepAt + 1);
const roots = (dirs.length > 0 ? dirs : ["output"]).map((d) => resolve(d));

// dir -> [{ path, mtimeMs }]
const byDir = new Map();

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (entry.name.endsWith(".bak")) {
      byDir.set(dir, [...(byDir.get(dir) || []), { path, mtimeMs: statSync(path).mtimeMs }]);
    }
  }
}

for (const root of roots) walk(root);

let kept = 0;
let removed = 0;
let bytes = 0;

/** `cards.json.pre-jumble-202608141947.bak` -> `cards.json`, so a unit's two files are told apart. */
function baseFile(path) {
  return path.replace(/\.pre-.*\.bak$/, "").replace(/\.bak$/, "");
}

for (const [dir, baks] of [...byDir].sort()) {
  // Newest first, so the survivors are the most recent restore points.
  baks.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Floor: whatever the budget says, never leave a file with no restore point at all. cards.json and
  // corpus.json are written in lockstep, so a naive "newest N in this directory" can otherwise keep
  // N corpus backups and zero cards backups, which is the one outcome pruning must not produce.
  const newestPerFile = new Set();
  for (const bak of baks) {
    const base = baseFile(bak.path);
    if (![...newestPerFile].some((p) => baseFile(p) === base)) newestPerFile.add(bak.path);
  }

  const doomed = baks.slice(keep).filter((bak) => !newestPerFile.has(bak.path));
  kept += baks.length - doomed.length;
  if (doomed.length === 0) continue;

  console.log(`${relative(process.cwd(), dir)} — keeping ${baks.length - doomed.length}:`);
  for (const { path } of doomed) {
    bytes += statSync(path).size;
    removed++;
    console.log(`  ${apply ? "deleted" : "would delete"} ${relative(process.cwd(), path)}`);
    if (apply) unlinkSync(path);
  }
}

console.log(
  `\n${apply ? "deleted" : "would delete"} ${removed} backup(s) (${(bytes / 1048576).toFixed(1)} MB), ` +
    `kept ${kept}` +
    (apply ? "" : "\n\nNothing was deleted. Re-run with --apply to do it."),
);

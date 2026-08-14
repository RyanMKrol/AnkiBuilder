#!/usr/bin/env node
// Pulls a finished unit back out of the shipping package: back up cards.json, clear meta.done,
// rebuild the collection.
//
// This is the reverse of the dashboard's Mark done, which has no button (see LIMITATIONS,
// "No un-done control in the dashboard"). It was a hand edit of a live unit's JSON; this is the
// same operation with a backup, schema validation and the rebuild that has to follow it.
//
// Usage:
//   node scripts/undone-unit.mjs <run-dir>            back up, clear meta.done, rebuild
//   ... --force-delivered                             required when the collection is DELIVERED
//   ... --no-rebuild                                  clear the flag only (you rebuild later)
//
// The delivered consent used to be spelled `--force`. It is its own flag now, everywhere: `--force`
// across these tools means "yes, touch a signed-off unit" (which un-doning always does, so this tool
// never asks), and `--force-delivered` means "yes, the cards are live in Anki". See src/audit/state.js.
//
// ⚠️ It never touches Anki. Cards already delivered stay in the live collection with their
// scheduling; clearing `done` only removes the unit from the NEXT package build. Removing delivered
// notes is a separate human decision — which is exactly why the delivered case has its own flag.
import { existsSync } from "fs";
import { join, resolve } from "path";
import { undoneUnit } from "../src/review/undoneUnit.js";
import { packageDirForUnit } from "../src/review/gateState.js";
import { assertMutationAllowed, MutationRefused } from "../src/audit/state.js";
import { rebuildBookDir, rebuildRunDir } from "../src/deck/rebuild.js";
import { loadBookMeta } from "../src/corpus/epubLibrary.js";
import { loadCourseMeta } from "../src/cli/outputPaths.js";

const args = process.argv.slice(2);
const forceDelivered = args.includes("--force-delivered");
const rebuild = !args.includes("--no-rebuild");
const positional = args.filter((a) => !a.startsWith("--"));
const runDir = resolve(positional[0] || "");

if (!positional[0] || !existsSync(join(runDir, "cards.json"))) {
  console.error("usage: undone-unit.mjs <run-dir> [--force-delivered] [--no-rebuild]");
  process.exit(1);
}

// A bare `--force` is refused rather than ignored: it used to BE the delivered consent here, so
// silently accepting it would let an old invocation edit a live collection while believing it had
// asked for permission.
if (args.includes("--force")) {
  console.error(
    "--force no longer grants the delivered consent here — it is --force-delivered now (the two " +
      "consents are separate across all these tools). Re-run with --force-delivered if that is what " +
      "you mean.",
  );
  process.exit(1);
}

const collectionDir = packageDirForUnit(runDir);

// The state module decides this now, not a hand-rolled existsSync: `done` is a claim about the
// package and `delivered` is a claim about a collection somebody studies daily, and they earn
// separate consents. This script is the one that already knew that; the rule is shared now.
try {
  assertMutationAllowed(runDir, { force: true, forceDelivered, action: "un-done" });
} catch (e) {
  if (!(e instanceof MutationRefused)) throw e;
  console.error(e.message);
  process.exit(1);
}

const result = undoneUnit(runDir);
if (!result.changed) {
  console.log(`${result.reason} — nothing to do`);
  process.exit(0);
}
console.log(`backed up  ${result.backupPath}`);
console.log(`cleared    meta.done in ${result.cardsPath}`);

if (!rebuild) {
  console.log(
    `NOT rebuilt (--no-rebuild): run "anki-builder deck --book-dir ${collectionDir}" yourself`,
  );
  process.exit(0);
}

// The package still contains this unit until it is rebuilt, so the rebuild is part of the
// operation, not a follow-up someone might forget. A template/one-off unit IS its own package's
// home, so it rebuilds that one deck instead of a collection merge.
try {
  if (collectionDir === runDir) {
    const built = rebuildRunDir(runDir);
    console.log(`rebuilt    ${built.noteCount} note(s)`);
  } else {
    const built = await rebuildBookDir(collectionDir, { loadBookMeta, loadCourseMeta });
    console.log(`rebuilt    ${built.noteCount} note(s) across ${built.chapterCount} unit(s)`);
  }
} catch (e) {
  console.error(`rebuild FAILED: ${e.message}`);
  console.error("the flag is cleared; fix the cause and re-run `anki-builder deck --book-dir`");
  process.exit(2);
}

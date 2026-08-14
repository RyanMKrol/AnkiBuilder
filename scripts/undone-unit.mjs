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
//   ... --force                                       required when the collection is delivered
//   ... --no-rebuild                                  clear the flag only (you rebuild later)
//
// ⚠️ It never touches Anki. Cards already delivered stay in the live collection with their
// scheduling; clearing `done` only removes the unit from the NEXT package build. Removing delivered
// notes is a separate human decision.
import { existsSync } from "fs";
import { basename, join, resolve } from "path";
import { undoneUnit } from "../src/review/undoneUnit.js";
import { packageDirForUnit } from "../src/review/gateState.js";
import { rebuildBookDir, rebuildRunDir } from "../src/deck/rebuild.js";
import { loadBookMeta } from "../src/corpus/epubLibrary.js";
import { loadCourseMeta } from "../src/cli/outputPaths.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const rebuild = !args.includes("--no-rebuild");
const positional = args.filter((a) => !a.startsWith("--"));
const runDir = resolve(positional[0] || "");

if (!positional[0] || !existsSync(join(runDir, "cards.json"))) {
  console.error("usage: undone-unit.mjs <run-dir> [--force] [--no-rebuild]");
  process.exit(1);
}

const collectionDir = packageDirForUnit(runDir);

// A delivered collection is the case the red line is about: its cards are in a deck being studied
// daily. Un-shipping a unit there is legitimate, but it must be a decision, not a reflex.
if (existsSync(join(collectionDir, "anki-delivered.json")) && !force) {
  console.error(
    `${basename(collectionDir)} has already been delivered to Anki. Clearing "done" removes this ` +
      `unit from the package but NOT from the live collection — those notes stay, with their ` +
      `scheduling. Re-run with --force if that is what you want.`,
  );
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

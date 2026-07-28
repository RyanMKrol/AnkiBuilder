#!/usr/bin/env node
// One-off: rename every `deck.apkg` already on disk to the convention in src/deck/deckFileName.js.
//
// Packages built before that convention are all called `deck.apkg`, which is exactly the problem —
// indistinguishable once they leave their folder. New builds name themselves; this brings existing
// ones up to the same standard so you don't have a mix.
//
// Purely a rename. Nothing is rebuilt, no package is opened, and the Anki deck names INSIDE each
// package are untouched — importing a renamed file updates the same decks it always did, so
// scheduling is unaffected.
//
// Dry by default; `--apply` renames.
//
// Usage: node scripts/rename-deck-packages.mjs [--apply] [--output-root <dir>]

import { readdirSync, statSync, existsSync, renameSync } from "fs";
import { join } from "path";
import { deckFileNameForDir, LEGACY_DECK_FILENAME } from "../src/deck/deckFileName.js";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const rootFlag = argv.indexOf("--output-root");
const outputRoot = rootFlag === -1 ? "output" : argv[rootFlag + 1];

if (!existsSync(outputRoot)) {
  console.error(`no such directory: ${outputRoot}`);
  process.exit(1);
}

/** Every directory under `dir` that holds a legacy `deck.apkg`, depth-first. */
function findLegacyPackages(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  if (entries.some((e) => e.isFile() && e.name === LEGACY_DECK_FILENAME)) found.push(dir);
  for (const entry of entries) {
    if (entry.isDirectory()) findLegacyPackages(join(dir, entry.name), found);
  }
  return found;
}

const dirs = findLegacyPackages(outputRoot);
if (dirs.length === 0) {
  console.log(`no ${LEGACY_DECK_FILENAME} found under ${outputRoot} — nothing to do.`);
  process.exit(0);
}

let renamed = 0;
let skipped = 0;
for (const dir of dirs) {
  const from = join(dir, LEGACY_DECK_FILENAME);
  const name = deckFileNameForDir(dir);
  const to = join(dir, name);

  if (existsSync(to)) {
    console.error(`! ${dir}: ${name} already exists — left ${LEGACY_DECK_FILENAME} alone`);
    skipped++;
    continue;
  }

  const size = (statSync(from).size / 1024 / 1024).toFixed(1);
  console.log(
    `${apply ? "✓" : "would rename"} ${dir}/${LEGACY_DECK_FILENAME} → ${name}  (${size} MB)`,
  );
  if (apply) renameSync(from, to);
  renamed++;
}

console.log(
  `\n${apply ? "Renamed" : "Would rename"} ${renamed} package(s)${skipped ? `, skipped ${skipped}` : ""}.`,
);
if (!apply) console.log("Nothing was written. Re-run with --apply to do it.");

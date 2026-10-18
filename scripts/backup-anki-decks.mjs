#!/usr/bin/env node
// Back up every managed Anki deck now, without delivering anything. Use it before a change you
// might want to undo, such as a card fix pass. It writes the same snapshot a delivery writes before
// it touches Anki (one .apkg per deck WITH scheduling, models.json, manifest.json), so
// restore-anki-backup.mjs restores it the same way.
//
// Usage:
//   node scripts/backup-anki-decks.mjs [--label <text>] [--backup-root <dir>] [--allow-test-profile]
//     --label <text>        appended to the snapshot folder name, e.g. --label pre-qa-fix gives
//                           anki-backups/2026-10-18T21-30-00-000Z-pre-qa-fix. A labelled snapshot is
//                           never pruned by a later delivery.
//     --backup-root <dir>   where to write it (default: $ANKI_BUILDER_BACKUP_ROOT, else anki-backups)
//     --allow-test-profile  back up even when Anki is open on a probe profile ("Testing" or
//                           "Claude Test Profile"). Without it that is refused, because a backup of
//                           scratch decks looks like success and protects nothing.
//
// The decks come from each book's and course's anki-delivered.json (`ankiParent`). Retired and
// never-delivered collections are skipped. Unlike a delivery, this never prunes old snapshots and
// never syncs with AnkiWeb. Anki must be open with the AnkiConnect add-on.
import { readFileSync, statSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";
import { backupAllManagedDecks } from "../src/anki/deliver.js";

const args = process.argv.slice(2);

// The usage is the comment block at the top of this file, so the two cannot drift.
const usage = () => {
  const lines = readFileSync(fileURLToPath(import.meta.url), "utf-8")
    .split("\n")
    .slice(1);
  const end = lines.findIndex((l) => !l.startsWith("//"));
  return lines
    .slice(0, end)
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n");
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

// An unknown flag is refused, never ignored (same rule as deliver-to-anki.mjs).
const VALUE_FLAGS = new Set(["--label", "--backup-root"]);
const BOOL_FLAGS = new Set(["--allow-test-profile"]);
const values = {};
let allowTestProfile = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    const v = args[i + 1];
    if (v == null || v.startsWith("--")) {
      console.error(`${a} needs a value. Nothing was done. See --help.`);
      process.exit(1);
    }
    values[a] = v;
    i++;
  } else if (BOOL_FLAGS.has(a)) {
    allowTestProfile = true;
  } else {
    console.error(`unknown argument "${a}". Nothing was done. See --help.`);
    process.exit(1);
  }
}

const outputRoot = process.env.ANKI_BUILDER_OUTPUT_ROOT || "output";
const backupRoot = resolve(
  values["--backup-root"] || process.env.ANKI_BUILDER_BACKUP_ROOT || "anki-backups",
);

let result;
try {
  result = await backupAllManagedDecks(outputRoot, {
    client: createAnkiConnect(),
    backupRoot,
    label: values["--label"] ?? null,
    allowTestProfile,
    log: (m) => console.error(`  ${m}`),
  });
} catch (e) {
  console.error(`\nbackup failed: ${e.message}`);
  process.exit(1);
}

const mb = (path) => {
  try {
    return `${(statSync(path).size / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return "missing";
  }
};
console.log(`\nAnki profile: ${result.profile}`);
console.log(`snapshot: ${result.backupDir}`);
for (const { deck, path } of result.backedUp) console.log(`  ${deck}  ${mb(path)}`);
console.log(`note types: ${result.modelNames.join(", ") || "none"}`);
for (const s of result.skipped) console.log(`  skipped ${s.type}:${s.id} (${s.reason})`);
console.log(`\nrestore with: node scripts/restore-anki-backup.mjs --list`);

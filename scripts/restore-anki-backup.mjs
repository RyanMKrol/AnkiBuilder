#!/usr/bin/env node
// Restore deck(s) into a running Anki from an anki-backups/<stamp>/ snapshot (written by
// deliver-to-anki.mjs before every real delivery, WITH scheduling).
//
// A restore must DELETE the live deck first, then import the backup .apkg. Importing over a live
// deck does NOT overwrite existing notes' scheduling or content — it looks like it worked and
// restores nothing. That non-obvious two-step is exactly why this script exists.
//
// Usage:
//   node scripts/restore-anki-backup.mjs --list
//       show every snapshot and the decks inside it, newest first
//   node scripts/restore-anki-backup.mjs <stamp> [deckName ...]
//       preview the restore plan for a snapshot (all its decks, or just the named ones)
//   node scripts/restore-anki-backup.mjs <stamp> [deckName ...] --yes
//       actually restore: delete each live deck (cards too), then import its backup .apkg
//
// Anki must be open with the AnkiConnect add-on. After a restore, do NOT sync blindly: if the bad
// state already reached AnkiWeb, choose "Upload to AnkiWeb" so the restored local copy wins.
import { readdirSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";

const backupRoot = resolve(process.env.ANKI_BUILDER_BACKUP_ROOT || "anki-backups");
const args = process.argv.slice(2);
const yes = args.includes("--yes");
const positional = args.filter((a) => !a.startsWith("--"));

function snapshots() {
  let entries;
  try {
    entries = readdirSync(backupRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
}

// The manifest records each .apkg's REAL deck name (filenames are sanitized and can't be trusted
// to round-trip). Snapshots from before the manifest existed fall back to filename-derived names,
// which is why the plan is always printed before anything runs.
function snapshotDecks(stamp) {
  const dir = join(backupRoot, stamp);
  const manifestPath = join(dir, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      return JSON.parse(readFileSync(manifestPath, "utf-8")).decks.map((d) => ({
        deck: d.deck,
        path: d.path,
      }));
    } catch {
      // fall through to the filename scan
    }
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".apkg"))
    .map((f) => ({ deck: f.replace(/\.apkg$/, ""), path: join(dir, f), fromFilename: true }));
}

if (args.includes("--list")) {
  const stamps = snapshots();
  if (stamps.length === 0) {
    console.log(`no snapshots under ${backupRoot}`);
    process.exit(0);
  }
  for (const stamp of stamps) {
    console.log(stamp);
    for (const { deck } of snapshotDecks(stamp)) console.log(`  ${deck}`);
  }
  process.exit(0);
}

const stamp = positional[0];
if (!stamp) {
  console.error("usage: restore-anki-backup.mjs --list | <stamp> [deckName ...] [--yes]");
  process.exit(1);
}
if (!existsSync(join(backupRoot, stamp))) {
  console.error(`no snapshot ${JSON.stringify(stamp)} under ${backupRoot} (try --list)`);
  process.exit(1);
}

const wanted = positional.slice(1);
let plan = snapshotDecks(stamp);
if (wanted.length > 0) {
  plan = plan.filter((d) => wanted.includes(d.deck));
  const missing = wanted.filter((name) => !plan.some((d) => d.deck === name));
  if (missing.length > 0) {
    console.error(`not in this snapshot: ${missing.join(", ")}`);
    process.exit(1);
  }
}
if (plan.length === 0) {
  console.error("nothing to restore in this snapshot");
  process.exit(1);
}

console.log(`restore plan from ${stamp}:`);
for (const d of plan) {
  console.log(`  DELETE live deck "${d.deck}" (cards too), then import ${d.path}`);
  if (d.fromFilename) {
    console.log(
      `    ⚠ pre-manifest snapshot: deck name derived from the filename — verify it matches the live deck exactly`,
    );
  }
}
if (!yes) {
  console.log(
    "\npreview only — re-run with --yes to restore. This DELETES the live deck(s) first.",
  );
  process.exit(0);
}

const client = createAnkiConnect();
for (const d of plan) {
  if (!existsSync(d.path)) {
    console.error(`backup file missing: ${d.path} — aborting before touching "${d.deck}"`);
    process.exit(1);
  }
  console.log(`deleting live deck "${d.deck}"…`);
  await client.invoke("deleteDecks", { decks: [d.deck], cardsToo: true });
  console.log(`importing ${d.path}…`);
  await client.invoke("importPackage", { path: d.path });
  console.log(`✓ restored "${d.deck}"`);
}
console.log(
  '\ndone. If the bad state had already synced to AnkiWeb, sync now and choose "Upload to AnkiWeb" so this restored copy wins.',
);

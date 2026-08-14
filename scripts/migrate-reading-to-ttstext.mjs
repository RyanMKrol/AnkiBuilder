#!/usr/bin/env node
//
// SPENT: 2026-08-14 — a one-off MIGRATION, not a standing tool.
// The reading -> ttsText rename ran once over every cards.json, corpus.json and dedup-library
// corpus. It is kept for the record, and because re-reading
// what a migration actually did is the only way to understand the shape of the data it left
// behind. Do not run it as part of any procedure: it is not in SKILL.md's per-chapter flow, and
// it will re-apply a decision that has already been made and reviewed.
//
// One-shot migration: rename every item's `reading` key to `ttsText` in the durable JSON.
//
// The field was renamed so its name states its contract: `ttsText` is the text TTS speaks instead of
// the target whenever the written target would be misread (numerals AND kanji-bearing targets), and
// it is never rendered on any card face. `reading` read like a display field, which is how it ended
// up populated by one pass and rendered by no template.
//
// This is PURELY MECHANICAL. It renames a key and touches no value. It never adds, drops or reorders
// an item, and it leaves a file with no `reading` key byte-identical (it is not rewritten at all).
//
// Three file families are covered, because all three are read by code that now expects `ttsText`:
//   1. output/**/cards.json + corpus.json  — the reviewed units
//   2. .anki-builder/epubs/*/corpora/*.json — the dedup-library copies saved at review time
//   3. anything else named cards.json / corpus.json under the roots given
//
// The units go through writeUnitJson (atomic write + stamped backup + schema validate before AND
// after), so a malformed rewrite cannot reach disk. The dedup corpora carry a `meta.done` the corpus
// schema does not allow, so they are not schema-checked; they get the same atomic write and backup,
// plus a re-read and a key check.
//
// Usage:
//   node scripts/migrate-reading-to-ttstext.mjs            # dry run: report what would change
//   node scripts/migrate-reading-to-ttstext.mjs --apply
//   node scripts/migrate-reading-to-ttstext.mjs --apply output .anki-builder
import { readdirSync, existsSync, readFileSync, statSync } from "fs";
import { join, resolve, basename } from "path";
import { writeUnitJson } from "../src/util/unitWrite.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const roots = args.filter((a) => !a.startsWith("--"));
const ROOTS = (roots.length ? roots : ["output", ".anki-builder"]).map((r) => resolve(r));

const MIGRATED_NAMES = new Set(["cards.json", "corpus.json"]);

// Every JSON file that could hold items: the unit files by name, plus the dedup library's
// corpora/<n>.json, which are numbered rather than named and so cannot be matched by filename alone.
function* candidateFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* candidateFiles(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    if (MIGRATED_NAMES.has(entry.name) || basename(dir) === "corpora") yield path;
  }
}

/** Rename the key in place, preserving each item's key ORDER by rebuilding the object. */
function migrate(data) {
  let renamed = 0;
  if (!data || !Array.isArray(data.items)) return { data, renamed };
  data.items = data.items.map((item) => {
    if (!item || typeof item !== "object" || !("reading" in item)) return item;
    renamed++;
    const out = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === "reading") out.ttsText = value;
      else out[key] = value;
    }
    return out;
  });
  return { data, renamed };
}

let filesChanged = 0;
let itemsRenamed = 0;
const failures = [];

for (const root of ROOTS) {
  for (const path of candidateFiles(root)) {
    if (!statSync(path).isFile()) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(path, "utf-8"));
    } catch (error) {
      failures.push(`${path}: unreadable (${error.message})`);
      continue;
    }
    const { data: migrated, renamed } = migrate(data);
    if (renamed === 0) continue;

    filesChanged++;
    itemsRenamed += renamed;
    console.log(`${apply ? "migrating" : "would migrate"}  ${path}  (${renamed} item(s))`);
    if (!apply) continue;

    try {
      writeUnitJson(path, migrated, { reason: "ttstext-rename" });
      const after = JSON.parse(readFileSync(path, "utf-8"));
      const leftover = (after.items || []).filter((i) => i && "reading" in i).length;
      if (leftover > 0) failures.push(`${path}: ${leftover} item(s) still carry "reading"`);
    } catch (error) {
      failures.push(`${path}: write failed (${error.message})`);
    }
  }
}

for (const failure of failures) console.error(`FAILED  ${failure}`);
console.log(
  `\n${filesChanged} file(s), ${itemsRenamed} item(s) ${apply ? "migrated" : "to migrate"}` +
    (apply ? `, ${failures.length} failure(s)` : " — re-run with --apply to write"),
);
process.exit(failures.length ? 1 : 0);

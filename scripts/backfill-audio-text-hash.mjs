#!/usr/bin/env node
//
// SPENT: 2026-08-14 — a one-off MIGRATION, not a standing tool.
// It ran once over every cards.json to recover a text hash for the 2,143 clips that already existed
// when `audioTextHash` was introduced. Every path that installs audio stamps the hash itself from
// here on, so there is nothing left for a second run to find.
// Do not run it as part of any procedure: it is not in SKILL.md's per-chapter flow. It is kept for
// the record, and because re-reading what a migration did is the only way to understand the data it
// left behind.
//
// One-way backfill of `audioTextHash` onto cards that already have audio.
//
// WHY THIS EXISTS. The audio stage stamps the hash on every clip it generates from now on, which
// covers nothing that is already on disk — and the ~200 hand-picked, hand-trimmed and uploaded clips
// are exactly the population the staleness check has always exempted. Their filenames already say
// what text they were made from (`<hash(text)>.orig.mp3`, `<hash(text)>-gen-<bytes>.mp3`, …), so the
// record can be recovered without a single API call. See src/audio/textHash.js.
//
// WHAT IT WILL NEVER DO. It does not stamp a hash computed from a card's CURRENT text. That would
// declare every drifted clip correct in one pass and permanently destroy the signal. A take whose
// name carries no hash — a Replace upload, the hand-named legacy clips — is left alone and counted
// as unverifiable, which is the honest answer.
//
// It also never overwrites an existing `audioTextHash`, so re-running it is a no-op, and a human's
// "keep this clip" acceptance can never be reverted by a later sweep.
//
// Usage:
//   node scripts/backfill-audio-text-hash.mjs                 # report only (default)
//   node scripts/backfill-audio-text-hash.mjs --apply         # write it
//   node scripts/backfill-audio-text-hash.mjs --apply output  # a different output root
import { scanWorkspace, listUnitDirs, loadUnit } from "../src/audit/units.js";
import { deriveAudioTextHash } from "../src/audio/textHash.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const outputRoot = args.find((a) => !a.startsWith("--")) || "output";

if (args.includes("--help")) {
  console.log(
    [
      "usage: backfill-audio-text-hash.mjs [--apply] [output-root]",
      "  Records what text each existing clip was generated from, read off its filename.",
      "  Reports without --apply. Never overwrites a hash, never derives one from card text.",
    ].join("\n"),
  );
  process.exit(0);
}

const scan = scanWorkspace(outputRoot);
if (scan.missing || scan.collections.length === 0) {
  console.log(`(no collections found under ${scan.root})`);
  process.exit(0);
}

const totals = { audioBearing: 0, alreadyStamped: 0, stamped: 0, unverifiable: 0 };
const unverifiable = [];

for (const collection of scan.collections) {
  let collectionStamped = 0;
  for (const unitDir of listUnitDirs(collection)) {
    const unit = loadUnit(unitDir);
    const entry = unit.files["cards.json"];
    if (!entry?.present || entry.error) continue;
    const data = entry.data;

    let touched = 0;
    for (const item of data.items || []) {
      if (!item.audio) continue;
      totals.audioBearing++;
      if (item.audioTextHash) {
        totals.alreadyStamped++;
        continue;
      }
      const derived = deriveAudioTextHash(item);
      if (!derived) {
        totals.unverifiable++;
        unverifiable.push(`${collection.label}/${unit.name}/${item.id}`);
        continue;
      }
      item.audioTextHash = derived.hash;
      totals.stamped++;
      touched++;
    }

    if (touched && apply) {
      writeUnitJson(entry.path, data, { reason: "audio-text-hash-backfill" });
    }
    if (touched) collectionStamped += touched;
  }
  if (collectionStamped) console.log(`${collection.label}: ${collectionStamped} card(s)`);
}

console.log(
  [
    "",
    `${totals.audioBearing} audio-bearing card(s) under ${scan.root}`,
    `  ${totals.alreadyStamped} already carried a text hash`,
    `  ${totals.stamped} ${apply ? "stamped" : "would be stamped"} from the take's filename`,
    `  ${totals.unverifiable} unverifiable — the take's name carries no text hash`,
  ].join("\n"),
);
if (unverifiable.length) {
  console.log("\nunverifiable:\n" + unverifiable.map((line) => `  ${line}`).join("\n"));
}
if (!apply && totals.stamped) console.log("\n(nothing written — re-run with --apply)");

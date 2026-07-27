#!/usr/bin/env node
// One-off: apply background-noise cleanup to every card already on disk.
//
// ElevenLabs clips carry low-frequency rumble under the voice — measured on this project's own decks,
// the noise floor in a clip's silence sits around -37 to -51 dBFS where clean audio is below -70, and
// ~94% of that energy is below 80 Hz. New audio gets cleaned automatically (see
// src/audio/cleanupFilter.js); this brings existing cards up to the same standard.
//
// Entirely LOCAL — ffmpeg only, no ElevenLabs calls, no credits, and the voice takes you already
// approved are not re-rolled. Only the processing applied to them changes.
//
// Two kinds of card, handled differently:
//
//   * has `audioOriginal` — the untouched take is on disk, so `audioAuto` is simply re-derived as
//     clean-then-trim of it. Any hand trim is re-cut from the same original under the same chain, so
//     the reviewer's edit survives.
//   * no `audioOriginal` (a `-gen-` variant that was auditioned and picked, or a Replace upload from
//     before originals were kept) — there is no full-length take to work from, so its CURRENT clip is
//     cleaned and the pre-clean file becomes its `audioOriginal`. That clip has already been trimmed
//     once, so cleaning is all that is applied; trimming it again could eat the final sound.
//
// Dry by default; `--apply` writes.
//
// Usage: node scripts/clean-audio.mjs [--apply] [--filter <name>] [--run <dir>]
//   --apply         actually write (default reports what would change)
//   --filter <name> cleanup chain: standard (default) | gentle | aggressive
//   --run <dir>     limit to one run dir (repeatable); default is every lesson under output/

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { autoTrim } from "../src/audio/trimSilence.js";
import { trimToRange } from "../src/audio/trimToRange.js";
import { cleanupChain, isCleanupName, DEFAULT_CLEANUP } from "../src/audio/cleanupFilter.js";
import { deriveCardAudio } from "../src/audio/index.js";
import { validateCards } from "../src/model/index.js";
import { writeFileAtomic } from "../src/util/atomicWrite.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pick = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const filter = pick("--filter") || DEFAULT_CLEANUP;
if (!isCleanupName(filter)) {
  console.error(`unknown --filter ${JSON.stringify(filter)}`);
  process.exit(1);
}
const explicit = args.reduce((acc, a, i) => (args[i - 1] === "--run" ? [...acc, a] : acc), []);

function findRunDirs(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (existsSync(join(p, "cards.json"))) out.push(p);
    else findRunDirs(p, out);
  }
  return out;
}

const runDirs = explicit.length ? explicit : existsSync("output") ? findRunDirs("output") : [];
if (runDirs.length === 0) {
  console.error("no lessons found — run from the repo root, or pass --run <dir>");
  process.exit(1);
}

const sha8 = (b) => createHash("sha1").update(b).digest("hex").slice(0, 8);

// Apply a filter chain and re-encode, with no trimming at all. Matches the encoder settings used
// everywhere else (libmp3lame -q:a 2) so a cleaned clip doesn't quietly change quality.
function cleanOnly(bytes, chain) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-clean-"));
  try {
    const inPath = join(dir, "in.mp3");
    const outPath = join(dir, "out.mp3");
    writeFileSync(inPath, bytes);
    const r = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-i",
        inPath,
        "-af",
        chain,
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        outPath,
      ],
      { encoding: "utf-8" },
    );
    if (r.error || r.status !== 0 || !existsSync(outPath)) {
      throw new Error(`ffmpeg could not clean the clip${r.status ? ` (exit ${r.status})` : ""}`);
    }
    return readFileSync(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
let lessons = 0,
  fromOriginal = 0,
  fromCurrent = 0,
  retrimmed = 0,
  skipped = 0,
  failed = 0;

for (const dir of runDirs) {
  const cardsPath = join(dir, "cards.json");
  const data = JSON.parse(readFileSync(cardsPath, "utf-8"));
  const audioDir = join(dir, "audio");
  let changed = 0;

  for (const item of data.items || []) {
    if (item.excluded || !item.audio) continue;
    if (item.audioFilter === filter) {
      skipped++;
      continue;
    }

    // Prefer the untouched original; fall back to whatever the card currently ships.
    const source = item.audioOriginal || item.audio;
    const sourcePath = join(audioDir, source);
    if (!existsSync(sourcePath)) {
      console.error(`! ${dir} ${item.id}: ${source} missing — skipped`);
      failed++;
      continue;
    }
    const hasOriginal = !!item.audioOriginal;
    const raw = readFileSync(sourcePath);

    if (apply) {
      try {
        // A card with no original points at a clip that was ALREADY trimmed once. Trimming it again
        // would cut into a tail the first pass deliberately kept — the same compounding this project
        // avoids everywhere else — so those get cleaning only.
        const { auto } = hasOriginal
          ? await autoTrim(raw, { cleanup: filter })
          : { auto: cleanOnly(raw, cleanupChain(filter)) };

        const stem = source.replace(/\.orig\.[A-Za-z0-9]+$/, "").replace(/\.[A-Za-z0-9]+$/, "");
        const audioAuto = `${stem}.${filter}.mp3`;
        mkdirSync(audioDir, { recursive: true });
        writeFileAtomic(join(audioDir, audioAuto), auto);

        // The pre-clean clip becomes the original for a card that never had one, so the review can
        // still play "before" and a hand trim still has something to cut from.
        if (!hasOriginal) item.audioOriginal = source;
        item.audioAuto = audioAuto;
        item.audioFilter = filter;

        // A hand cut describes a range of the ORIGINAL, so it survives a change of cleanup — re-cut it
        // under the new chain rather than dropping the reviewer's edit.
        if (item.audioManual && item.audioTrim && Number.isFinite(item.audioTrim.start)) {
          const cut = trimToRange(raw, item.audioTrim.start, item.audioTrim.end, {
            cleanup: cleanupChain(filter),
          });
          const name = `${String(item.id).replace(/[^A-Za-z0-9._-]/g, "_")}-manual-${sha8(cut)}.mp3`;
          writeFileAtomic(join(audioDir, name), cut);
          item.audioManual = name;
          retrimmed++;
        }

        const derived = deriveCardAudio(item);
        if (derived) item.audio = derived;
      } catch (e) {
        console.error(`! ${dir} ${item.id}: ${e.message}`);
        failed++;
        continue;
      }
    }

    hasOriginal ? fromOriginal++ : fromCurrent++;
    changed++;
  }

  if (changed > 0) {
    lessons++;
    if (apply) {
      validateCards(data);
      writeFileAtomic(cardsPath, JSON.stringify(data, null, 2));
    }
    console.log(`${apply ? "✓" : "would clean"} ${dir}: ${changed} card(s)`);
  }
}

console.log(
  `\n${apply ? "Cleaned" : "Would clean"} ${fromOriginal + fromCurrent} card(s) across ${lessons} lesson(s) with "${filter}".\n` +
    `  ${fromOriginal} re-derived from their untouched original (cleaned, then re-trimmed).\n` +
    `  ${fromCurrent} had no original — their current clip was cleaned and kept as the "before".\n` +
    `  ${retrimmed} hand trim(s) re-cut under the new chain.\n` +
    `  ${skipped} already on this chain.` +
    (failed ? `\n  ${failed} FAILED — see above.` : "") +
    (apply ? "" : "\n\nNothing was written. Re-run with --apply to do it."),
);

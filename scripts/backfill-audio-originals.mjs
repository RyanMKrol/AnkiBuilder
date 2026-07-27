#!/usr/bin/env node
// One-off: give already-built cards the untouched `audioOriginal` they were never stored with.
//
// The trailing-silence trim used to run inside the ElevenLabs fetch, so the raw take was discarded
// before it reached disk. Every clip built before that changed exists only in its trimmed form, which
// means the review's Original column has nothing to show and a hand trim can only ever cut further in.
// The bytes are gone, so the only way to get an original is to synthesize the term again.
//
// Why this isn't just "clear the cache and re-run `audio`":
//   1. `alreadyDone` checks the RUN DIR, not the cache. Every clip is still sitting there, so the stage
//      reports "already generated — reusing" and does nothing at all.
//   2. The stage's copy loop is `if (!existsSync(dest))`. Forced past (1), it would leave the run dir's
//      OLD trimmed clip in place while adding a NEW `.orig.mp3` from a different generation — a pair
//      that doesn't match, so the Original column would play a different recording than In use. Worse
//      than having no original.
// This writes both files together, overwriting, so a card's two takes always come from one recording.
//
// SKIPS any card whose clip is a deliberate human choice — a `-gen-` variant that was auditioned and
// picked, or a Replace upload. Regenerating those would throw away the reviewer's work; they get a real
// original the next time they're re-generated or replaced from the dashboard.
//
// Costs one ElevenLabs call per unique spoken term (shared across lessons via the cache), and because
// the voice is non-deterministic the new takes WILL sound different from the ones already signed off.
// Dry by default; `--apply` is what spends credits.
//
// Usage: node scripts/backfill-audio-originals.mjs [--apply] [--reopen] [--run <dir>]
//   --apply   actually fetch and write (default is a report of what would happen)
//   --reopen  also clear `meta.done`, pushing every touched lesson back into review
//   --force   regenerate cards that already have an original (after a change to the text sent)
//   --run     limit to one run dir (repeatable); default is every lesson under output/

import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import {
  hashTerm,
  defaultClipText,
  isStageOwnedCard,
  deriveCardAudio,
} from "../src/audio/index.js";
import { usesEndMarker } from "../src/audio/ttsMarker.js";
import { fetchElevenLabsTts } from "../src/audio/elevenLabsTts.js";
import { autoTrim } from "../src/audio/trimSilence.js";
import { TTS_MODEL } from "../src/audio/ttsModel.js";
import { getDefaultVoice } from "../src/audio/voiceLibrary.js";
import { resolveIso639Code } from "../src/model/iso639.js";
import { libraryHome, validateCards } from "../src/model/index.js";
import { writeFileAtomic } from "../src/util/atomicWrite.js";
import { assertExternalCallAllowed } from "../src/util/testEnv.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
// Cards with an original are normally skipped. `--force` regenerates them anyway, which is what
// a change to the TEXT we send (e.g. adding the Japanese end marker) requires — the cache key is a
// hash of that text, so every entry is a miss and every card needs a fresh take.
const force = args.includes("--force");
const reopen = args.includes("--reopen");
const explicit = args.reduce(
  (acc, a, i) => (args[i - 1] === "--run" ? [...acc, a] : acc),
  /** @type {string[]} */ ([]),
);

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

if (apply) {
  assertExternalCallAllowed("synthesize audio");
  // The CLI's bin.js loads .env via a node flag; a bare `node scripts/...` doesn't get that.
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env — fall back to the ambient environment */
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error("ELEVENLABS_API_KEY is not set — nothing was fetched");
    process.exit(1);
  }
}

// One fetch per unique term for the whole run, matching the audio stage's cache: the same phrase in
// three lessons costs one call, not three.
const fetched = new Map(); // term -> { audio, original, cacheDir }
let calls = 0;

async function takesFor(term, voiceId, languageCode) {
  const key = `${voiceId}::${term}`;
  if (fetched.has(key)) return fetched.get(key);

  const cacheDir = join(libraryHome(), "audio", voiceId, TTS_MODEL);
  const audio = `${hashTerm(term)}.mp3`;
  const original = `${hashTerm(term)}.orig.mp3`;
  const pair = { audio, original, cacheDir };

  // A cache entry that ALREADY has both takes came from the current code and matches by construction.
  if (existsSync(join(cacheDir, original)) && existsSync(join(cacheDir, audio))) {
    fetched.set(key, pair);
    return pair;
  }

  if (apply) {
    const raw = await fetchElevenLabsTts(
      term,
      voiceId,
      process.env.ELEVENLABS_API_KEY,
      languageCode,
    );
    const { auto } = await autoTrim(raw, { marker: usesEndMarker(languageCode) });
    mkdirSync(cacheDir, { recursive: true });
    // Original first — see fetchTermsToCache. A crash between the writes must leave the shipping clip
    // missing (the next run refetches) rather than an orphan whose absent sibling reads as "no original".
    writeFileAtomic(join(cacheDir, original), raw);
    writeFileAtomic(join(cacheDir, audio), auto);
  }
  calls++;
  fetched.set(key, pair);
  return pair;
}

let lessons = 0,
  touched = 0,
  skipped = 0,
  already = 0;

for (const dir of runDirs) {
  const cardsPath = join(dir, "cards.json");
  const data = JSON.parse(readFileSync(cardsPath, "utf-8"));
  const languageCode = resolveIso639Code(data.meta?.targetLanguage);
  const voiceId = getDefaultVoice(languageCode);
  if (!voiceId) {
    console.error(`! ${dir}: no default voice for ${data.meta?.targetLanguage} — skipped`);
    continue;
  }

  let changed = 0;
  for (const item of data.items || []) {
    if (item.excluded || !item.audio) continue;
    if (item.audioOriginal && !force) {
      already++;
      continue;
    }
    // Only cards the audio stage owns are this script's business.
    if (!isStageOwnedCard(item)) {
      skipped++;
      continue;
    }

    const term = defaultClipText(item, languageCode);
    const { audio, original, cacheDir } = await takesFor(term, voiceId, languageCode);

    if (apply) {
      const audioDir = join(dir, "audio");
      mkdirSync(audioDir, { recursive: true });
      // OVERWRITE both, unconditionally. The run dir holds the previous generation's trimmed clip;
      // keeping it while adding a fresh original is exactly the mismatched pair this script exists to
      // avoid, so the two files must always be replaced together.
      copyFileSync(join(cacheDir, original), join(audioDir, original));
      copyFileSync(join(cacheDir, audio), join(audioDir, audio));
      item.audioOriginal = original;
      item.audioAuto = audio;
      // The original still carries the end marker, so anything later re-deriving from it must know.
      if (usesEndMarker(languageCode)) item.audioMarked = true;
      else delete item.audioMarked;
      const derived = deriveCardAudio(item);
      if (derived) item.audio = derived;
    }
    changed++;
    touched++;
  }

  if (changed > 0 || (reopen && data.meta?.done)) {
    lessons++;
    const wasDone = !!data.meta?.done;
    if (reopen && wasDone && apply) data.meta.done = false;
    if (apply) {
      validateCards(data);
      writeFileAtomic(cardsPath, JSON.stringify(data, null, 2));
    }
    console.log(
      `${apply ? "✓" : "would fix"} ${dir}: ${changed} card(s)` +
        (reopen && wasDone ? " · reopened for review" : ""),
    );
  }
}

console.log(
  `\n${apply ? "Backfilled" : "Would backfill"} ${touched} card(s) across ${lessons} lesson(s).\n` +
    `  ${calls} ElevenLabs call(s)${apply ? "" : " would be made"} (one per unique spoken term).\n` +
    `  ${skipped} hand-picked clip(s) left alone — re-Generate or Replace those to give them an original.\n` +
    `  ${already} card(s) already had one.` +
    (apply ? "" : "\n\nNothing was fetched or written. Re-run with --apply to do it."),
);

import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";

// Best-effort trimming of the trailing silence + tiny end artifact ("blip") ElevenLabs leaves on every
// clip. Applied centrally at the fetch choke point (src/audio/elevenLabsTts.js), so every generated
// clip is cleaned. Uses ffmpeg; if ffmpeg is absent or ANY step fails, the ORIGINAL clip is returned
// unchanged — the audio build never breaks. Off with ANKI_BUILDER_TRIM_AUDIO=0.

const DEFAULTS = {
  silenceDb: -40, // silencedetect noise floor (dB)
  minSilenceSec: 0.15, // silencedetect: minimum silence run to register
  minSpeechSec: 0.2, // a speech segment shorter than this is a blip/noise, not real content
  padSec: 0.08, // breathing room kept after the last real speech
};
const MP3_QUALITY = "2"; // libmp3lame -q:a (VBR, ~190 kbps)
const MIN_SHORTEN_SEC = 0.05; // don't re-encode for a negligible gain
const MIN_PLAUSIBLE_SEC = 0.3; // never trim to below this (guards an all-silence clip)

function envFloat(env, name, dflt) {
  const raw = env[name];
  if (raw == null || raw === "") return dflt;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : dflt;
}

// Parses ffmpeg's silencedetect stderr and returns the seconds to trim the clip TO, or null (no-op).
// Exported for unit testing without ffmpeg.
export function computeTrimPoint(stderr, opts = {}) {
  const minSpeechSec = opts.minSpeechSec ?? DEFAULTS.minSpeechSec;
  const padSec = opts.padSec ?? DEFAULTS.padSec;
  const minShortenSec = opts.minShortenSec ?? MIN_SHORTEN_SEC;
  const minPlausibleSec = opts.minPlausibleSec ?? MIN_PLAUSIBLE_SEC;

  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!durationMatch) return null;
  const duration =
    Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const silences = starts.map((start, i) => [
    Math.max(0, start),
    Math.min(duration, i < ends.length ? ends[i] : duration), // unclosed trailing silence → EOF
  ]);

  // Speech = the complement of the silence intervals over [0, duration].
  const speech = [];
  let cursor = 0;
  for (const [start, end] of silences) {
    if (start > cursor) speech.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) speech.push([cursor, duration]);
  if (speech.length === 0) return null;

  // Content ends at the LAST speech segment that's actually speech (≥ minSpeechSec); a short trailing
  // blip is skipped, and a genuine mid-clip pause is preserved (the real speech after it qualifies).
  let contentEnd = null;
  for (const [start, end] of speech) {
    if (end - start >= minSpeechSec) contentEnd = end;
  }
  if (contentEnd == null) return null;

  const trimTo = Math.min(contentEnd + padSec, duration);
  if (duration - trimTo < minShortenSec) return null; // negligible gain
  if (trimTo < minPlausibleSec) return null; // implausibly short → likely all-silence
  return Math.round(trimTo * 1000) / 1000;
}

function defaultRunFfmpeg(args) {
  return spawnSync("ffmpeg", args, { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
}

let ffmpegAvailable; // undefined | boolean — probed once, then cached
let warnedMissing = false;

// Exposed so tests can clear the module-level availability cache between cases.
export function __resetFfmpegCache() {
  ffmpegAvailable = undefined;
  warnedMissing = false;
}

function isFfmpegAvailable(runFfmpeg) {
  if (ffmpegAvailable === undefined) {
    const result = runFfmpeg(["-version"]);
    ffmpegAvailable = !result.error && result.status === 0;
    if (!ffmpegAvailable && !warnedMissing) {
      warnedMissing = true;
      console.error(
        "[trim-audio] ffmpeg not found — skipping trailing-silence trimming (install: brew install ffmpeg)",
      );
    }
  }
  return ffmpegAvailable;
}

/**
 * Returns `mp3Buffer` with its trailing silence + end blip trimmed, or the original buffer unchanged
 * on any failure (ffmpeg missing, error, or a result that isn't smaller). Never throws.
 */
export async function trimTrailingSilence(mp3Buffer, opts = {}) {
  const { runFfmpeg = defaultRunFfmpeg, env = process.env } = opts;

  const toggle = env.ANKI_BUILDER_TRIM_AUDIO;
  if (toggle === "0" || toggle === "false") return mp3Buffer;
  if (!Buffer.isBuffer(mp3Buffer) || mp3Buffer.length === 0) return mp3Buffer;
  if (!isFfmpegAvailable(runFfmpeg)) return mp3Buffer;

  const cfg = {
    silenceDb: envFloat(env, "ANKI_BUILDER_TRIM_SILENCE_DB", DEFAULTS.silenceDb),
    minSilenceSec: envFloat(env, "ANKI_BUILDER_TRIM_MIN_SILENCE_SEC", DEFAULTS.minSilenceSec),
    minSpeechSec: envFloat(env, "ANKI_BUILDER_TRIM_MIN_SPEECH_SEC", DEFAULTS.minSpeechSec),
    padSec: envFloat(env, "ANKI_BUILDER_TRIM_PAD_SEC", DEFAULTS.padSec),
  };

  const dir = mkdtempSync(join(tmpdir(), "anki-builder-trim-"));
  try {
    const inPath = join(dir, "in.mp3");
    const outPath = join(dir, "out.mp3");
    writeFileSync(inPath, mp3Buffer);

    const detect = runFfmpeg([
      "-hide_banner",
      "-i",
      inPath,
      "-af",
      `silencedetect=noise=${cfg.silenceDb}dB:d=${cfg.minSilenceSec}`,
      "-f",
      "null",
      "-",
    ]);
    if (detect.error) return mp3Buffer;

    const trimTo = computeTrimPoint(detect.stderr || "", {
      minSpeechSec: cfg.minSpeechSec,
      padSec: cfg.padSec,
    });
    if (trimTo == null) return mp3Buffer;

    const cut = runFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      "-to",
      String(trimTo),
      "-c:a",
      "libmp3lame",
      "-q:a",
      MP3_QUALITY,
      outPath,
    ]);
    if (cut.error || cut.status !== 0 || !existsSync(outPath)) return mp3Buffer;

    const trimmed = readFileSync(outPath);
    // Sanity gate: a trim that didn't shrink the clip is wrong / not worth the re-encode.
    if (!trimmed || trimmed.length === 0 || trimmed.length >= mp3Buffer.length) return mp3Buffer;
    return trimmed;
  } catch {
    return mp3Buffer;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

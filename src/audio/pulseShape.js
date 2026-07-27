import { spawnSync } from "child_process";

// Counting the energy pulses in a stretch of audio, used to check that the tail of a clip really is
// the throwaway marker we appended (./ttsMarker.js) and not the reviewer's actual words.
//
// `ででで` is one syllable three times, and the /d/ in each closes the vocal tract — so the waveform
// rises and falls three times with near-silent dips between. That shape is visible and countable.
//
// It is NOT reliable enough to be the primary test. Measured over 12 generated clips, "exactly three
// pulses" identified the marker 11 times; the miss merged two で into one 0.245s pulse. Meanwhile real
// speech read as three pulses in 2 of 6 held-out cases, so the shape alone would happily cut content.
// What it IS reliable at is the negative: every marker measured landed in 2-4 pulses. So this is used
// as a VETO — if the tail doesn't look like a repeated syllable, leave it alone and let a human hear
// the stray marker, which is a far better failure than silently cutting speech.

const FRAME_SEC = 0.005; // 5 ms — fine enough to resolve the stop closure between each で
const SAMPLE_RATE = 16000;

// Tuned by grid search against generated clips, then checked on a held-out set. They are tied to this
// project's Japanese voice; a different voice would want them re-derived rather than assumed.
const DEFAULTS = {
  smoothFrames: 1, // ±1 frame = 10 ms; smoothing further fills in the dips and merges the syllables
  hi: 0.3, // enter a pulse above this fraction of the window's peak
  lo: 0.15, // leave it below this (hysteresis, so a wobble doesn't split one pulse in two)
  mergeGapSec: 0.02, // dips shorter than this are within a syllable, not between two
  minWidthSec: 0.05, // anything briefer is a click or a breath, not a spoken syllable
};

// A marker reads as 2-4 pulses in practice. Demanding exactly 3 would reject roughly one real marker
// in six, leaving audible nonsense on those cards — a worse outcome than the position rule alone.
export const MARKER_PULSE_RANGE = [2, 4];

function defaultRunFfmpeg(args) {
  return spawnSync("ffmpeg", args, { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" });
}

/**
 * RMS amplitude envelope of `[from, to)` of an audio file, in 5 ms frames, lightly smoothed.
 * Returns [] if the audio can't be read — callers treat that as "can't tell".
 */
export function envelopeOf(path, from, to, opts = {}) {
  const { runFfmpeg = defaultRunFfmpeg, smoothFrames = DEFAULTS.smoothFrames } = opts;
  const args = ["-hide_banner", "-loglevel", "error"];
  if (from != null) args.push("-ss", String(from));
  if (to != null) args.push("-to", String(to));
  args.push("-i", path, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "-");

  const result = runFfmpeg(args);
  const buf = result && result.stdout;
  if (!buf || !buf.length) return [];

  const frame = Math.round(SAMPLE_RATE * FRAME_SEC);
  const raw = [];
  for (let i = 0; i + frame * 2 <= buf.length; i += frame * 2) {
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const v = buf.readInt16LE(i + j * 2) / 32768;
      sum += v * v;
    }
    raw.push(Math.sqrt(sum / frame));
  }
  if (smoothFrames <= 0) return raw;
  return raw.map((_, i) => {
    let sum = 0,
      n = 0;
    for (
      let k = Math.max(0, i - smoothFrames);
      k <= Math.min(raw.length - 1, i + smoothFrames);
      k++
    ) {
      sum += raw[k];
      n++;
    }
    return sum / n;
  });
}

/**
 * The pulses in an envelope: runs above `hi` (relative to the window's peak) that fall below `lo`,
 * with brief dips merged and slivers discarded.
 *
 * @returns {{ start: number, width: number }[]} in seconds, relative to the window
 */
export function findPulses(envelope, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const peak = envelope.length ? Math.max(...envelope) : 0;
  if (peak <= 0) return [];

  const runs = [];
  let inPulse = false;
  let start = 0;
  for (let i = 0; i < envelope.length; i++) {
    const v = envelope[i] / peak;
    if (!inPulse && v >= cfg.hi) {
      inPulse = true;
      start = i;
    } else if (inPulse && v < cfg.lo) {
      inPulse = false;
      runs.push([start, i]);
    }
  }
  if (inPulse) runs.push([start, envelope.length]);

  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && (run[0] - last[1]) * FRAME_SEC < cfg.mergeGapSec) last[1] = run[1];
    else merged.push([...run]);
  }
  return merged
    .filter(([a, b]) => (b - a) * FRAME_SEC >= cfg.minWidthSec)
    .map(([a, b]) => ({ start: a * FRAME_SEC, width: (b - a) * FRAME_SEC }));
}

/**
 * Does `[from, to)` of this file look like the repeated-syllable marker?
 *
 * Deliberately permissive: it answers "is there any reason to think this ISN'T the marker", not "am I
 * certain it is". An envelope that can't be read at all returns false — unreadable audio is not
 * evidence, and the caller must not cut on a guess.
 */
export function looksLikeMarker(path, from, to, opts = {}) {
  const pulses = findPulses(envelopeOf(path, from, to, opts), opts);
  const [min, max] = MARKER_PULSE_RANGE;
  return pulses.length >= min && pulses.length <= max;
}

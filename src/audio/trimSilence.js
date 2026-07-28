import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { cleanupChain } from "./cleanupFilter.js";
import { looksLikeMarker as defaultLooksLikeMarker } from "./pulseShape.js";

// Best-effort trimming of the trailing silence + tiny end artifact ("blip") ElevenLabs leaves on every
// clip, optionally preceded by background-noise cleanup (./cleanupFilter.js) in the same pass. Every
// producer of audio goes through `autoTrim` below — the build stage, the dashboard's Generate, a
// Replace upload — so a clip is treated identically however it arrived. Uses ffmpeg; if ffmpeg is
// absent or ANY step fails, the ORIGINAL clip is returned unchanged and the audio build never breaks.
// Off with ANKI_BUILDER_TRIM_AUDIO=0; cleanup off with ANKI_BUILDER_AUDIO_CLEANUP=off.
//
// The noise cleanup runs BEFORE silence detection, not after. Rumble peaks around -38 dB, above
// silencedetect's -40 dB threshold, so on a noisy clip the trailing "silence" reads as sound and the
// trim gives up — measured on this project's own decks, that happens to roughly 1 clip in 16.

const DEFAULTS = {
  silenceDb: -40, // silencedetect noise floor (dB)
  minSilenceSec: 0.15, // silencedetect: minimum silence run to register
  minSpeechSec: 0.2, // a speech segment shorter than this is a blip/noise, not real content
  padSec: 0.2, // tail kept after the last speech, capped by however much silence there actually is
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

/**
 * Parses ffmpeg's silencedetect stderr into `{ duration, silences, speech }`, where speech is the
 * complement of the detected silences over [0, duration].
 *
 * Exported so the marker check (below) can reason about the segments before a trim point is chosen,
 * and so all of it stays unit-testable without ffmpeg.
 */
export function parseSegments(stderr) {
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

  const speech = [];
  let cursor = 0;
  for (const [start, end] of silences) {
    if (start > cursor) speech.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < duration) speech.push([cursor, duration]);
  return { duration, silences, speech };
}

// A trailing segment can only be the appended marker if it is short and stands clearly apart from the
// speech before it. Genuine pauses INSIDE a phrase measured up to 0.72s on this project's clips, while
// every observed marker sat behind a gap of 0.82s or more — but the threshold is set well below that
// so the check stays about "is this separated at all", with the pulse-shape veto doing the real work.
const MARKER_MAX_SEC = 1.0;
const MARKER_MIN_GAP_SEC = 0.3;
// Gap needed to join one more syllable onto an already-identified marker. Deliberately lower than
// MARKER_MIN_GAP_SEC: the `。` pause opening the marker measured 0.25s on this project's clips, while
// the gaps BETWEEN the で ran to ~0.9s — so the run's leading edge is the narrowest gap in it, and
// demanding the full standing-apart distance there would cut the run short. This is a floor, not a
// real filter: a gap only exists where silencedetect already found `minSilenceSec` of silence.
const MARKER_MIN_SPLIT_GAP_SEC = 0.15;
// Width cap for a segment JOINED to an existing run — i.e. one that must be a single で on its own.
// A lone trailing segment may be up to MARKER_MAX_SEC because it can hold all three で at once, but
// once we are walking back over separately-voiced syllables each one has to be syllable-sized.
// Measured: a single で runs 0.22-0.32s, while the real-speech segments this walk wrongly swallowed
// (いろの in はいいろの, なんですか in あれはなんですか, じゅっ/かい in じゅっかい) run 0.39-0.98s. Nothing
// observed falls in between, and erring low fails safe — an unstripped marker is audible, a cut word
// is not.
const MARKER_SYLLABLE_MAX_SEC = 0.35;
// The marker is `。ででで` (./ttsMarker.js) — three で and no more, so a trailing run longer than this
// is somebody's actual words and must not be touched.
const MARKER_MAX_SYLLABLES = 3;

/**
 * Every window the appended marker could plausibly occupy, as `[from, to]`, **longest first**.
 *
 * A RUN, not a single segment. ElevenLabs voices ででで either as one blob or as up to three separate
 * utterances, and `silencedetect` splits the latter into three segments — so how many segments the
 * marker occupies is not knowable from position alone.
 *
 * Nor can the GAPS settle it, which is why this returns candidates rather than an answer. Measured on
 * this project's clips, the pause opening the marker ranges from 0.25s (ら, where the で then sit ~0.9s
 * apart) to 1.09s (あれはわにです, where they sit ~0.28s apart) — so the same 0.28s gap has to be read as
 * "inside the marker" on one clip and "this is where the marker starts" on another. No threshold does
 * both. The caller resolves it by asking `looksLikeMarker` about each window in turn and taking the
 * first that passes: on じゅっかい the two-segment window reads as 5 pulses and is rejected, leaving the
 * correct one-segment window; on あれはわにです the one-segment window reads as 1 pulse and is rejected,
 * leaving the correct three-segment one.
 *
 * Position only — whether a window SOUNDS like a repeated syllable is `looksLikeMarker`'s job. Keeping
 * them apart is what makes this testable without decoding audio.
 */
export function markerCandidates(speech) {
  if (!speech || speech.length < 2) return []; // nothing to fall back on if we dropped it

  const lastIndex = speech.length - 1;
  const windows = [];
  // Walk back from the end, stopping at index 1 either way so there is always real content left.
  for (let first = lastIndex; first > 0 && speech.length - first <= MARKER_MAX_SYLLABLES; first--) {
    const [start, end] = speech[first];
    // The last segment may hold the whole marker; anything joined to it must be one syllable.
    const maxWidth = first === lastIndex ? MARKER_MAX_SEC : MARKER_SYLLABLE_MAX_SEC;
    if (end - start > maxWidth) break; // too long to be one で — and so is anything before it
    const gap = start - speech[first - 1][1];
    if (gap < MARKER_MIN_SPLIT_GAP_SEC) break; // runs on from the speech before it

    // A LONE trailing segment must stand clearly apart, exactly as it always had to — that gap is the
    // only evidence it isn't just the phrase's last word. A multi-syllable run carries its own
    // evidence (a repeated syllable is a shape, not a position), so it needs no more than a
    // detectable pause.
    if (gap >= (first === lastIndex ? MARKER_MIN_GAP_SEC : MARKER_MIN_SPLIT_GAP_SEC)) {
      windows.push([start, speech[lastIndex][1]]);
    }
  }
  return windows.reverse(); // longest first
}

// Parses ffmpeg's silencedetect stderr and returns the seconds to trim the clip TO, or null (no-op).
// Exported for unit testing without ffmpeg.
export function computeTrimPoint(stderr, opts = {}) {
  const minSpeechSec = opts.minSpeechSec ?? DEFAULTS.minSpeechSec;
  const padSec = opts.padSec ?? DEFAULTS.padSec;
  const minShortenSec = opts.minShortenSec ?? MIN_SHORTEN_SEC;
  const minPlausibleSec = opts.minPlausibleSec ?? MIN_PLAUSIBLE_SEC;

  const parsed = parseSegments(stderr);
  if (!parsed) return null;
  const { duration, silences } = parsed;
  let speech = parsed.speech;
  if (speech.length === 0) return null;

  // Drop the appended marker before deciding anything, so the pad is measured from the end of the
  // REAL words. The caller only sets this once the segment has also passed the pulse-shape veto.
  // `dropFrom` is the start of the window the caller settled on. Everything from there on goes —
  // the whole run, not just its last segment, since a surviving で ends the clip and leaves the trim
  // with no trailing silence to measure against.
  if (opts.dropFrom != null) {
    speech = speech.filter(([start]) => start < opts.dropFrom - 1e-6);
  }

  // Content ends at the LAST speech segment that's actually speech (≥ minSpeechSec); a short trailing
  // blip is skipped, and a genuine mid-clip pause is preserved (the real speech after it qualifies).
  let contentEnd = null;
  for (const [start, end] of speech) {
    if (end - start >= minSpeechSec) contentEnd = end;
  }
  if (contentEnd == null) return null;

  // Keep a FIXED `padSec` of tail after the last real speech, capped by however much silence is
  // actually there. Everything past that (the rest of the silence, the blip, and any further silence)
  // is discarded.
  //
  // This used to target the MIDPOINT of the trailing silence, on the theory that a buffer scaling with
  // the silence could never clip the final sound. It was far too generous: trailing silence on this
  // project's clips runs to a median of 0.87s, so the midpoint rule left ~0.44s of dead air on a
  // typical card and 0.79s on the worst — very audible on a flashcard heard hundreds of times.
  //
  // A fixed pad is safe because the thing it has to cover is small and bounded: the decaying tail of
  // the voice that sits BELOW silencedetect's -40 dB threshold. Measured across 75 clips (comparing
  // where speech ends at -40 dB against -55 dB) that tail is a median of 0.046s and never exceeded
  // 0.191s — so 0.2s clears every clip, where 0.15s would have clipped one.
  const trailingSilence =
    silences.find(([s]) => Math.abs(s - contentEnd) < 1e-6) ||
    silences.find(([s]) => s >= contentEnd - 1e-6);
  if (!trailingSilence) return null; // speech runs to EOF — nothing trailing to trim
  const silenceEnd = trailingSilence[1];
  const trimTo = Math.min(contentEnd + padSec, silenceEnd, duration);

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
 *
 * `opts.cleanup` is an ffmpeg filter fragment (see ./cleanupFilter.js) prepended to BOTH passes.
 * Ordering matters and is deliberate: background rumble peaks around -38 dB, which is ABOVE
 * `silencedetect`'s -40 dB threshold, so on a noisy clip the "silence" never registers as silent and
 * the trim gives up entirely. Cleaning first is what makes the detection honest. Prepending to both
 * passes (rather than cleaning into a temp file and trimming that) keeps the output a SINGLE encode
 * from the original — cleaning and cutting in one step instead of stacking two lossy generations.
 */
export async function trimTrailingSilence(mp3Buffer, opts = {}) {
  const {
    runFfmpeg = defaultRunFfmpeg,
    env = process.env,
    cleanup = null,
    // Set when this clip was generated with the throwaway end marker (./ttsMarker.js), so the trim
    // knows to cut it back off. Injectable veto so tests don't have to decode real audio.
    marker = false,
    looksLikeMarker = defaultLooksLikeMarker,
  } = opts;
  const pre = cleanup ? `${cleanup},` : "";

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
      `${pre}silencedetect=noise=${cfg.silenceDb}dB:d=${cfg.minSilenceSec}`,
      "-f",
      "null",
      "-",
    ]);
    if (detect.error) return mp3Buffer;

    // Two checks before the marker is cut, and both still have to agree. POSITION proposes the
    // windows the marker could occupy; SHAPE decides between them — the marker is one syllable three
    // times, so its envelope rises and falls 2-4 times across the whole window, where a window that
    // has swallowed a real word reads as more. Taking the LONGEST window that passes strips every
    // syllable of a split marker; a window that has overreached is rejected on pulse count and the
    // next-shorter one is tried. If none pass, nothing is dropped and a reviewer hears a stray
    // marker, which is a far better failure than silently cutting the words off a card.
    let dropFrom = null;
    if (marker) {
      const parsed = parseSegments(detect.stderr || "");
      for (const [from, to] of parsed ? markerCandidates(parsed.speech) : []) {
        if (looksLikeMarker(inPath, from, to)) {
          dropFrom = from;
          break;
        }
      }
    }

    const trimTo = computeTrimPoint(detect.stderr || "", {
      minSpeechSec: cfg.minSpeechSec,
      padSec: cfg.padSec,
      dropFrom,
    });
    // Nothing to cut. When cleaning is on there is still work to do — the cleaned audio is the point,
    // trimming was only ever the other half — so fall through to the encode with the filter alone.
    if (trimTo == null && !cleanup) return mp3Buffer;

    const cut = runFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      ...(trimTo == null ? [] : ["-to", String(trimTo)]),
      ...(pre ? ["-af", cleanup] : []),
      "-c:a",
      "libmp3lame",
      "-q:a",
      MP3_QUALITY,
      outPath,
    ]);
    if (cut.error || cut.status !== 0 || !existsSync(outPath)) return mp3Buffer;

    const trimmed = readFileSync(outPath);
    if (!trimmed || trimmed.length === 0) return mp3Buffer;
    // Sanity gate: a trim that didn't shrink the clip is wrong / not worth the re-encode. It only
    // applies when trimming is the ONLY thing happening — a cleaned clip legitimately comes back the
    // same length (or larger, if the source was more heavily compressed than our encode).
    if (!cleanup && trimmed.length >= mp3Buffer.length) return mp3Buffer;
    return trimmed;
  } catch {
    return mp3Buffer;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Derives the shipping take from a raw clip — background cleanup, then the trailing-silence trim, in
 * one encode — reporting whether it actually altered the bytes.
 *
 * Every producer of audio (the build stage, the dashboard's Generate, a Replace upload) keeps the raw
 * take and stores this derived one beside it, so they all need the same "did it change?" answer:
 * `trimTrailingSilence` fails open by returning its input, and a buffer that came back byte-identical
 * means nothing happened — no second file worth writing, and no re-encode to account for.
 *
 * `cleanup` names a chain from ./cleanupFilter.js; omit it for the configured default, or pass
 * `"off"` to trim without cleaning.
 *
 * @returns {Promise<{ auto: Buffer, changed: boolean }>}
 */
export async function autoTrim(raw, { trim = trimTrailingSilence, cleanup, marker = false } = {}) {
  const auto = await trim(raw, { cleanup: cleanupChain(cleanup), marker });
  const changed = auto !== raw && !auto.equals(raw);
  return { auto: changed ? auto : raw, changed };
}

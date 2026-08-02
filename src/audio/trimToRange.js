import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";

// Cuts an explicit [start, end] range out of a clip — the dashboard trim editor's half of the work,
// where the reviewer has already decided the range by dragging handles over a waveform.
//
// The sibling automatic trim (./trimSilence.js) fails OPEN: no ffmpeg, or any error, returns the input
// unchanged so an unattended audio build never breaks over a cosmetic nicety. This one deliberately
// fails LOUD. A reviewer who drags a selection, presses Apply and gets a silent no-op has been told
// their edit landed when it didn't — they'd go on to sign the lesson off believing the clip was fixed.
// Every failure here throws, and the endpoint turns it into a real error on screen.

const MP3_QUALITY = "4"; // libmp3lame -q:a — matches trimSilence.js, so a re-cut doesn't change quality
const MIN_RANGE_SEC = 0.05; // below this there is no audible clip left to keep

function defaultRunFfmpeg(args) {
  return spawnSync("ffmpeg", args, { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
}

/**
 * Returns `mp3Buffer` cut down to the range `[start, end]` (seconds), re-encoded to mp3.
 *
 * `opts.cleanup` is an ffmpeg filter fragment (see ./cleanupFilter.js) applied in the SAME pass as the
 * cut. A hand trim is made from the card's untouched original, so without this the reviewer's cut
 * would silently reintroduce the background noise that the automatic take had removed.
 *
 * @throws if the range is nonsensical, ffmpeg is missing, or the cut fails.
 */
export function trimToRange(mp3Buffer, start, end, opts = {}) {
  const { runFfmpeg = defaultRunFfmpeg, cleanup = null } = opts;

  if (!Buffer.isBuffer(mp3Buffer) || mp3Buffer.length === 0) {
    throw new Error("no audio to trim");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("trim range must be two finite numbers of seconds");
  }
  if (start < 0) throw new Error("trim start cannot be negative");
  if (end - start < MIN_RANGE_SEC) {
    throw new Error(`trim range is too short — keep at least ${MIN_RANGE_SEC}s of audio`);
  }

  const dir = mkdtempSync(join(tmpdir(), "anki-builder-cut-"));
  try {
    const inPath = join(dir, "in.mp3");
    const outPath = join(dir, "out.mp3");
    writeFileSync(inPath, mp3Buffer);

    // `-ss` AFTER `-i` is an OUTPUT option: ffmpeg decodes and discards, which is sample-accurate,
    // where an input-side seek would land on a frame boundary. These clips are a couple of seconds
    // long, so the decode costs nothing and the accuracy is the whole point of a hand-placed edge.
    //
    // The length is `-t <duration>`, not `-to <end>`: what `-to` is measured against depends on
    // whether `-ss` was an input or an output option, so the pair is a genuine footgun. A duration
    // means the same thing everywhere.
    const result = runFfmpeg([
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      "-ss",
      String(start),
      "-t",
      String(end - start),
      ...(cleanup ? ["-af", cleanup] : []),
      "-c:a",
      "libmp3lame",
      "-q:a",
      MP3_QUALITY,
      outPath,
    ]);

    if (result.error && result.error.code === "ENOENT") {
      throw new Error(
        "ffmpeg is required to trim audio but was not found — install it (brew install ffmpeg)",
      );
    }
    if (result.error) throw new Error(`ffmpeg failed: ${result.error.message}`);
    if (result.status !== 0 || !existsSync(outPath)) {
      throw new Error(
        `ffmpeg could not cut the clip${result.status ? ` (exit ${result.status})` : ""}`,
      );
    }

    const cut = readFileSync(outPath);
    if (!cut || cut.length === 0) throw new Error("the trimmed clip came back empty");
    return cut;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "fs";
import { Buffer } from "buffer";
import {
  computeTrimPoint,
  trimTrailingSilence,
  __resetFfmpegCache,
} from "../../src/audio/trimSilence.js";
import { fetchElevenLabsTts } from "../../src/audio/elevenLabsTts.js";

// ---------------------------------------------------------------------------
// Pure parser — no ffmpeg, no I/O.
// ---------------------------------------------------------------------------

test("computeTrimPoint: discards the trailing blip + silence, cuts at the midpoint of the trailing silence", () => {
  const stderr = `  Duration: 00:00:01.35, start: 0.0, bitrate: 48 kb/s
[silencedetect @ 0x1] silence_start: 1.0
[silencedetect @ 0x1] silence_end: 1.3 | silence_duration: 0.3`;
  // speech [0,1.0] (real) → silence [1.0,1.3] → blip [1.3,1.35] (0.05s < minSpeech) skipped
  assert.equal(computeTrimPoint(stderr), 1.15); // midpoint of [1.0,1.3]
});

test("computeTrimPoint: no trailing silence → null (negligible shorten)", () => {
  const stderr = `  Duration: 00:00:01.00, start: 0.0`;
  assert.equal(computeTrimPoint(stderr), null);
});

test("computeTrimPoint: all-silence clip → null (never trims to ~0)", () => {
  const stderr = `  Duration: 00:00:00.80
[silencedetect] silence_start: 0.0
[silencedetect] silence_end: 0.8 | silence_duration: 0.8`;
  assert.equal(computeTrimPoint(stderr), null);
});

test("computeTrimPoint: a genuine mid-clip pause is preserved", () => {
  const stderr = `  Duration: 00:00:01.70
[silencedetect] silence_start: 0.5
[silencedetect] silence_end: 0.7
[silencedetect] silence_start: 1.4
[silencedetect] silence_end: 1.7`;
  // speech [0,0.5], [0.7,1.4] (both real); last real speech ends 1.4 → midpoint of [1.4,1.7]
  assert.equal(computeTrimPoint(stderr), 1.55);
});

test("computeTrimPoint: no Duration line → null", () => {
  assert.equal(computeTrimPoint("[silencedetect] silence_start: 1.0"), null);
});

test("computeTrimPoint: trailing silence running to EOF (unclosed silence_start)", () => {
  const stderr = `  Duration: 00:00:01.50
[silencedetect] silence_start: 1.0`;
  // silence [1.0, 1.5(EOF)]; speech [0,1.0] real → midpoint of [1.0,1.5]
  assert.equal(computeTrimPoint(stderr), 1.25);
});

// ---------------------------------------------------------------------------
// trimTrailingSilence — injected fake ffmpeg runner (no real binary).
// ---------------------------------------------------------------------------

const TRIM_STDERR = `  Duration: 00:00:01.35
[silencedetect] silence_start: 1.0
[silencedetect] silence_end: 1.3 | silence_duration: 0.3`;

// A fake `ffmpeg` runner. Handles the -version probe, the silencedetect pass (returns canned stderr),
// and the cut pass (writes `outBytes` to the output path).
function fakeRunner({
  available = true,
  stderr = TRIM_STDERR,
  outBytes = Buffer.from("SMALL"),
  calls,
} = {}) {
  return (args) => {
    if (calls) calls.push(args);
    if (args.length === 1 && args[0] === "-version") {
      return available
        ? { status: 0, stdout: "ffmpeg version test", stderr: "" }
        : { error: new Error("ENOENT"), status: null };
    }
    if (args.some((a) => String(a).includes("silencedetect"))) {
      return { status: 0, stdout: "", stderr };
    }
    if (args.includes("-to")) {
      writeFileSync(args[args.length - 1], outBytes);
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "" };
  };
}

test("trimTrailingSilence: ffmpeg present + trimmable → returns the smaller trimmed bytes", async () => {
  __resetFfmpegCache();
  const input = Buffer.from("A".repeat(1000));
  const out = await trimTrailingSilence(input, { runFfmpeg: fakeRunner(), env: {} });
  assert.equal(out.toString(), "SMALL");
  assert.ok(out.length < input.length);
});

test("trimTrailingSilence: ffmpeg absent → original bytes + exactly one warning (cached)", async () => {
  __resetFfmpegCache();
  const warnings = [];
  const origError = console.error;
  console.error = (...a) => warnings.push(a.join(" "));
  try {
    const input = Buffer.from("RAW");
    const a = await trimTrailingSilence(input, {
      runFfmpeg: fakeRunner({ available: false }),
      env: {},
    });
    const b = await trimTrailingSilence(input, {
      runFfmpeg: fakeRunner({ available: false }),
      env: {},
    });
    assert.equal(a, input);
    assert.equal(b, input);
    assert.equal(warnings.length, 1); // warned once, then cached
    assert.match(warnings[0], /ffmpeg not found/);
  } finally {
    console.error = origError;
  }
});

test("trimTrailingSilence: master toggle off → original, ffmpeg never probed", async () => {
  __resetFfmpegCache();
  let probed = false;
  const runFfmpeg = () => {
    probed = true;
    return { status: 0 };
  };
  const input = Buffer.from("RAW");
  const out = await trimTrailingSilence(input, {
    runFfmpeg,
    env: { ANKI_BUILDER_TRIM_AUDIO: "0" },
  });
  assert.equal(out, input);
  assert.equal(probed, false);
});

test("trimTrailingSilence: no trim point (no trailing silence) → original", async () => {
  __resetFfmpegCache();
  const input = Buffer.from("A".repeat(1000));
  const runner = fakeRunner({ stderr: "  Duration: 00:00:01.00" });
  const out = await trimTrailingSilence(input, { runFfmpeg: runner, env: {} });
  assert.equal(out, input);
});

test("trimTrailingSilence: pass-2 output not smaller → keep original", async () => {
  __resetFfmpegCache();
  const input = Buffer.from("A".repeat(10));
  const runner = fakeRunner({ outBytes: Buffer.from("B".repeat(50)) }); // bigger
  const out = await trimTrailingSilence(input, { runFfmpeg: runner, env: {} });
  assert.equal(out, input);
});

test("trimTrailingSilence: cleans up its temp dir", async () => {
  __resetFfmpegCache();
  const dirs = [];
  const runner = (args) => {
    // capture the temp dir from the input path
    const iIdx = args.indexOf("-i");
    if (iIdx >= 0) dirs.push(args[iIdx + 1].replace(/[/\\]in\.mp3$/, ""));
    return fakeRunner()(args);
  };
  await trimTrailingSilence(Buffer.from("A".repeat(1000)), { runFfmpeg: runner, env: {} });
  assert.ok(dirs.length > 0);
  assert.equal(existsSync(dirs[0]), false); // rmSync'd in finally
});

// ---------------------------------------------------------------------------
// Wiring — fetchElevenLabsTts routes bytes through the trimmer (non-destructive when off).
// ---------------------------------------------------------------------------

test("fetchElevenLabsTts pipes the response bytes through trimTrailingSilence", async () => {
  const originalFetch = globalThis.fetch;
  const original = process.env.ANKI_BUILDER_TRIM_AUDIO;
  process.env.ANKI_BUILDER_TRIM_AUDIO = "0"; // pass-through, no ffmpeg
  globalThis.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });
  try {
    const out = await fetchElevenLabsTts("hi", "voice", "key", "ja");
    assert.deepEqual([...out], [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.ANKI_BUILDER_TRIM_AUDIO;
    else process.env.ANKI_BUILDER_TRIM_AUDIO = original;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "fs";
import { Buffer } from "buffer";
import {
  computeTrimPoint,
  trimTrailingSilence,
  autoTrim,
  markerSegment,
  __resetFfmpegCache,
} from "../../src/audio/trimSilence.js";
import { fetchElevenLabsTts } from "../../src/audio/elevenLabsTts.js";

// ---------------------------------------------------------------------------
// Pure parser — no ffmpeg, no I/O.
// ---------------------------------------------------------------------------

test("computeTrimPoint: discards the trailing blip + silence, keeping a fixed pad after speech", () => {
  const stderr = `  Duration: 00:00:01.35, start: 0.0, bitrate: 48 kb/s
[silencedetect @ 0x1] silence_start: 1.0
[silencedetect @ 0x1] silence_end: 1.3 | silence_duration: 0.3`;
  // speech [0,1.0] (real) → silence [1.0,1.3] → blip [1.3,1.35] (0.05s < minSpeech) skipped
  assert.equal(computeTrimPoint(stderr), 1.2); // 1.0 + the 0.2s pad
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
  // speech [0,0.5], [0.7,1.4] (both real); last real speech ends 1.4 → 1.4 + 0.2
  assert.equal(computeTrimPoint(stderr), 1.6);
});

test("computeTrimPoint: no Duration line → null", () => {
  assert.equal(computeTrimPoint("[silencedetect] silence_start: 1.0"), null);
});

test("computeTrimPoint: trailing silence running to EOF (unclosed silence_start)", () => {
  const stderr = `  Duration: 00:00:01.50
[silencedetect] silence_start: 1.0`;
  // silence [1.0, 1.5(EOF)]; speech [0,1.0] real → 1.0 + 0.2
  assert.equal(computeTrimPoint(stderr), 1.2);
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

// --- noise cleanup, applied before the trim -------------------------------------------------------

// Rumble peaks around -38 dB, ABOVE silencedetect's -40 dB threshold, so on a noisy clip the trailing
// "silence" reads as sound and the trim gives up. Cleaning has to happen before detection, not after,
// or the trim is deciding based on audio nobody will ever hear.
test("the cleanup filter is prepended to the DETECT pass, not just the cut", async () => {
  const calls = [];
  const runFfmpeg = (args) => {
    calls.push(args);
    if (args.includes("-version")) return { status: 0, stderr: "" };
    if (args.includes("null")) {
      return {
        status: 0,
        stderr: "Duration: 00:00:02.00\nsilence_start: 1.20\nsilence_end: 2.00\n",
      };
    }
    writeFileSync(args[args.length - 1], "CUT");
    return { status: 0, stderr: "" };
  };
  __resetFfmpegCache();
  await trimTrailingSilence(Buffer.from("x".repeat(500)), {
    runFfmpeg,
    env: {},
    cleanup: "asubcut=cutoff=110:order=20",
  });

  const detect = calls.find((a) => a.includes("null"));
  const af = detect[detect.indexOf("-af") + 1];
  assert.match(af, /^asubcut=cutoff=110:order=20,silencedetect/);
});

test("the cut pass carries the same filter, so the output is one encode from the original", async () => {
  const calls = [];
  const runFfmpeg = (args) => {
    calls.push(args);
    if (args.includes("-version")) return { status: 0, stderr: "" };
    if (args.includes("null"))
      return {
        status: 0,
        stderr: "Duration: 00:00:02.00\nsilence_start: 1.20\nsilence_end: 2.00\n",
      };
    writeFileSync(args[args.length - 1], "CUT");
    return { status: 0, stderr: "" };
  };
  __resetFfmpegCache();
  await trimTrailingSilence(Buffer.from("x".repeat(500)), {
    runFfmpeg,
    env: {},
    cleanup: "highpass=f=100",
  });
  const cut = calls.find((a) => a.includes("-y"));
  assert.equal(cut[cut.indexOf("-af") + 1], "highpass=f=100");
  // One ffmpeg encode, from the input file — not a cleaned temp file that was then trimmed.
  assert.equal(calls.filter((a) => a.includes("-c:a")).length, 1);
});

// With cleaning on there is work to do even when nothing needs cutting, so the "nothing to trim" and
// "result isn't smaller" early-outs must not skip the encode and silently drop the cleanup.
test("a clip with no trailing silence is still cleaned", async () => {
  const runFfmpeg = (args) => {
    if (args.includes("-version")) return { status: 0, stderr: "" };
    if (args.includes("null")) return { status: 0, stderr: "Duration: 00:00:02.00\n" }; // no silence
    writeFileSync(args[args.length - 1], "CLEANED-BUT-NOT-CUT");
    return { status: 0, stderr: "" };
  };
  __resetFfmpegCache();
  const out = await trimTrailingSilence(Buffer.from("x".repeat(500)), {
    runFfmpeg,
    env: {},
    cleanup: "highpass=f=100",
  });
  assert.equal(out.toString(), "CLEANED-BUT-NOT-CUT");
});

test("with no cleanup, a clip with no trailing silence is returned untouched as before", async () => {
  const runFfmpeg = (args) => {
    if (args.includes("-version")) return { status: 0, stderr: "" };
    if (args.includes("null")) return { status: 0, stderr: "Duration: 00:00:02.00\n" };
    writeFileSync(args[args.length - 1], "SHOULD-NOT-BE-USED");
    return { status: 0, stderr: "" };
  };
  __resetFfmpegCache();
  const input = Buffer.from("x".repeat(500));
  assert.equal(await trimTrailingSilence(input, { runFfmpeg, env: {}, cleanup: null }), input);
});

test("autoTrim applies the configured cleanup, and 'off' trims without cleaning", async () => {
  const seen = [];
  const trim = async (bytes, opts) => {
    seen.push(opts?.cleanup ?? null);
    return bytes;
  };
  await autoTrim(Buffer.from("x"), { trim });
  await autoTrim(Buffer.from("x"), { trim, cleanup: "off" });
  await autoTrim(Buffer.from("x"), { trim, cleanup: "gentle" });
  assert.match(seen[0], /asubcut|highpass/, "default chain applied when none is named");
  assert.equal(seen[1], null, "'off' means trim only");
  assert.match(seen[2], /highpass=f=100/, "a named chain is passed through");
});

// --- how much tail the cut leaves ------------------------------------------------------------------

// The pad used to be a FLOOR under "half the trailing silence", which scaled with the silence and so
// left ~0.44s of dead air on a typical clip here (median trailing silence 0.87s) and 0.79s at worst.
// It is now a fixed target instead, so a long silence no longer buys itself a long tail.
test("computeTrimPoint: the tail kept does not grow with the length of the silence", () => {
  const clip = (dur, speechEnd, silEnd) =>
    `  Duration: 00:00:0${dur}.00\nsilence_start: ${speechEnd}\nsilence_end: ${silEnd}`;
  // Same speech, wildly different silences — the kept tail is identical.
  assert.equal(computeTrimPoint(clip(2, 1.0, 2.0)), 1.2);
  assert.equal(computeTrimPoint(clip(5, 1.0, 5.0)), 1.2);
  assert.equal(computeTrimPoint(clip(9, 1.0, 9.0)), 1.2);
});

// The pad is a target, not a promise: a clip with less silence than the pad keeps what it has rather
// than the cut running past the silence into whatever follows.
test("computeTrimPoint: the pad is capped by the silence actually present", () => {
  const stderr = `  Duration: 00:00:01.50\nsilence_start: 1.0\nsilence_end: 1.10\nsilence_start: 1.20\nsilence_end: 1.50`;
  // Only 0.10s of silence after speech, so the cut lands on its end — never past it.
  assert.equal(computeTrimPoint(stderr), 1.1);
});

test("computeTrimPoint: the pad is configurable, for a voice with a longer decay", () => {
  const stderr = `  Duration: 00:00:02.00\nsilence_start: 1.0\nsilence_end: 2.0`;
  assert.equal(computeTrimPoint(stderr, { padSec: 0.35 }), 1.35);
  assert.equal(computeTrimPoint(stderr, { padSec: 0.05 }), 1.05);
});

// --- stripping the throwaway end marker -----------------------------------------------------------

// Taken from a real generated clip (よろしくおねがいします。ででで): speech 0.07-1.41, then a 1.15s gap,
// then the marker 2.56-3.20 running to the end.
const MARKER_STDERR = `  Duration: 00:00:03.20
silence_start: 0
silence_end: 0.07
silence_start: 1.41
silence_end: 2.56`;

test("markerSegment picks the short, clearly separated trailing segment", () => {
  assert.deepEqual(
    markerSegment([
      [0, 1.0],
      [1.6, 2.0],
    ]),
    [1.6, 2.0],
  );
});

test("markerSegment refuses a trailing segment that is too long to be the marker", () => {
  assert.equal(
    markerSegment([
      [0, 1.0],
      [1.6, 3.0],
    ]),
    null,
  );
});

// A phrase with a natural pause before its final word looks superficially similar. Requiring a real
// gap is the first of the two guards; the pulse-shape veto is the second.
test("markerSegment refuses one that runs on from the speech before it", () => {
  assert.equal(
    markerSegment([
      [0, 1.0],
      [1.1, 1.5],
    ]),
    null,
  );
});

test("markerSegment refuses to strip the only segment there is", () => {
  assert.equal(markerSegment([[0, 1.0]]), null);
  assert.equal(markerSegment([]), null);
});

// The bug this guards: ElevenLabs often voices ででで as three utterances a second apart, so
// silencedetect reports three segments. Reading only the last one showed the pulse check a lone で,
// which vetoed the cut and shipped the whole marker. Measured from a real clip (hira-ra, ら).
test("markerSegment spans the whole run when the marker is voiced as separate syllables", () => {
  assert.deepEqual(
    markerSegment([
      [0, 0.932],
      [1.185, 1.489],
      [2.299, 2.617],
      [3.541, 3.84],
    ]),
    [1.185, 3.84],
  );
});

test("markerSegment never takes more syllables than the marker has", () => {
  // Five short, well-separated segments. `。ででで` is only ever three, so the run stops there and the
  // two earliest segments are left alone however marker-shaped they look.
  assert.deepEqual(
    markerSegment([
      [0, 0.4],
      [0.8, 1.2],
      [1.6, 2.0],
      [2.4, 2.8],
      [3.2, 3.6],
    ]),
    [1.6, 3.6],
  );
});

test("markerSegment stops the run at a segment too long to be a で", () => {
  assert.deepEqual(
    markerSegment([
      [0, 0.5],
      [1.0, 2.4], // real speech — 1.4s
      [2.9, 3.2],
    ]),
    [2.9, 3.2],
  );
});

// A three-segment marker, all of it after the real words end at 0.93.
const SPLIT_MARKER_STDERR = `  Duration: 00:00:03.84
silence_start: 0.932
silence_end: 1.185
silence_start: 1.489
silence_end: 2.299
silence_start: 2.617
silence_end: 3.541`;

test("computeTrimPoint drops every segment of a split marker, not just the last", () => {
  assert.equal(
    computeTrimPoint(SPLIT_MARKER_STDERR),
    null,
    "marker intact: speech runs to EOF, nothing to trim",
  );
  assert.equal(
    computeTrimPoint(SPLIT_MARKER_STDERR, { dropTrailing: true }),
    1.132,
    "0.932 + the 0.2s pad — measured from the real words, not from a surviving で",
  );
});

// Left in place, the marker IS the last real speech — so the trim finds nothing after it to cut and
// gives up entirely, shipping the marker. Dropping it first is what makes the clip trimmable at all.
test("computeTrimPoint with dropTrailing measures the pad from the REAL words", () => {
  assert.equal(computeTrimPoint(MARKER_STDERR), null, "marker intact: nothing to trim after it");
  assert.equal(
    computeTrimPoint(MARKER_STDERR, { dropTrailing: true }),
    1.61,
    "1.41 + the 0.2s pad",
  );
});

test("the cut never runs past the start of the marker it just dropped", () => {
  // A pad wider than the gap would otherwise eat into the marker itself.
  assert.equal(computeTrimPoint(MARKER_STDERR, { dropTrailing: true, padSec: 5 }), 2.56);
});

test("autoTrim passes the marker flag through to the trimmer", async () => {
  const seen = [];
  const trim = async (bytes, opts) => (seen.push(!!opts.marker), bytes);
  await autoTrim(Buffer.from("x"), { trim });
  await autoTrim(Buffer.from("x"), { trim, marker: true });
  assert.deepEqual(seen, [false, true]);
});

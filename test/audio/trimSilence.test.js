import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "fs";
import { Buffer } from "buffer";
import {
  computeTrimPoint,
  trimTrailingSilence,
  autoTrim,
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

import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "fs";
import { Buffer } from "buffer";
import { trimToRange } from "../../src/audio/trimToRange.js";

// A fake ffmpeg, so no test spawns a real binary (and the suite doesn't care whether the machine has
// one installed). `run.args` records the argv the cutter built; a successful run writes to the last
// argument, the way ffmpeg writes to its output path.
function fakeFfmpeg({ status = 0, error = null, writes = "CUT" } = {}) {
  const run = (args) => {
    run.args = args;
    if (error) return { error, status: null };
    if (status === 0) writeFileSync(args[args.length - 1], writes);
    return { error: null, status };
  };
  return run;
}

const CLIP = Buffer.from("a-clip");

test("cuts with an output-side -ss and a -t duration", () => {
  const runFfmpeg = fakeFfmpeg();
  const out = trimToRange(CLIP, 0.25, 1.75, { runFfmpeg });
  assert.equal(out.toString(), "CUT");

  const args = runFfmpeg.args;
  assert.ok(
    args.indexOf("-ss") > args.indexOf("-i"),
    "-ss must come AFTER -i, which makes it sample-accurate rather than frame-aligned",
  );
  assert.equal(args[args.indexOf("-ss") + 1], "0.25");

  // A duration, never `-to`: what `-to` is measured against depends on whether `-ss` was an input or
  // an output option, so the pair silently cuts the wrong range.
  assert.equal(args.includes("-to"), false);
  assert.equal(args[args.indexOf("-t") + 1], "1.5");

  // Same encoder settings as the automatic trim, so re-cutting doesn't quietly change quality.
  assert.equal(args[args.indexOf("-c:a") + 1], "libmp3lame");
  assert.equal(args[args.indexOf("-q:a") + 1], "4");
});

test("refuses a range that isn't two finite numbers", () => {
  const runFfmpeg = fakeFfmpeg();
  for (const [start, end] of [
    [NaN, 1],
    [0, Infinity],
    ["0.2", 1],
  ]) {
    assert.throws(() => trimToRange(CLIP, start, end, { runFfmpeg }), /finite numbers/);
  }
  assert.equal(runFfmpeg.args, undefined, "nothing is spawned for a nonsensical range");
});

test("refuses a negative start and an inverted or vanishingly short range", () => {
  const runFfmpeg = fakeFfmpeg();
  assert.throws(() => trimToRange(CLIP, -0.1, 1, { runFfmpeg }), /cannot be negative/);
  assert.throws(() => trimToRange(CLIP, 1.5, 0.5, { runFfmpeg }), /too short/);
  assert.throws(() => trimToRange(CLIP, 1, 1.01, { runFfmpeg }), /too short/);
});

test("refuses an empty clip", () => {
  assert.throws(() => trimToRange(Buffer.alloc(0), 0, 1, { runFfmpeg: fakeFfmpeg() }), /no audio/);
});

// The automatic trim fails OPEN so an unattended build never breaks. This one must not: a reviewer who
// drags a selection, presses Apply and gets a silent no-op has been told their edit landed.
test("a missing ffmpeg is a loud error naming the fix, not a silent no-op", () => {
  const enoent = Object.assign(new Error("spawnSync ffmpeg ENOENT"), { code: "ENOENT" });
  assert.throws(
    () => trimToRange(CLIP, 0, 1, { runFfmpeg: fakeFfmpeg({ error: enoent }) }),
    /ffmpeg is required to trim audio.*brew install ffmpeg/s,
  );
});

test("a non-zero ffmpeg exit throws rather than returning the untrimmed clip", () => {
  assert.throws(
    () => trimToRange(CLIP, 0, 1, { runFfmpeg: fakeFfmpeg({ status: 1 }) }),
    /could not cut the clip/,
  );
});

test("an empty result throws instead of being stored as the card's audio", () => {
  assert.throws(
    () => trimToRange(CLIP, 0, 1, { runFfmpeg: fakeFfmpeg({ writes: "" }) }),
    /came back empty/,
  );
});

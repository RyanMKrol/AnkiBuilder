import test from "node:test";
import assert from "node:assert/strict";
import { findPulses, MARKER_PULSE_RANGE, envelopeOf } from "../../src/audio/pulseShape.js";

// Build an envelope from a description of humps, so the pulse counter can be tested without audio.
function envelope(spec) {
  const out = [];
  for (const [level, frames] of spec) for (let i = 0; i < frames; i++) out.push(level);
  return out;
}

test("three clean humps read as three pulses", () => {
  // 0.10s hump, 0.05s dip, repeated — the shape ででで makes (5 ms frames)
  const e = envelope([
    [0.0, 4],
    [1.0, 20],
    [0.02, 10],
    [1.0, 20],
    [0.02, 10],
    [1.0, 20],
    [0.0, 4],
  ]);
  assert.equal(findPulses(e).length, 3);
});

// A brief dip inside one syllable must not split it in two, or every clip would look like a marker.
test("a momentary dip within a hump does not split it", () => {
  const e = envelope([
    [0.0, 4],
    [1.0, 14],
    [0.05, 2],
    [1.0, 14],
    [0.0, 4],
  ]);
  assert.equal(findPulses(e).length, 1);
});

test("slivers below the minimum width are discarded", () => {
  const e = envelope([
    [0.0, 4],
    [1.0, 20],
    [0.02, 10],
    [1.0, 2],
    [0.0, 4],
  ]);
  assert.equal(findPulses(e).length, 1, "the 10ms blip is a click, not a syllable");
});

test("a flat or silent window yields no pulses", () => {
  assert.deepEqual(findPulses([]), []);
  assert.deepEqual(findPulses(envelope([[0, 50]])), []);
});

// Unreadable audio is not evidence that the tail IS the marker — the caller must not cut on a guess.
test("an unreadable file produces an empty envelope, never a confident answer", () => {
  assert.deepEqual(envelopeOf("/nope.mp3", 0, 1, { runFfmpeg: () => ({ stdout: null }) }), []);
  assert.deepEqual(envelopeOf("/nope.mp3", 0, 1, { runFfmpeg: () => ({}) }), []);
});

// Demanding exactly 3 would reject roughly one real marker in six (measured), leaving audible
// nonsense on those cards. The range is deliberately wider than the nominal shape.
test("the accepted pulse range is wider than exactly three", () => {
  const [min, max] = MARKER_PULSE_RANGE;
  assert.ok(min <= 2 && max >= 4, `range ${min}-${max} should tolerate a merged or split syllable`);
});

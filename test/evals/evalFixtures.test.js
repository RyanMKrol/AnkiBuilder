import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";

import {
  FIXTURES,
  findFixture,
  recordedPathFor,
  deterministicShuffle,
} from "../../src/evals/fixtures.js";
import { readRecording, runFixture } from "../../src/evals/runner.js";

test("every fixture declares the pass, module and prompt it measures", () => {
  assert.ok(FIXTURES.length > 0);
  for (const fixture of FIXTURES) {
    assert.equal(typeof fixture.name, "string");
    assert.equal(typeof fixture.pass, "string");
    assert.equal(typeof fixture.module, "string");
    assert.equal(typeof fixture.prompt, "string");
    assert.equal(typeof fixture.run, "function");
    assert.equal(typeof fixture.available, "function");
    assert.equal(typeof fixture.describe, "function");
    assert.equal(typeof fixture.describe(), "string");
  }
});

test("the extraction fixture replays its recording through the real pass, offline", () => {
  const fixture = findFixture("extraction");
  const recordedPath = recordedPathFor("extraction");
  assert.ok(existsSync(recordedPath), `expected a recording at ${recordedPath}`);

  const result = runFixture(fixture, {
    mode: "recorded",
    recording: readRecording(recordedPath),
  });

  // The whole point of recording RAW stdout: this run went through the pass's own fence-stripping,
  // JSON parse and per-item schema validation, so a broken parser fails here rather than in CI's
  // absence.
  assert.ok(Array.isArray(result.candidate));
  assert.ok(result.candidate.length > 0);
  for (const item of result.candidate) {
    assert.equal(typeof item.english, "string");
    assert.equal(typeof item.target, "string");
    assert.equal(typeof item.category, "string");
  }
  assert.match(result.report, /MISSING/);
  assert.match(result.report, /EXTRA/);
});

test("a recording too short for the pass throws rather than reading as no change", () => {
  const fixture = findFixture("extraction");
  assert.throws(
    () => runFixture(fixture, { mode: "recorded", recording: { responses: [] } }),
    /asked for model call 1 but the recording holds only 0/,
  );
});

test("a missing recording is an error, not an empty diff", () => {
  const fixture = findFixture("extraction");
  assert.throws(() => runFixture(fixture, { mode: "recorded" }), /no recorded responses/);
});

test("live mode is hard-blocked under the test runner, so CI can never spend money", () => {
  const fixture = findFixture("extraction");
  assert.throws(
    () => runFixture(fixture, { mode: "live", liveRunClaude: fixture.liveRunClaude }),
    /refusing to spawn `claude -p` under the test runner/,
  );
});

test("the sort fixture's shuffle is a fixed permutation, so two reports compare", () => {
  const input = ["a", "b", "c", "d", "e", "f", "g"];
  const once = deterministicShuffle(input);
  const twice = deterministicShuffle(input);
  assert.deepEqual(once, twice);
  assert.notDeepEqual(once, input);
  assert.deepEqual([...once].sort(), [...input].sort());
});

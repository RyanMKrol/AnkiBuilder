import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  RUN_REPORT_FILE,
  STEP_STATUS,
  startRun,
  recordStep,
  finishRun,
  readRun,
  verifyRun,
} from "../../src/agents/runReport.js";

function withUnitDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "run-report-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const okStep = (over = {}) => ({
  step: "tables",
  role: "tableSpecialist",
  status: STEP_STATUS.OK,
  model: "claude-sonnet-5",
  effort: "medium",
  durationMs: 1200,
  counts: { in: 7, out: 42 },
  artifact: "candidates/tables.json",
  ...over,
});

test("a report round-trips through the unit dir", () => {
  withUnitDir((dir) => {
    const run = startRun({ phase: "base", unitDir: dir });
    writeFileSync(join(dir, "out.json"), "[]");
    recordStep(run, okStep({ artifact: "out.json" }));
    const path = finishRun(run);
    assert.ok(existsSync(path));
    assert.equal(path, join(dir, RUN_REPORT_FILE));
    const read = readRun(dir);
    assert.equal(read.phase, "base");
    assert.equal(read.steps.length, 1);
    assert.ok(read.finishedAt);
  });
});

test("an ok step whose artifact is missing is a problem, not a note", () => {
  withUnitDir((dir) => {
    // The whole point: the step claims success and there is nothing behind the claim.
    const run = startRun({ phase: "base", unitDir: dir });
    recordStep(run, okStep());
    finishRun(run);
    const { ok, problems } = verifyRun(readRun(dir));
    assert.equal(ok, false);
    assert.match(problems[0], /reported ok but its artifact is missing/);
  });
});

test("an empty artifact is a truncated write, not 'no findings'", () => {
  withUnitDir((dir) => {
    writeFileSync(join(dir, "out.json"), "");
    const run = startRun({ phase: "base", unitDir: dir });
    recordStep(run, okStep({ artifact: "out.json" }));
    finishRun(run);
    const { ok, problems } = verifyRun(readRun(dir));
    assert.equal(ok, false);
    assert.match(problems[0], /is empty \(0 bytes\)/);
  });
});

test("a step that ran and found nothing is a note: the file exists, the list is empty", () => {
  withUnitDir((dir) => {
    writeFileSync(join(dir, "images.json"), "[]");
    const run = startRun({ phase: "base", unitDir: dir });
    recordStep(run, okStep({ step: "images", artifact: "images.json", counts: { in: 0, out: 0 } }));
    finishRun(run);
    const { ok, problems, notes } = verifyRun(readRun(dir));
    assert.equal(ok, true, problems.join("; "));
    assert.match(notes[0], /ran and produced nothing/);
  });
});

test("an interrupted run is a problem even when every recorded step passed", () => {
  withUnitDir((dir) => {
    writeFileSync(join(dir, "out.json"), "[]");
    const run = startRun({ phase: "base", unitDir: dir });
    recordStep(run, okStep({ artifact: "out.json" }));
    // never finished
    const { ok, problems } = verifyRun(run, { unitDir: dir });
    assert.equal(ok, false);
    assert.match(problems[0], /never finished/);
  });
});

test("a required step removed from a script is caught by its absence", () => {
  withUnitDir((dir) => {
    writeFileSync(join(dir, "out.json"), "[]");
    const run = startRun({ phase: "base", unitDir: dir });
    recordStep(run, okStep({ artifact: "out.json" }));
    finishRun(run);
    const { ok, problems } = verifyRun(readRun(dir), { requiredSteps: ["tables", "coverage"] });
    assert.equal(ok, false);
    assert.match(problems[0], /coverage: required by this phase and absent/);
  });
});

test("no report at all is a problem, not an empty pass", () => {
  const { ok, problems } = verifyRun(null);
  assert.equal(ok, false);
  assert.match(problems[0], /never recorded one/);
});

test("a failure must carry a reason, and a non-terminal status is refused outright", () => {
  const run = startRun({ phase: "base", unitDir: "/tmp/x" });
  assert.throws(() => recordStep(run, okStep({ status: "running" })), /non-terminal status/);
  assert.throws(
    () => recordStep(run, okStep({ status: STEP_STATUS.FAILED, reason: null })),
    /failed without a reason/,
  );
});

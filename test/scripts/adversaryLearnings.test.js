import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// The script reads a unit directory and never writes, so every case here is a temp dir. Golden
// rule 6: no test may read or write a real unit under output/.
function withUnit(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "adv-learn-"));
  try {
    mkdirSync(join(dir, "candidates"), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, "candidates", name), JSON.stringify(body));
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (dir) =>
  execFileSync("node", ["scripts/adversary-learnings.mjs", dir], { encoding: "utf-8" });

test("a dominant cluster among the recoveries is called out as a probable missing rule", () => {
  // The Lesson 17 shape: most of what the adversary recovered came from one table, which is what a
  // missing rule looks like. Scattered misses are what the safety net is FOR; a concentration is not.
  const gaps = ["a", "b", "c", "d", "e"].map((t) => ({ target: t, foundIn: "EXERCISES I" }));
  gaps.push({ target: "z", foundIn: "VOCABULARY" });
  const out = withUnit(
    {
      "coverage.json": { gaps, onlyInCorpus: [] },
      "coverage-fills.json": {
        filled: gaps.map((g) => ({ target: g.target })),
        declined: [],
      },
    },
    run,
  );

  assert.match(out, /EXERCISES I/);
  assert.match(out, /come from ONE place/);
  assert.match(out, /rule the upstream passes are missing/);
});

test("recoveries spread across many places are reported as ordinary work, not a finding", () => {
  const gaps = [
    { target: "a", foundIn: "VOCABULARY" },
    { target: "b", foundIn: "GRAMMAR" },
    { target: "c", foundIn: "DIALOGUE" },
    { target: "d", foundIn: "WORD POWER" },
  ];
  const out = withUnit(
    {
      "coverage.json": { gaps, onlyInCorpus: [] },
      "coverage-fills.json": { filled: gaps.map((g) => ({ target: g.target })), declined: [] },
    },
    run,
  );

  assert.match(out, /No single dominant cause/);
  assert.doesNotMatch(out, /come from ONE place/);
});

test("decline reasons are counted, because a repeated one is the adversary's calibration", () => {
  // "Already taught in an earlier chapter" dominating the declines is the adversary working exactly
  // as designed: it reads one chapter and has no dedup library on purpose. That must not read as a
  // defect, so the reasons are surfaced with their counts rather than summed into one number.
  const out = withUnit(
    {
      "coverage.json": { gaps: [{ target: "a", foundIn: "VOCABULARY" }], onlyInCorpus: [] },
      "coverage-fills.json": {
        filled: [{ target: "a" }],
        declined: [
          { target: "x", reason: "Already taught in an earlier chapter." },
          { target: "y", reason: "Already taught in an earlier chapter." },
          { target: "z", reason: "A sentence; belongs in the extras unit." },
        ],
      },
    },
    run,
  );

  assert.match(out, /2\s+Already taught in an earlier chapter\./);
  assert.match(out, /1\s+A sentence; belongs in the extras unit\./);
});

test("a unit with no adversary output says so, rather than reporting a clean run over nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "adv-learn-empty-"));
  try {
    const out = run(dir);
    assert.match(out, /no adversary output/);
    assert.match(out, /nothing to read/);
    assert.doesNotMatch(out, /No single dominant cause/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

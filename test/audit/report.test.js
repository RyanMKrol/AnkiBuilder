import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "fs";
import { join } from "path";
import { audit, defineCheck, formatReport } from "../../src/audit/index.js";
import { makeOutputRoot, writeUnit, card } from "./fixture.js";

const lines = (result, opts) => formatReport(result, opts).join("\n");

test("the coverage header says what was looked at, including what could not be placed", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeUnit(root, "epubs/book/chapter-1-extras", { items: [card("b")] });
    writeUnit(root, "templates/numbers/ja", { meta: { sourceType: "template" }, items: [] });
    writeUnit(root, "epubs/book/drills", { items: [card("c")] });
    mkdirSync(join(root, "ad-hoc"), { recursive: true });

    const text = lines(audit({ outputRoot: root, checks: [] }));
    assert.match(text, /2 collection\(s\) \(1 epub, 1 template\)/);
    assert.match(text, /3 unit\(s\) \(1 unit, 1 extras, 1 template\)/);
    assert.match(text, /ad-hoc is not epubs\/, courses\/ or templates\/ — not scanned/);
    assert.match(text, /drills holds unit files but matches no known unit shape/);
  } finally {
    cleanup();
  }
});

test("a run with nothing to say ends in 'preflight clean' and nothing else", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const text = lines(audit({ outputRoot: root, checks: [] }));
    assert.match(text, /preflight clean$/);
  } finally {
    cleanup();
  }
});

test("the verdict separates blocking FAIL findings from unreviewed ACK ones", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const checks = [
      defineCheck({
        id: "f",
        title: "failing",
        scope: "collection",
        tier: "FAIL",
        run: () => ({ findings: [{ key: "k", message: "broken" }] }),
      }),
      defineCheck({
        id: "a",
        title: "ackable",
        scope: "collection",
        tier: "ACK",
        run: () => ({ findings: [{ key: "k", message: "judgement call" }] }),
      }),
    ];
    const text = lines(audit({ outputRoot: root, checks }));
    assert.match(text, /1 FAIL finding\(s\)/);
    assert.match(text, /1 unreviewed ACK finding\(s\)/);
    assert.match(text, /\[ACK\]/);
    assert.match(text, /accept these with:/);
  } finally {
    cleanup();
  }
});

test("--verbose is what prints the checks that passed", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const checks = [
      defineCheck({
        id: "quiet",
        title: "quiet",
        scope: "collection",
        tier: "FAIL",
        run: () => ({ findings: [], summary: "all good" }),
      }),
    ];
    const result = audit({ outputRoot: root, checks });
    assert.doesNotMatch(lines(result), /all good/);
    assert.match(lines(result, { verbose: true }), /✓ quiet\s+all good/);
  } finally {
    cleanup();
  }
});

// An INFO check that reports "412 cards break the style" and cannot say WHICH is a mood, not a
// report. The count shows always; the list is one flag away.
test("INFO findings are counted in the default report and listed under --verbose", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    const checks = [
      defineCheck({
        id: "noisy",
        title: "noisy",
        scope: "collection",
        tier: "INFO",
        run: () => ({
          findings: [
            { key: "x", message: "card x is odd" },
            { key: "y", message: "card y is odd" },
          ],
        }),
      }),
    ];
    const result = audit({ outputRoot: root, checks });
    const quiet = lines(result);
    assert.match(quiet, /· noisy\s+2 finding\(s\) \[INFO\]/);
    assert.doesNotMatch(quiet, /card x is odd/);
    assert.match(quiet, /2 INFO finding\(s\) not listed — re-run with --verbose/);
    assert.equal(result.exitCode, 0, "INFO never blocks");

    const loud = lines(result, { verbose: true });
    assert.match(loud, /card x is odd/);
    assert.match(loud, /card y is odd/);
    assert.doesNotMatch(loud, /not listed/);
  } finally {
    cleanup();
  }
});

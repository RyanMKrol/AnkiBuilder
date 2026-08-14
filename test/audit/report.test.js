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

import test from "node:test";
import assert from "node:assert/strict";
import { baseSplitCheck } from "../../src/audit/checks/baseSplit.js";

const unit = (name, meta, items = []) => ({ name, meta, items });

test("a sentence in a PHASE-BUILT base unit is reported", () => {
  const result = baseSplitCheck.run({
    units: [
      unit("chapter-17", { targetLanguage: "ja", phase: "base" }, [
        { id: "s1", target: "これはとけいです", english: "This is a watch." },
        { id: "w1", target: "とけい", english: "Watch" },
      ]),
    ],
  });
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].key, /chapter-17\/s1/);
  assert.match(result.findings[0].message, /belongs in this chapter's extras unit/);
  // And it says the other half out loud, because roughly that often it is the answer.
  assert.match(result.findings[0].message, /false positive/);
});

test("a v1 base unit is exempt, named, and called permanent", () => {
  // "No retroactive rewriting" is an explicit non-goal. Flagging chapters 0-16 would be asking a
  // reviewer to undo finished work, and they are 20-30% utterances by this measure.
  const result = baseSplitCheck.run({
    units: [
      unit("chapter-1", { targetLanguage: "ja" }, [{ id: "s", target: "これはとけいです" }]),
      unit("chapter-1-extras", { targetLanguage: "ja" }, [{ id: "t", target: "これはとけいです" }]),
    ],
  });
  assert.equal(result.findings, undefined);
  assert.match(result.notes.join(" "), /chapter-1/);
  assert.match(result.notes.join(" "), /permanent and expected/);
  assert.doesNotMatch(
    result.notes.join(" "),
    /chapter-1-extras/,
    "an extras unit is not a base one",
  );
});

test("an unconfigured language is skipped as UNKNOWN, not passed as clean", () => {
  const result = baseSplitCheck.run({
    units: [unit("lesson-1", { targetLanguage: "Spanish", phase: "base" }, [{ target: "hola" }])],
  });
  assert.equal(result.findings, undefined);
  assert.match(result.skipped, /UNKNOWN/);
  assert.match(result.skipped, /not a clean result/);
});

test("a clean phase-built unit says so, and counts what it checked", () => {
  const result = baseSplitCheck.run({
    units: [
      unit("chapter-17", { targetLanguage: "ja", phase: "base" }, [
        { id: "w", target: "とけい", english: "Watch" },
      ]),
    ],
  });
  assert.deepEqual(result.findings, []);
  assert.match(result.summary, /1 phase-built base unit\(s\) hold lexical entries only/);
});

test("a collection with no base units at all is skipped rather than reported clean", () => {
  const result = baseSplitCheck.run({
    units: [unit("chapter-1-extras", { targetLanguage: "ja" })],
  });
  assert.match(result.skipped, /no base units/);
});

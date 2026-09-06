import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { BASE_PHASE_STEPS, REQUIRED_STEPS, runBasePhase } from "../../src/agents/basePhase.js";
import { readRun } from "../../src/agents/runReport.js";
import { readSnapshot } from "../../src/agents/snapshot.js";
import { readVerdicts } from "../../src/agents/imageVerdicts.js";

const HTML = `
  <h2>VOCABULARY</h2>
  <table class="voca"><tr><td>ねこ</td><td>Cat</td></tr></table>
  <h2>WORD POWER</h2>
  <table class="tab1"><tr><td>0</td><td>ゼロ ／ れい</td></tr></table>
  <img src="images/p016.jpg"/>
`;

// Every agent stubbed: the whole phase runs without spawning anything.
const agents = {
  judgeTables: ({ tables }) => ({
    items: [
      {
        id: "neko",
        target: "ねこ",
        english: "Cat",
        category: "Animals",
        producedBy: "tableSpecialist",
      },
    ],
    tables: tables.map((t) => ({ index: t.index, verdict: "vocabulary", reason: "x" })),
  }),
  readChapter: ({ sections }) => ({
    items: [
      { id: "neko", target: "ねこ", english: "Cat", producedBy: "chapterReader" },
      { id: "tenisu", target: "テニス", english: "Tennis", producedBy: "chapterReader" },
    ],
    sections: sections.map((s) => ({ title: s.title, read: true, contributed: 1 })),
  }),
  judgeImages: ({ images }) => ({
    items: [{ id: "rei", target: "れい", english: "Zero", producedBy: "imageSpecialist" }],
    verdicts: images.map((i) => ({
      src: i.src,
      verdict: "reference-chart",
      transcription: "0 ゼロ／れい",
    })),
  }),
  enumerateChapter: () => ({
    items: [
      { target: "ねこ", english: "Cat" },
      { target: "し", english: "Four (alternate reading)" },
    ],
    coverage: { sectionsRead: ["VOCABULARY", "WORD POWER"], imagesOpened: ["images/p016.jpg"] },
  }),
};

function withUnit(fn) {
  const dir = mkdtempSync(join(tmpdir(), "base-phase-"));
  const chapterFile = join(dir, "chapter", "15.xhtml");
  mkdirSync(join(dir, "chapter", "images"), { recursive: true });
  writeFileSync(chapterFile, HTML);
  writeFileSync(join(dir, "chapter", "images", "p016.jpg"), "x");
  const unitDir = join(dir, "unit");
  mkdirSync(unitDir, { recursive: true });
  try {
    return fn({ unitDir, chapterFile });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = ({ unitDir, chapterFile }) =>
  runBasePhase({
    unitDir,
    chapterFilePath: chapterFile,
    chapterHtml: HTML,
    targetLanguage: "ja",
    meta: { hints: { vocabularyTableClass: "voca" } },
    agents,
  });

test("the order is data, so removing a step is a visible edit rather than a path not taken", () => {
  assert.deepEqual(
    BASE_PHASE_STEPS.map((s) => s.id),
    [
      "tables",
      "sections",
      "images",
      "table-specialist",
      "chapter-reader",
      "image-specialist",
      "reconcile",
      "snapshot",
      "coverage-adversary",
    ],
  );
  assert.deepEqual(
    REQUIRED_STEPS,
    BASE_PHASE_STEPS.map((s) => s.id),
    "none is optional",
  );
});

test("the adversary runs last, and the reconciler before the snapshot", () => {
  const at = (id) => BASE_PHASE_STEPS.findIndex((s) => s.id === id);
  assert.equal(at("coverage-adversary"), BASE_PHASE_STEPS.length - 1);
  assert.ok(at("reconcile") < at("snapshot"), "a baseline taken mid-merge is not a baseline");
  for (const agentStep of ["table-specialist", "chapter-reader", "image-specialist"]) {
    assert.ok(at("tables") < at(agentStep), "scripts supply raw material before agents judge");
  }
});

test("a full run writes every artifact and verifies clean", () => {
  withUnit((ctx) => {
    const { verdict, run: report } = run(ctx);
    assert.equal(verdict.ok, true, verdict.problems.join("; "));
    for (const step of BASE_PHASE_STEPS) {
      assert.ok(existsSync(join(ctx.unitDir, step.artifact)), `missing ${step.artifact}`);
    }
    assert.equal(report.steps.length, BASE_PHASE_STEPS.length);
    assert.ok(readRun(ctx.unitDir).finishedAt);
  });
});

test("the three roles are unioned, keeping what only one of them found", () => {
  withUnit((ctx) => {
    const { items, provenance } = run(ctx);
    const targets = items.map((i) => i.target).sort();
    assert.deepEqual(targets, ["ねこ", "テニス", "れい"].sort());
    assert.deepEqual(provenance[items.find((i) => i.target === "ねこ").id].sort(), [
      "chapterReader",
      "tableSpecialist",
    ]);
  });
});

test("the snapshot is the merged corpus with its provenance, taken before any review", () => {
  withUnit((ctx) => {
    const { items } = run(ctx);
    const snap = readSnapshot(ctx.unitDir);
    assert.equal(snap.phase, "base");
    assert.equal(snap.counts.items, items.length);
    assert.equal(Object.keys(snap.provenance).length, items.length);
  });
});

test("image verdicts are persisted for every image, and the adversary's gaps are recorded", () => {
  withUnit((ctx) => {
    const { gaps } = run(ctx);
    assert.equal(readVerdicts(ctx.unitDir).counts.total, 1);
    // し was enumerated and is in no merged item, so it is a gap. ねこ matched, so it is not.
    assert.deepEqual(
      gaps.gaps.map((i) => i.target),
      ["し"],
    );
    const artifact = JSON.parse(
      readFileSync(join(ctx.unitDir, "candidates/coverage.json"), "utf-8"),
    );
    assert.equal(artifact.counts.gaps, 1);
    assert.deepEqual(artifact.coverage.sectionsRead, ["VOCABULARY", "WORD POWER"]);
  });
});

test("a step that writes nothing is caught by verifyRun, not by a reviewer", () => {
  withUnit((ctx) => {
    const { verdict } = runBasePhase({
      unitDir: ctx.unitDir,
      chapterFilePath: ctx.chapterFile,
      chapterHtml: HTML,
      targetLanguage: "ja",
      agents: { ...agents, judgeImages: () => ({ items: [], verdicts: [] }) },
    });
    // Still verifies: the images artifact exists and holds an empty list, which is the honest
    // "this chapter's images produced nothing" rather than a missing file.
    assert.equal(verdict.ok, true, verdict.problems.join("; "));
    assert.ok(verdict.notes.some((n) => /produced nothing/.test(n)));
  });
});

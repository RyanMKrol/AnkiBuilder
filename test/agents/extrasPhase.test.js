import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  EXTRAS_PHASE_STEPS,
  REQUIRED_STEPS,
  runExtrasPhase,
  extrasUnitMeta,
} from "../../src/agents/extrasPhase.js";
import { readSnapshot } from "../../src/agents/snapshot.js";

const HTML = `<h2>KEY SENTENCES</h2><img src="e-I.jpg"/><h2>EXERCISES</h2><img src="e-II.jpg"/>`;
const BASE = [
  { id: "kore", target: "これ", english: "This", category: "Everyday Objects" },
  { id: "wa", target: "は", english: "Topic particle", category: "Grammar & Function Words" },
  { id: "desu", target: "です", english: "Is", category: "Grammar & Function Words" },
  { id: "pen", target: "ペン", english: "Pen", category: "Everyday Objects" },
];

const seen = [];
const agents = {
  mineExercises: ({ blocks }) => {
    seen.push("exercise");
    return {
      items: [
        {
          id: "e1",
          target: "これはペンです",
          english: "This is a pen.",
          producedBy: "exerciseMiner",
        },
      ],
      blocks: blocks.map(() => ({})),
      skipped: [],
      unteachable: [],
    };
  },
  mineFillInBlanks: () => {
    seen.push("fib");
    return {
      items: [
        {
          id: "f1",
          target: "それはペンです",
          english: "That is a pen.",
          producedBy: "fillInBlankMiner",
        },
      ],
      frames: [],
      skipped: [],
      unteachable: [],
    };
  },
  mineExampleSentences: () => {
    seen.push("example");
    return {
      items: [
        {
          id: "x1",
          target: "これはほんです",
          english: "This is a book.",
          producedBy: "exampleSentenceMiner",
        },
      ],
      sections: [],
      skipped: [],
      unteachable: [],
    };
  },
  authorGapFills: ({ gaps }) => {
    seen.push(`gap(${gaps.underExampled.length})`);
    return { items: [], unfillable: [], notes: null, unteachable: [] };
  },
  authorInventedPractice: ({ existingItems }) => {
    seen.push(`invent(${existingItems.length})`);
    return {
      items: [],
      allowance: Math.ceil(existingItems.length * 0.2),
      reinvented: [],
      unteachable: [],
    };
  },
};

function withUnit(fn) {
  const dir = mkdtempSync(join(tmpdir(), "extras-phase-"));
  const chapterFile = join(dir, "15.xhtml");
  writeFileSync(chapterFile, HTML);
  const unitDir = join(dir, "chapter-2-extras");
  mkdirSync(unitDir, { recursive: true });
  try {
    return fn({ unitDir, chapterFile });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (ctx) => {
  seen.length = 0;
  return runExtrasPhase({
    unitDir: ctx.unitDir,
    chapterFilePath: ctx.chapterFile,
    chapterHtml: HTML,
    baseItems: BASE,
    targetLanguage: "ja",
    meta: { hints: { numberedBlockMarkers: [{ filenamePrefix: "e", label: "EXERCISES" }] } },
    agents,
  });
};

test("the order is data, with the miners before the gaps and the inventor last", () => {
  assert.deepEqual(
    EXTRAS_PHASE_STEPS.map((s) => s.id),
    [
      "blocks",
      "exercise-miner",
      "fill-in-blank-miner",
      "example-sentence-miner",
      "gaps",
      "gap-author",
      "inventive-author",
      "reconcile",
      "snapshot",
    ],
  );
  assert.deepEqual(
    REQUIRED_STEPS,
    EXTRAS_PHASE_STEPS.map((s) => s.id),
  );
});

test("gaps are computed AFTER the miners, so a hole one filled is not a hole", () => {
  const at = (id) => EXTRAS_PHASE_STEPS.findIndex((s) => s.id === id);
  for (const miner of ["exercise-miner", "fill-in-blank-miner", "example-sentence-miner"]) {
    assert.ok(at(miner) < at("gaps"), `${miner} must precede the gap computation`);
  }
  assert.ok(at("gaps") < at("gap-author"));
  assert.equal(at("inventive-author"), at("reconcile") - 1, "the inventor is the last agent");
});

test("a full run writes every artifact and verifies clean", () => {
  withUnit((ctx) => {
    const { verdict } = run(ctx);
    assert.equal(verdict.ok, true, verdict.problems.join("; "));
    for (const step of EXTRAS_PHASE_STEPS) {
      assert.ok(existsSync(join(ctx.unitDir, step.artifact)), `missing ${step.artifact}`);
    }
  });
});

test("the roles actually run in the declared order", () => {
  withUnit((ctx) => {
    run(ctx);
    assert.deepEqual(seen.slice(0, 3), ["exercise", "fib", "example"]);
    assert.match(seen[3], /^gap\(/);
    assert.match(seen[4], /^invent\(/);
  });
});

test("the inventor is given everything the others produced, so its allowance is real", () => {
  withUnit((ctx) => {
    run(ctx);
    // three mined sentences plus zero gap fills
    assert.equal(seen[4], "invent(3)");
  });
});

test("the snapshot is the merged extras corpus with provenance", () => {
  withUnit((ctx) => {
    const { items } = run(ctx);
    const snap = readSnapshot(ctx.unitDir);
    assert.equal(snap.phase, "extras");
    assert.equal(snap.counts.items, items.length);
  });
});

test("a role's unteachable findings are surfaced, never dropped", () => {
  withUnit((ctx) => {
    const { unteachable, items } = runExtrasPhase({
      unitDir: ctx.unitDir,
      chapterFilePath: ctx.chapterFile,
      chapterHtml: HTML,
      baseItems: BASE,
      targetLanguage: "ja",
      agents: {
        ...agents,
        mineExercises: () => ({
          items: [{ id: "bad", target: "これはとけいです", producedBy: "exerciseMiner" }],
          blocks: [],
          skipped: [],
          unteachable: [{ id: "bad", target: "これはとけいです", residue: "とけい" }],
        }),
      },
    });
    assert.deepEqual(
      unteachable.map((u) => u.residue),
      ["とけい"],
    );
    assert.ok(
      items.some((i) => i.id === "bad"),
      "reported, not removed",
    );
  });
});

test("the gaps artifact records what was computed, for the reviewer to read", () => {
  withUnit((ctx) => {
    run(ctx);
    const gaps = JSON.parse(readFileSync(join(ctx.unitDir, "candidates/gaps.json"), "utf-8"));
    assert.ok(Array.isArray(gaps.neverUsed));
    assert.equal(gaps.paradigm, null, "no grid spec means nobody checked, not nothing missing");
  });
});

test("an extras unit inherits its identity from its base unit, suffix included", () => {
  // The " (Extras)" suffix is what deckPath splits on to nest the drills under their lesson. A unit
  // that spells it differently ships as a sibling of the book instead of a child of the lesson, and
  // the deck build has no way to tell that was not intended.
  const meta = extrasUnitMeta({
    targetLanguage: "ja",
    sourceType: "epub",
    reviewed: true,
    epubHash: "1fab0f99d1195ad9",
    chapterNumber: 38,
    chapterLabel: "Lesson 16: Making an Invitation: Shall We Go Together?",
  });

  assert.deepEqual(meta, {
    chapterNumber: 38,
    chapterLabel: "Lesson 16: Making an Invitation: Shall We Go Together? (Extras)",
    baseChapterLabel: "Lesson 16: Making an Invitation: Shall We Go Together?",
  });
  // Matches all sixteen hand-authored units: an extras unit carries no epubHash.
  assert.equal("epubHash" in meta, false);
});

test("a multi-file lesson's span carries over, so the extras unit spans the same range", () => {
  const meta = extrasUnitMeta({ chapterNumber: 38, lastChapterNumber: 40, chapterLabel: "L16" });
  assert.equal(meta.lastChapterNumber, 40);
  assert.equal(
    extrasUnitMeta({ chapterNumber: 38, chapterLabel: "L16" }).lastChapterNumber,
    undefined,
  );
});

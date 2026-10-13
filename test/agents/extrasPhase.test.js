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
import { writeVerdicts } from "../../src/agents/imageVerdicts.js";

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
      "figures",
      "exercise-miner",
      "fill-in-blank-miner",
      "example-sentence-miner",
      "gaps",
      "gap-author",
      "inventive-author",
      "reconcile",
      "snapshot",
      "semantic-dedup",
      "backward-dedup",
    ],
  );
  assert.deepEqual(
    REQUIRED_STEPS,
    EXTRAS_PHASE_STEPS.map((s) => s.id),
  );

  // Same invariant as phase 1, and it matters more here: five authoring roles feed this phase and
  // three of them mine the same chapter, so two miners returning one sentence is the normal case.
  const at = (id) => EXTRAS_PHASE_STEPS.findIndex((s) => s.id === id);
  assert.ok(at("snapshot") < at("semantic-dedup"), "the baseline is taken before anything is cut");
  assert.equal(at("backward-dedup"), EXTRAS_PHASE_STEPS.length - 1);
  assert.ok(at("semantic-dedup") < at("backward-dedup"), "cut duplicates before judging prior art");
});

test("the figure transcriptions are read before any miner runs", () => {
  const at = (id) => EXTRAS_PHASE_STEPS.findIndex((s) => s.id === id);
  for (const miner of ["exercise-miner", "fill-in-blank-miner", "example-sentence-miner"]) {
    assert.ok(at("figures") < at(miner), `figures must precede ${miner}`);
  }
});

// ---------------------------------------------------------------------------------------------
// The base phase's figure transcriptions, handed to the miners.
//
// The miners here are the REAL ones, so what is asserted is the prompt each of them actually
// renders. Only the model call is faked: it records the prompt and answers by the prompt's heading.
// ---------------------------------------------------------------------------------------------

const FIGURE = {
  src: "../images/Page_224_Image_0002.jpg",
  verdict: "labelled-figure",
  transcription: "1. Sun (circled) / Sat (crossed out)",
  note: "nothing to card",
};

function recordingClaude(prompts) {
  return (prompt) => {
    if (prompt.startsWith("# Task: Mine This Chapter's Exercises")) {
      prompts.exerciseMiner = prompt;
      return JSON.stringify({
        // With the other two miners' sentences, every base word is used and every function word has
        // three examples, so the computed gap list is empty and the faked gap author is honest.
        items: [{ id: "e1", target: "これはペンです", english: "This is a pen." }],
        blocks: [
          { block: "EXERCISES I", mined: 0 },
          { block: "EXERCISES II", mined: 0 },
        ],
        skipped: [],
      });
    }
    if (prompt.startsWith("# Task: Resolve This Chapter's Blanks")) {
      prompts.fillInBlankMiner = prompt;
      return JSON.stringify({
        items: [{ id: "f1", target: "それはペンです", english: "That is a pen." }],
        frames: [],
        skipped: [],
      });
    }
    if (prompt.startsWith("# Task: Card This Chapter's Own Sentences")) {
      prompts.exampleSentenceMiner = prompt;
      return JSON.stringify({
        items: [
          {
            id: "x1",
            target: "これはほんです",
            english: "This is a book.",
            source: "key-sentence",
            fromSection: "KEY SENTENCES",
          },
        ],
        sections: [
          { section: "KEY SENTENCES", mined: 0 },
          { section: "EXERCISES", mined: 0 },
        ],
        skipped: [],
      });
    }
    throw new Error(`unexpected prompt: ${prompt.slice(0, 60)}`);
  };
}

const runWithRealMiners = (ctx, extra = {}) => {
  const prompts = {};
  const result = runExtrasPhase({
    unitDir: ctx.unitDir,
    chapterFilePath: ctx.chapterFile,
    chapterHtml: HTML,
    baseItems: BASE,
    targetLanguage: "ja",
    meta: { hints: { numberedBlockMarkers: [{ filenamePrefix: "e", label: "EXERCISES" }] } },
    agents: {
      runClaude: recordingClaude(prompts),
      authorGapFills: agents.authorGapFills,
      authorInventedPractice: agents.authorInventedPractice,
      deduplicateCorpus: () => ({
        groups: [],
        skipped: null,
        excluded: [],
        distinct: [],
        unaccounted: [],
      }),
      deduplicateAgainstEarlier: () => ({
        candidates: [],
        skipped: null,
        flagged: [],
        cleared: [],
        unaccounted: [],
      }),
    },
    ...extra,
  });
  return { result, prompts };
};

test("the base phase's figure transcriptions reach every miner's prompt", () => {
  // Busy People Lesson 23: the fill-in-the-blank miner dropped Exercise VI as "cued only by
  // illustrations" while the base unit held a transcription of every one of those pictures.
  withUnit((ctx) => {
    const baseUnitDir = join(ctx.unitDir, "..", "chapter-2");
    mkdirSync(baseUnitDir, { recursive: true });
    writeVerdicts(baseUnitDir, [
      FIGURE,
      { src: "../images/audio-224.jpg", verdict: "decorative", note: "audio marker" },
      { src: "../images/blurry.jpg", verdict: "unreadable", transcription: "???" },
    ]);

    const { result, prompts } = runWithRealMiners(ctx, { baseUnitDir });

    for (const role of ["exerciseMiner", "fillInBlankMiner", "exampleSentenceMiner"]) {
      const prompt = prompts[role];
      assert.ok(prompt, `${role} was called`);
      assert.match(prompt, /Sun \(circled\) \/ Sat \(crossed out\)/, `${role} got the figure`);
      assert.match(prompt, /Page_224_Image_0002\.jpg/, `${role} can match it to the <img src>`);
      assert.match(prompt, /A picture-cued item is answerable from its transcription/);
      // Only content a miner can build on: no decorative or unreadable picture, and not the
      // specialist's note, which was written for the base unit's question.
      assert.doesNotMatch(prompt, /audio-224\.jpg|blurry\.jpg|nothing to card/);
    }

    const step = result.run.steps.find((s) => s.step === "figures");
    assert.equal(step.status, "ok");
    assert.equal(step.counts.out, 1);
    const artifact = JSON.parse(
      readFileSync(join(ctx.unitDir, "candidates/figures.json"), "utf-8"),
    );
    assert.deepEqual(
      artifact.figures.map((f) => f.transcription),
      [FIGURE.transcription],
    );
    assert.equal(result.verdict.ok, true, result.verdict.problems.join("; "));
  });
});

test("no transcriptions file: the phase runs as before and the run report says so", () => {
  withUnit((ctx) => {
    const baseUnitDir = join(ctx.unitDir, "..", "chapter-2");
    mkdirSync(baseUnitDir, { recursive: true });

    const { result, prompts } = runWithRealMiners(ctx, { baseUnitDir });

    assert.equal(result.verdict.ok, true, result.verdict.problems.join("; "));
    const step = result.run.steps.find((s) => s.step === "figures");
    assert.equal(step.status, "skipped");
    assert.match(step.reason, /no image-verdicts\.json in the base unit/);
    assert.ok(
      result.verdict.notes.some((n) => /^figures: skipped/.test(n)),
      "the skip reaches the notes build-extras prints",
    );
    for (const role of ["exerciseMiner", "fillInBlankMiner", "exampleSentenceMiner"]) {
      assert.match(prompts[role], /no figure transcriptions were available/);
    }
    assert.equal(result.items.length, 3, "the miners' output is untouched");
  });
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

// Phase 2: an approved base unit to a reviewable extras corpus, as one ordered script.
//
// Same shape as phase 1 and for the same reason: the order is DATA, so a test can assert it and
// removing a step is a visible edit rather than a path someone did not take.
//
// THE ORDER ENCODES THREE CONSTRAINTS, and each was a decision rather than a convenience:
//
//   - the three MINERS run before the gap author, because a gap is only real if the miners did not
//     already fill it. Computing gaps first would hand the gap author holes that no longer exist and
//     spend a model call closing them twice.
//   - the gaps are computed BETWEEN them, from the base unit plus everything mined so far. That is
//     the only moment the number is true.
//   - the INVENTIVE AUTHOR runs last, because its allowance is a share of what the others produced
//     and its whole job is to add what is missing. Earlier, its allowance would be a guess and it
//     could not avoid reinventing what it had not yet seen.
//
// WHAT PHASE 2 IS GIVEN. The APPROVED base corpus, after a human has signed it off, plus earlier
// lessons. Every role is held to it by `extrasVocabulary`, and the phase reports what each role
// produced that appears to break it rather than dropping anything.

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { parseNumberedBlocks, parseHeadings } from "../corpus/chapterOutline.js";
import { mineExercises } from "./exerciseMiner.js";
import { mineFillInBlanks } from "./fillInBlankMiner.js";
import { mineExampleSentences } from "./exampleSentenceMiner.js";
import { computeGaps } from "./coverageGaps.js";
import { authorGapFills } from "./gapAuthor.js";
import { authorInventedPractice } from "./inventiveAuthor.js";
import { reconcile } from "../cards/unionReconciler.js";
import { writeSnapshot } from "./snapshot.js";
import { startRun, recordStep, finishRun, verifyRun, STEP_STATUS } from "./runReport.js";

export const EXTRAS_PHASE_STEPS = Object.freeze([
  { id: "blocks", kind: "deterministic", artifact: "candidates/blocks.json" },
  {
    id: "exercise-miner",
    kind: "agent",
    role: "exerciseMiner",
    artifact: "candidates/exercises.json",
  },
  {
    id: "fill-in-blank-miner",
    kind: "agent",
    role: "fillInBlankMiner",
    artifact: "candidates/fill-in-blank.json",
  },
  {
    id: "example-sentence-miner",
    kind: "agent",
    role: "exampleSentenceMiner",
    artifact: "candidates/examples.json",
  },
  { id: "gaps", kind: "deterministic", artifact: "candidates/gaps.json" },
  { id: "gap-author", kind: "agent", role: "gapAuthor", artifact: "candidates/gap-fills.json" },
  {
    id: "inventive-author",
    kind: "agent",
    role: "inventiveAuthor",
    artifact: "candidates/invented.json",
  },
  { id: "reconcile", kind: "deterministic", artifact: "corpus.json" },
  { id: "snapshot", kind: "deterministic", artifact: "as-generated.json" },
]);

export const REQUIRED_STEPS = Object.freeze(EXTRAS_PHASE_STEPS.map((s) => s.id));

function write(unitDir, relative, body) {
  const path = join(unitDir, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return relative;
}

/**
 * Runs phase 2 for one chapter into `unitDir` (the `-extras` sibling).
 *
 * Every model-calling collaborator is injectable, so the whole phase is exercisable without spawning
 * anything: an ordering bug costs a test run rather than five paid calls.
 */
export function runExtrasPhase({
  unitDir,
  chapterFilePath,
  chapterHtml,
  baseItems = [],
  earlierItems = [],
  targetLanguage,
  meta = null,
  paradigmMisses = null,
  agents = {},
  now,
} = {}) {
  const run = startRun({ phase: "extras", unitDir, ...(now ? { now } : {}) });
  const impl = {
    mineExercises,
    mineFillInBlanks,
    mineExampleSentences,
    authorGapFills,
    authorInventedPractice,
    ...agents,
  };
  const pass = (fn) => {
    const started = Date.now();
    const value = fn();
    return { value, durationMs: Date.now() - started };
  };
  const unteachable = [];
  const shared = { baseItems, earlierItems, targetLanguage, runClaude: agents.runClaude };

  // --- deterministic: what the chapter offers ------------------------------------------------
  const markers = meta?.hints?.numberedBlockMarkers ?? [];
  const blocks = parseNumberedBlocks(chapterHtml, markers);
  const sections = parseHeadings(chapterHtml).map((h) => h.title);
  recordStep(run, {
    step: "blocks",
    status: STEP_STATUS.OK,
    counts: { out: blocks.length },
    artifact: write(unitDir, "candidates/blocks.json", { blocks, sections }),
  });

  // --- the three miners: what the book prints and implies -------------------------------------
  const exercises = pass(() => impl.mineExercises({ chapterFilePath, blocks, ...shared }));
  unteachable.push(...exercises.value.unteachable);
  recordStep(run, {
    step: "exercise-miner",
    role: "exerciseMiner",
    status: STEP_STATUS.OK,
    durationMs: exercises.durationMs,
    counts: { in: blocks.length, out: exercises.value.items.length },
    artifact: write(unitDir, "candidates/exercises.json", exercises.value),
  });

  const drills = pass(() => impl.mineFillInBlanks({ chapterFilePath, ...shared }));
  unteachable.push(...drills.value.unteachable);
  recordStep(run, {
    step: "fill-in-blank-miner",
    role: "fillInBlankMiner",
    status: STEP_STATUS.OK,
    durationMs: drills.durationMs,
    counts: { out: drills.value.items.length },
    artifact: write(unitDir, "candidates/fill-in-blank.json", drills.value),
  });

  const examples = pass(() => impl.mineExampleSentences({ chapterFilePath, sections, ...shared }));
  unteachable.push(...examples.value.unteachable);
  recordStep(run, {
    step: "example-sentence-miner",
    role: "exampleSentenceMiner",
    status: STEP_STATUS.OK,
    durationMs: examples.durationMs,
    counts: { in: sections.length, out: examples.value.items.length },
    artifact: write(unitDir, "candidates/examples.json", examples.value),
  });

  // --- gaps, computed only now: a hole a miner already filled is not a hole --------------------
  const mined = [...exercises.value.items, ...drills.value.items, ...examples.value.items];
  const gaps = computeGaps([...baseItems, ...mined], {
    languageCode: targetLanguage,
    paradigmMisses,
  });
  recordStep(run, {
    step: "gaps",
    status: STEP_STATUS.OK,
    counts: {
      in: baseItems.length + mined.length,
      out: gaps.neverUsed.length + gaps.underExampled.length + (gaps.paradigm?.length ?? 0),
    },
    artifact: write(unitDir, "candidates/gaps.json", gaps),
  });

  const fills = pass(() => impl.authorGapFills({ chapterFilePath, gaps, ...shared }));
  unteachable.push(...fills.value.unteachable);
  recordStep(run, {
    step: "gap-author",
    role: "gapAuthor",
    status: STEP_STATUS.OK,
    durationMs: fills.durationMs,
    counts: {
      in: gaps.neverUsed.length + gaps.underExampled.length,
      out: fills.value.items.length,
    },
    artifact: write(unitDir, "candidates/gap-fills.json", fills.value),
  });

  // --- the inventive author, last, and the only capped role ------------------------------------
  const existing = [...mined, ...fills.value.items];
  const invented = pass(() => impl.authorInventedPractice({ existingItems: existing, ...shared }));
  unteachable.push(...invented.value.unteachable);
  recordStep(run, {
    step: "inventive-author",
    role: "inventiveAuthor",
    status: STEP_STATUS.OK,
    durationMs: invented.durationMs,
    counts: { in: existing.length, out: invented.value.items.length },
    artifact: write(unitDir, "candidates/invented.json", invented.value),
  });

  // --- merge and freeze the baseline -----------------------------------------------------------
  const merged = reconcile(
    [
      exercises.value.items,
      drills.value.items,
      examples.value.items,
      fills.value.items,
      invented.value.items,
    ],
    { languageCode: targetLanguage },
  );
  recordStep(run, {
    step: "reconcile",
    status: STEP_STATUS.OK,
    counts: { in: existing.length + invented.value.items.length, out: merged.items.length },
    artifact: write(unitDir, "corpus.json", {
      meta: {
        targetLanguage,
        sourceType: "epub",
        reviewed: false,
        ...(meta?.unit ?? {}),
        phase: "extras",
      },
      items: merged.items,
    }),
  });

  writeSnapshot(unitDir, { phase: "extras", items: merged.items, provenance: merged.provenance });
  recordStep(run, {
    step: "snapshot",
    status: STEP_STATUS.OK,
    counts: { out: merged.items.length },
    artifact: "as-generated.json",
  });

  finishRun(run, now ? { now } : {});
  return {
    run,
    verdict: verifyRun(run, { unitDir, requiredSteps: REQUIRED_STEPS }),
    items: merged.items,
    provenance: merged.provenance,
    senseCollisions: merged.senseCollisions,
    gaps,
    unfillable: fills.value.unfillable,
    reinvented: invented.value.reinvented,
    allowance: invented.value.allowance,
    unteachable,
  };
}

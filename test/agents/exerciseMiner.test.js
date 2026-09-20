import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ROLE_ID,
  blockLabel,
  renderExerciseMinerPrompt,
  assertBlocksAccountedFor,
  mineExercises,
} from "../../src/agents/exerciseMiner.js";

const BLOCKS = [
  { kind: "EXERCISES", numeral: "I" },
  { kind: "EXERCISES", numeral: "II" },
];
const BASE = [{ target: "これ" }, { target: "は" }, { target: "です" }, { target: "ペン" }];
const stub = (payload) => () => JSON.stringify(payload);

function withChapter(fn) {
  const dir = mkdtempSync(join(tmpdir(), "exercise-miner-"));
  const file = join(dir, "15.xhtml");
  writeFileSync(file, "<h2>EXERCISES</h2>");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ok = {
  items: [
    {
      id: "kore-pen",
      target: "これはペンです",
      english: "This is a pen.",
      category: "Everyday Objects",
    },
  ],
  blocks: [
    { block: "EXERCISES I", mined: 1 },
    { block: "EXERCISES II", mined: 0, note: "listening drill" },
  ],
  skipped: [],
};

test("the prompt carries the approved base vocabulary and the blocks to account for", () => {
  withChapter((file) => {
    const prompt = renderExerciseMinerPrompt({
      chapterFilePath: file,
      blocks: BLOCKS,
      baseItems: BASE,
      targetLanguage: "ja",
    });
    assert.match(prompt, /"target": "ペン"/);
    assert.match(prompt, /EXERCISES II/);
    assert.match(prompt, /first lesson/, "no earlier vocabulary says so in words");
    assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  });
});

test("items are stamped with the role", () => {
  withChapter((file) => {
    const { items } = mineExercises({
      chapterFilePath: file,
      blocks: BLOCKS,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub(ok),
    });
    assert.equal(items[0].producedBy, ROLE_ID);
  });
});

test("a block nobody reached is rejected, so it cannot pass as a block holding nothing", () => {
  withChapter((file) => {
    assert.throws(
      () =>
        mineExercises({
          chapterFilePath: file,
          blocks: BLOCKS,
          baseItems: BASE,
          targetLanguage: "ja",
          runClaude: stub({ ...ok, blocks: [{ block: "EXERCISES I", mined: 1 }] }),
        }),
      /did not account for block\(s\): EXERCISES II/,
    );
  });
});

test("skipping a block for an untaught word counts as accounting for it", () => {
  // Skipping is a correct outcome, and must not be indistinguishable from never reaching the block.
  assert.doesNotThrow(() =>
    assertBlocksAccountedFor(BLOCKS, {
      blocks: [{ block: "EXERCISES I", mined: 2 }],
      skipped: [{ block: "EXERCISES II", reason: "needs でんわばんごう" }],
    }),
  );
});

test("a sentence using an untaught word is REPORTED, never silently dropped", () => {
  withChapter((file) => {
    const { items, unteachable } = mineExercises({
      chapterFilePath: file,
      blocks: BLOCKS,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub({
        ...ok,
        items: [
          ...ok.items,
          { id: "tokei", target: "これはとけいです", english: "This is a watch." },
        ],
      }),
    });
    assert.equal(items.length, 2, "nothing was dropped");
    assert.deepEqual(
      unteachable.map((u) => u.residue),
      ["とけい"],
    );
  });
});

test("blockLabel is one spelling, so the prompt and the check cannot disagree", () => {
  assert.equal(blockLabel({ kind: "EXERCISES", numeral: "III" }), "EXERCISES III");
  assert.equal(blockLabel("WORD POWER I"), "WORD POWER I");
});

test("a chapter with no numbered blocks means no call and no items", () => {
  withChapter((file) => {
    const never = () => assert.fail("must not spawn a model when there are no blocks");
    assert.deepEqual(
      mineExercises({
        chapterFilePath: file,
        blocks: [],
        baseItems: BASE,
        targetLanguage: "ja",
        runClaude: never,
      }),
      { items: [], blocks: [], skipped: [], unteachable: [] },
    );
  });
});

test("a block the miner was NOT given is reported, not thrown, and its items survive", () => {
  // Lesson 17's first live phase-2 run died here. The miner is handed the chapter's NUMBERED blocks
  // (WORD POWER I-II, EXERCISES I-VI); it also named TARGET DIALOGUE, a real section sitting next to
  // them. Refusing over that discarded the miner's whole output and the six agent steps behind it.
  //
  // Naming an adjacent real section is a model reading one section wide, not inventing coverage.
  // The missing-block check is the one that matters and it still throws: a block nobody reached
  // leaves no trace otherwise.
  const blocks = [{ kind: "EXERCISES", numeral: "I", at: 10 }];
  const response = {
    blocks: [{ block: "EXERCISES I" }, { block: "TARGET DIALOGUE" }],
    skipped: [],
  };

  const { reported, unaskedFor } = assertBlocksAccountedFor(blocks, response);
  assert.deepEqual(unaskedFor, ["TARGET DIALOGUE"]);
  assert.equal(reported.length, 2, "the response's own blocks are returned untouched");
});

test("a block it WAS given and never mentioned still throws", () => {
  const blocks = [
    { kind: "EXERCISES", numeral: "I", at: 10 },
    { kind: "EXERCISES", numeral: "II", at: 20 },
  ];
  assert.throws(
    () => assertBlocksAccountedFor(blocks, { blocks: [{ block: "EXERCISES I" }], skipped: [] }),
    /did not account for block\(s\): EXERCISES II/,
  );
});

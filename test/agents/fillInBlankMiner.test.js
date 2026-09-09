import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ROLE_ID,
  UNRESOLVED,
  renderFillInBlankMinerPrompt,
  assertNoUnresolvedSlots,
  frameYield,
  mineFillInBlanks,
} from "../../src/agents/fillInBlankMiner.js";

const BASE = [{ target: "これ" }, { target: "は" }, { target: "です" }, { target: "ペン" }];
const stub = (payload) => () => JSON.stringify(payload);
const ok = {
  items: [
    { id: "a", target: "これはペンです", english: "This is a pen.", category: "Everyday Objects" },
  ],
  frames: [{ frame: "これは〜です", fillers: 6, produced: 3, note: "capped for variety" }],
  skipped: [],
};

function withChapter(fn) {
  const dir = mkdtempSync(join(tmpdir(), "fib-miner-"));
  const file = join(dir, "15.xhtml");
  writeFileSync(file, "<h2>EXERCISES</h2>");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the prompt states the cap and the line against the exercise miner", () => {
  withChapter((file) => {
    const prompt = renderFillInBlankMinerPrompt({
      chapterFilePath: file,
      baseItems: BASE,
      targetLanguage: "ja",
    });
    assert.match(prompt, /At most three per frame/);
    // Matched across a line wrap: prettier reflows the prompt and a single-line regex is brittle.
    assert.match(prompt, /PRINTS,\s+you expand what the book IMPLIES/);
    assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  });
});

test("items are stamped with the role and flagged as drills", () => {
  withChapter((file) => {
    const { items } = mineFillInBlanks({
      chapterFilePath: file,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub(ok),
    });
    assert.equal(items[0].producedBy, ROLE_ID);
    assert.equal(items[0].fillInBlank, true);
  });
});

test("an unresolved slot is REFUSED, not reported, because nobody can study it", () => {
  // Everything else in this pipeline reports and lets a human decide. This one throws: there is no
  // judgement to hand over, since a card holding a blank is unstudiable in every context.
  for (const bad of ["これは___です", "これは（　）です", "これは〜です", "これは…です"]) {
    assert.ok(UNRESOLVED.test(bad), bad);
    assert.throws(() => assertNoUnresolvedSlots([{ id: "x", target: bad }]), /unresolved/);
  }
});

test("a resolved sentence passes the slot check", () => {
  assert.doesNotThrow(() => assertNoUnresolvedSlots([{ id: "a", target: "これはペンです" }]));
});

test("frame yield makes the gap between offered and kept visible rather than implied", () => {
  assert.deepEqual(
    frameYield([{ frame: "これは〜です", fillers: 6, produced: 3, note: "capped" }]),
    [{ frame: "これは〜です", fillers: 6, produced: 3, note: "capped" }],
  );
  // A frame with no counts still appears, so a silent frame is not mistaken for no frame.
  assert.deepEqual(frameYield([{ frame: "x" }]), [
    { frame: "x", fillers: null, produced: 0, note: null },
  ]);
});

test("a sentence using an untaught word is reported, not dropped", () => {
  withChapter((file) => {
    const { items, unteachable } = mineFillInBlanks({
      chapterFilePath: file,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub({
        ...ok,
        items: [...ok.items, { id: "b", target: "これはとけいです", english: "This is a watch." }],
      }),
    });
    assert.equal(items.length, 2);
    assert.deepEqual(
      unteachable.map((u) => u.residue),
      ["とけい"],
    );
  });
});

test("the exercise miner no longer claims substitutions, so the two do not duplicate", async () => {
  const { readFileSync } = await import("fs");
  const exercise = readFileSync("docs/exercise-miner-prompt.md", "utf-8");
  assert.match(exercise, /fill-in-the-blank miner owns those/);
  assert.doesNotMatch(exercise, /\*\*Resolved substitutions\.\*\*/);
});

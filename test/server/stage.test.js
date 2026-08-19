import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  detectStage,
  loadStageData,
  deckStage,
  INCOMPLETE,
} from "../../src/server/adapters/stage.js";

function runDir(setup) {
  const dir = mkdtempSync(join(tmpdir(), "stage-"));
  setup(dir);
  return dir;
}
const corpus = (dir, items) =>
  writeFileSync(
    join(dir, "corpus.json"),
    JSON.stringify({ meta: { targetLanguage: "ja" }, items }),
  );
const cards = (dir, items, meta = {}) =>
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({ meta: { targetLanguage: "ja", ...meta }, items }),
  );

test("detectStage: empty dir → null", () => {
  const dir = runDir(() => {});
  try {
    assert.equal(detectStage(dir), null);
    assert.equal(loadStageData(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: corpus.json only → incomplete (not a review stage)", () => {
  const dir = runDir((d) =>
    corpus(d, [{ id: "a", english: "one", category: "Numbers", target: null }]),
  );
  try {
    assert.equal(detectStage(dir), INCOMPLETE);
    const data = loadStageData(dir);
    assert.equal(data.stage, INCOMPLETE);
    assert.equal(data.sourceFile, "corpus.json");
    assert.equal(data.items.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: cards.json with no audio → corpus (the first review)", () => {
  const dir = runDir((d) => {
    corpus(d, [{ id: "a", english: "one", category: "Numbers", target: "いち" }]);
    cards(d, [
      { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
    ]);
  });
  try {
    assert.equal(detectStage(dir), "corpus");
    assert.equal(loadStageData(dir).sourceFile, "cards.json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const withAudio = [
  { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
  {
    id: "b",
    english: "two",
    category: "Numbers",
    target: "に",
    pronunciation: "ni",
    audio: "b.mp3",
  },
];

test("detectStage: a REVIEWED unit with audio → audio (the second review)", () => {
  const dir = runDir((d) => cards(d, withAudio, { reviewed: true }));
  try {
    assert.equal(detectStage(dir), "audio");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: an UNREVIEWED unit with audio → corpus, not a dead end at gate 2", () => {
  // Reachable from the dashboard's own Unreview button, and from any expansion of a unit that has
  // already been voiced. Audio used to decide the stage on its own, on the reasoning that clips can
  // only exist after a sign-off — true of the CLI, false the moment a human un-reviews. The reviewer
  // was parked at gate 2, where Mark done correctly refuses ("has not passed the corpus review") and
  // the page offers no way to do the corpus review it is demanding.
  const dir = runDir((d) => cards(d, withAudio, { reviewed: false }));
  try {
    assert.equal(detectStage(dir), "corpus");
    assert.equal(loadStageData(dir).items.length, 2, "the clips are kept, only the gate moves");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: a unit with audio and no review flag at all → corpus", () => {
  // Absent is not reviewed. The flag is what the audio CLI stage checks, so the dashboard must read
  // it the same way rather than inferring a sign-off from the artifact.
  const dir = runDir((d) => cards(d, withAudio));
  try {
    assert.equal(detectStage(dir), "corpus");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deckStage: least-advanced stage across units, null when empty", () => {
  assert.equal(deckStage([]), null);
  // An unfinished unit drags the whole deck below its review stages — it ranks under both.
  assert.equal(
    deckStage([{ stage: "audio" }, { stage: INCOMPLETE }, { stage: "corpus" }]),
    INCOMPLETE,
  );
  assert.equal(deckStage([{ stage: "audio" }, { stage: "corpus" }]), "corpus");
  assert.equal(deckStage([{ stage: "audio" }]), "audio");
});

test("scanNumberedUnits keys an extras unit distinctly and sorts it after its base lesson", async () => {
  const { scanNumberedUnits } = await import("../../src/server/adapters/stage.js");
  const { mkdirSync } = await import("fs");
  const dir = mkdtempSync(join(tmpdir(), "scan-extras-"));
  try {
    const unit = (name, meta) => {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(
        join(dir, name, "cards.json"),
        JSON.stringify({
          meta: { targetLanguage: "ja", ...meta },
          items: [
            { id: "x", english: "One", target: "いち", pronunciation: "ichi", category: "Numbers" },
          ],
        }),
      );
    };
    // Deliberately created out of order, and the extras folder shares its base's chapterNumber.
    unit("chapter-1", { chapterNumber: 2, chapterLabel: "Lesson 2" });
    unit("chapter-0-extras", { chapterNumber: 1, chapterLabel: "Lesson 1 Extras" });
    unit("chapter-0", { chapterNumber: 1, chapterLabel: "Lesson 1" });

    const units = scanNumberedUnits(dir, "chapter");
    assert.deepEqual(
      units.map((u) => [u.seq, u.extras, u.label]),
      [
        [0, false, "Lesson 1"],
        ["0-extras", true, "Lesson 1 Extras"],
        [1, false, "Lesson 2"],
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

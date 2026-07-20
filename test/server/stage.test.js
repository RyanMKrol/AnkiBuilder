import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectStage, loadStageData, deckStage } from "../../src/server/adapters/stage.js";

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
const cards = (dir, items) =>
  writeFileSync(join(dir, "cards.json"), JSON.stringify({ meta: { targetLanguage: "ja" }, items }));

test("detectStage: empty dir → null", () => {
  const dir = runDir(() => {});
  try {
    assert.equal(detectStage(dir), null);
    assert.equal(loadStageData(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: corpus.json only → corpus", () => {
  const dir = runDir((d) =>
    corpus(d, [{ id: "a", english: "one", category: "Numbers", target: null }]),
  );
  try {
    assert.equal(detectStage(dir), "corpus");
    const data = loadStageData(dir);
    assert.equal(data.stage, "corpus");
    assert.equal(data.sourceFile, "corpus.json");
    assert.equal(data.items.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: cards.json with no audio → translate", () => {
  const dir = runDir((d) => {
    corpus(d, [{ id: "a", english: "one", category: "Numbers", target: "いち" }]);
    cards(d, [
      { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
    ]);
  });
  try {
    assert.equal(detectStage(dir), "translate");
    assert.equal(loadStageData(dir).sourceFile, "cards.json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectStage: cards.json where any item has audio → audio", () => {
  const dir = runDir((d) =>
    cards(d, [
      { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
      {
        id: "b",
        english: "two",
        category: "Numbers",
        target: "に",
        pronunciation: "ni",
        audio: "b.mp3",
      },
    ]),
  );
  try {
    assert.equal(detectStage(dir), "audio");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deckStage: least-advanced stage across units, null when empty", () => {
  assert.equal(deckStage([]), null);
  assert.equal(
    deckStage([{ stage: "audio" }, { stage: "corpus" }, { stage: "translate" }]),
    "corpus",
  );
  assert.equal(deckStage([{ stage: "audio" }, { stage: "translate" }]), "translate");
  assert.equal(deckStage([{ stage: "audio" }]), "audio");
});

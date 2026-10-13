import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  readFigureTranscriptions,
  renderFiguresBlock,
} from "../../src/agents/figureTranscriptions.js";
import { writeVerdicts, VERDICTS_FILE } from "../../src/agents/imageVerdicts.js";
import { renderFillInBlankMinerPrompt } from "../../src/agents/fillInBlankMiner.js";
import { renderExerciseMinerPrompt } from "../../src/agents/exerciseMiner.js";

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "figures-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FIGURES = [
  {
    src: "../images/p224-3.jpg",
    transcription: "2. スノーボード (circled) / スキー (crossed out)",
  },
];

test("only content-bearing pictures with a transcription are handed on, without the note", () => {
  withDir((dir) => {
    writeVerdicts(dir, [
      {
        src: "../images/p224-3.jpg",
        verdict: "labelled-figure",
        transcription: "  2. スノーボード (circled) / スキー (crossed out) ",
        note: "nothing to card",
      },
      { src: "../images/chart.jpg", verdict: "reference-chart", transcription: "" },
      { src: "../images/banner.jpg", verdict: "decorative", note: "title banner" },
      { src: "../images/smudge.jpg", verdict: "unreadable", transcription: "?" },
    ]);
    const read = readFigureTranscriptions(dir);
    assert.equal(read.source, join(dir, VERDICTS_FILE));
    assert.deepEqual(read.figures, [
      {
        src: "../images/p224-3.jpg",
        verdict: "labelled-figure",
        transcription: "2. スノーボード (circled) / スキー (crossed out)",
      },
    ]);
  });
});

test("an all-decorative chapter is an empty answer, not a missing one", () => {
  withDir((dir) => {
    writeVerdicts(dir, [{ src: "a.jpg", verdict: "decorative" }]);
    assert.deepEqual(readFigureTranscriptions(dir).figures, []);
  });
});

test("no verdicts file, an unreadable one, or no base dir at all fails open to null", () => {
  withDir((dir) => {
    assert.equal(readFigureTranscriptions(dir), null);
    assert.equal(readFigureTranscriptions(null), null);
    writeFileSync(join(dir, VERDICTS_FILE), "{ torn");
    assert.equal(readFigureTranscriptions(dir), null);
  });
});

test("the prompt block lists src and transcription, or says plainly there are none", () => {
  const block = renderFiguresBlock(FIGURES);
  assert.match(block, /"src": "\.\.\/images\/p224-3\.jpg"/);
  assert.match(block, /スノーボード \(circled\)/);
  assert.match(renderFiguresBlock([]), /no figure transcriptions were available/);
  assert.match(renderFiguresBlock(undefined), /no figure transcriptions were available/);
});

test("the fill-in-the-blank and exercise miners' prompts carry the figures and how to use them", () => {
  withDir((dir) => {
    const file = join(dir, "23.xhtml");
    writeFileSync(file, "<h2>EXERCISES</h2>");
    const prompts = [
      renderFillInBlankMinerPrompt({
        chapterFilePath: file,
        baseItems: [],
        targetLanguage: "ja",
        figures: FIGURES,
      }),
      renderExerciseMinerPrompt({
        chapterFilePath: file,
        blocks: [{ kind: "EXERCISES", numeral: "VI" }],
        baseItems: [],
        targetLanguage: "ja",
        figures: FIGURES,
      }),
    ];
    for (const prompt of prompts) {
      assert.match(prompt, /A picture-cued item is answerable from its transcription/);
      assert.match(prompt, /スノーボード \(circled\) \/ スキー \(crossed out\)/);
      assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
    }
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  fillCoverageGaps,
  unfilledGaps,
  renderGapFillerPrompt,
} from "../../src/agents/gapFiller.js";

const GAPS = [
  { target: "あまり…〜ません", english: "Not often", foundIn: "VOCABULARY", confidence: "certain" },
  { target: "としょかん", english: "Library", foundIn: "WORD POWER", confidence: "probable" },
];
const CORPUS = [{ id: "amari", target: "あまり", english: "Not often, not very." }];

const reply = (body) => () => JSON.stringify(body);

test("a filled gap becomes a card credited to this role", () => {
  const out = fillCoverageGaps({
    gaps: GAPS,
    items: CORPUS,
    chapterFilePath: "/tmp/ch.xhtml",
    targetLanguage: "Japanese",
    runClaude: reply({
      items: [
        {
          id: "amari-masen",
          target: "あまり…〜ません",
          english: "Not often, not very.",
          category: "Grammar & Function Words",
          fillsGap: "あまり…〜ません",
        },
      ],
      declined: [{ gap: "としょかん", reason: "chapter-8 already teaches it" }],
    }),
  });

  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].producedBy, "gapFiller");
  assert.equal(out.items[0].aiSuggested, true, "authored, not found in the chapter directly");
  assert.deepEqual(out.declined[0], { gap: "としょかん", reason: "chapter-8 already teaches it" });
  assert.deepEqual(out.unfilled, []);
});

test("a gap neither filled nor declined is REPORTED, not lost", () => {
  // The same rule the gap author now follows: the phase writes this before judging it, so a silent
  // drop is visible rather than reading as "there was nothing to do".
  const out = fillCoverageGaps({
    gaps: GAPS,
    items: CORPUS,
    chapterFilePath: "/tmp/ch.xhtml",
    targetLanguage: "Japanese",
    runClaude: reply({ items: [], declined: [] }),
  });
  assert.deepEqual(out.unfilled, ["あまり…〜ません", "としょかん"]);
});

test("no gaps means no model call: the result to hope for costs nothing", () => {
  let called = false;
  const out = fillCoverageGaps({
    gaps: [],
    items: CORPUS,
    targetLanguage: "Japanese",
    runClaude: () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(called, false);
  assert.equal(out.skipped, true);
});

test("unfilledGaps matches on the gap's own target, verbatim", () => {
  assert.deepEqual(unfilledGaps(GAPS, { items: [{ fillsGap: "としょかん" }], declined: [] }), [
    "あまり…〜ません",
  ]);
});

test("the prompt shows the corpus so a gap that restates a card can be declined", () => {
  const prompt = renderGapFillerPrompt({
    gaps: GAPS,
    items: CORPUS,
    chapterFilePath: "/tmp/ch.xhtml",
    targetLanguage: "Japanese",
  });
  assert.match(prompt, /あまり…〜ません/);
  assert.match(prompt, /"target": "あまり"/, "the existing card is shown");
  assert.match(prompt, /foundIn/, "and where the reader saw the gap");
  assert.ok(!prompt.includes("{{"));
  assert.match(prompt, /irregular/i, "the shared card rules are injected");
});

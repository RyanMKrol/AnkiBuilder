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
  // NOT aiSuggested. The flag means "not from the source", and every gap this role fills was found
  // in the chapter by the coverage adversary — so the book does contain it, the specialists just
  // missed it. On Lesson 17 the old stamp marked 19 cells of a printed conjugation table as model
  // inventions, which tells a reviewer to scrutinise exactly the cards that need it least.
  assert.equal(
    out.items[0].aiSuggested,
    undefined,
    "a gap found in the chapter is not an invention",
  );
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

test("a CARRIED form is stamped aiSuggested, because the book never prints it", () => {
  const out = fillCoverageGaps({
    gaps: [...GAPS, { target: "ねます", english: "Sleep", carriedForm: "dictionary form" }],
    items: CORPUS,
    chapterFilePath: "/tmp/ch.xhtml",
    targetLanguage: "Japanese",
    runClaude: reply({
      items: [
        { id: "neru", target: "ねる", english: "Sleep (dictionary form)", fillsGap: "ねます" },
        { id: "toshokan", target: "としょかん", english: "Library", fillsGap: "としょかん" },
      ],
      declined: [{ gap: "あまり…〜ません", reason: "already carded" }],
    }),
  });
  const [neru, toshokan] = out.items;
  assert.equal(neru.aiSuggested, true);
  assert.match(neru.reviewNote, /dictionary form/);
  assert.equal(toshokan.aiSuggested, undefined, "an ordinary gap is still not an invention");
  assert.deepEqual(out.unfilled, []);
});

test("the prompt tells the filler a carried form is owed, not declined", () => {
  const prompt = renderGapFillerPrompt({
    gaps: GAPS,
    items: CORPUS,
    chapterFilePath: "/tmp/ch.xhtml",
    targetLanguage: "Japanese",
  });
  assert.match(prompt, /A gap with `carriedForm` is not in the chapter, and is still owed/);
  assert.match(prompt, /\(dictionary form\)/);
});

test("a carried form with a computed target overrules a wrong one, keyed so forms stay apart", () => {
  const gaps = [
    { key: "のみます (て-form)", target: "のみます", carriedForm: "て-form", expected: "のんで" },
    {
      key: "のみます (ない-form)",
      target: "のみます",
      carriedForm: "ない-form",
      expected: "のまない",
    },
  ];
  const out = fillCoverageGaps({
    gaps,
    items: CORPUS,
    chapterFilePath: "/tmp/ch.xhtml",
    targetLanguage: "Japanese",
    runClaude: reply({
      items: [
        {
          id: "nonde",
          target: "のみて",
          english: "Drink (て-form of のみます)",
          fillsGap: "のみます (て-form)",
        },
        {
          id: "nomanai",
          target: "のまない",
          english: "Does not drink",
          fillsGap: "のみます (ない-form)",
        },
      ],
      declined: [],
    }),
  });
  const [nonde, nomanai] = out.items;
  assert.equal(nonde.target, "のんで");
  assert.match(nonde.reviewNote, /wrote のみて/);
  assert.equal(nomanai.target, "のまない");
  assert.doesNotMatch(nomanai.reviewNote, /wrote/);
  assert.deepEqual(out.unfilled, []);
});

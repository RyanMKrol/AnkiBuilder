import test from "node:test";
import assert from "node:assert/strict";
import {
  QUESTIONS,
  MODES,
  requiredAnswers,
  unansweredQuestions,
  assertAnswered,
  summarizeTranscripts,
  reviewChapter,
} from "../../src/agents/finalReview.js";
import { ROLES, capabilityRank } from "../../src/agents/roles.js";
import { roleYield } from "../../src/agents/learningPass.js";

const roleYieldOf = (byRole) => roleYield({ byRole });

const answersFor = (mode) =>
  Object.fromEntries(requiredAnswers(mode).map((k) => [k, `answer for ${k}`]));
const fullAnswers = answersFor("chapter");

const respond = (payload) => () => JSON.stringify(payload);

test("the reviewer outranks every role it checks, or its verdict is the weakest link", () => {
  const reviewer = ROLES.finalReview;
  for (const id of reviewer.checks) {
    assert.ok(
      capabilityRank(reviewer) > capabilityRank(ROLES[id]),
      `finalReview must outrank ${id}`,
    );
  }
});

test("the reviewer checks every other role, so nothing produced is unreviewed", () => {
  // Every SPEAKING role. The reading deck's roles (phase "reading") build a different deck kind that
  // this reviewer never sees; the reading adversary checks the reading readers instead.
  const others = Object.keys(ROLES).filter(
    (id) => id !== "finalReview" && ROLES[id].phase !== "reading",
  );
  assert.deepEqual([...ROLES.finalReview.checks].sort(), others.sort());
});

test("a response missing a question is rejected, so silence is not the cheap way out", () => {
  const partial = { answers: { ...fullAnswers } };
  delete partial.answers.untaughtVocabulary;
  assert.deepEqual(unansweredQuestions(partial), ["untaughtVocabulary"]);
  assert.throws(() => assertAnswered(partial), /untaughtVocabulary/);
});

test("an empty-string answer counts as unanswered", () => {
  const blank = { answers: { ...fullAnswers, factualClaims: "   " } };
  assert.deepEqual(unansweredQuestions(blank), ["factualClaims"]);
});

test("a fully answered response with no findings is a legitimate clean result", () => {
  const review = reviewChapter({
    chapterText: "the chapter",
    targetLanguage: "ja",
    runClaude: respond({ answers: fullAnswers, findings: [], verdict: "ready" }),
  });
  assert.equal(review.verdict, "ready");
  assert.deepEqual(review.findings, []);
});

test("the verdict is recomputed from the findings, never taken from the response", () => {
  const review = reviewChapter({
    chapterText: "the chapter",
    targetLanguage: "ja",
    runClaude: respond({
      answers: fullAnswers,
      // Contradicts itself: reports a blocker and then claims the chapter is ready.
      findings: [{ severity: "blocker", area: "extras", summary: "uses an untaught word" }],
      verdict: "ready",
    }),
  });
  assert.equal(review.verdict, "not-ready");
  assert.equal(review.claimedVerdict, "ready");
  assert.equal(review.blockers.length, 1);
});

test("an unknown severity degrades to a note rather than silently counting as a blocker", () => {
  const review = reviewChapter({
    chapterText: "c",
    targetLanguage: "ja",
    runClaude: respond({
      answers: fullAnswers,
      findings: [{ severity: "catastrophe", area: "extras", summary: "something" }],
    }),
  });
  assert.equal(review.findings[0].severity, "note");
  assert.equal(review.verdict, "ready");
});

test("a finding with no summary is dropped, because it names no defect", () => {
  const review = reviewChapter({
    chapterText: "c",
    targetLanguage: "ja",
    runClaude: respond({
      answers: fullAnswers,
      findings: [{ severity: "blocker", area: "extras", summary: "   " }],
    }),
  });
  assert.deepEqual(review.findings, []);
  assert.equal(review.verdict, "ready");
});

test("reviewChapter refuses to run without the chapter, which is its source of truth", () => {
  assert.throws(
    () => reviewChapter({ chapterFilePath: "/nope/missing.xhtml", runClaude: respond({}) }),
    /chapter text/,
  );
});

test("transcripts are truncated per response so one huge log cannot crowd out the chapter", () => {
  const summary = summarizeTranscripts(
    [{ role: "gapAuthor", ok: true, response: "y".repeat(20_000) }],
    { chars: 100 },
  );
  assert.equal(summary[0].responseChars, 20_000);
  assert.equal(summary[0].response.length, 100);
});

test("a failed transcript keeps its error, which is the whole reason failures are logged", () => {
  const summary = summarizeTranscripts([{ role: "gapAuthor", ok: false, error: "bad json" }]);
  assert.equal(summary[0].ok, false);
  assert.equal(summary[0].error, "bad json");
});

test("roleYield ranks the worst keep rate first, which is where a cause is likeliest", () => {
  const report = {
    byRole: {
      minerA: {
        produced: 13,
        kept: 13,
        excludedByScript: [],
        excludedByHuman: [],
        changedSinceGeneration: [],
      },
      author: {
        produced: 50,
        kept: 16,
        excludedByScript: new Array(34).fill({}),
        excludedByHuman: [],
        changedSinceGeneration: [],
      },
      minerB: {
        produced: 11,
        kept: 10,
        excludedByScript: [{}],
        excludedByHuman: [],
        changedSinceGeneration: [],
      },
    },
  };
  const ranked = roleYield(report);
  assert.equal(ranked[0].role, "author");
  assert.equal(ranked[0].kept, 16);
  assert.equal(ranked[0].cutByScript, 34);
  assert.ok(ranked[0].keepRate < 0.35);
  assert.equal(ranked[ranked.length - 1].role, "minerA");
});

test("a role that produced nothing does not sort ahead of one that produced badly", () => {
  // keepRate is null for a zero-produce role; it must not read as a 0% keep rate.
  const ranked = roleYieldOf({
    idle: {
      produced: 0,
      kept: 0,
      excludedByScript: [],
      excludedByHuman: [],
      changedSinceGeneration: [],
    },
    bad: {
      produced: 10,
      kept: 1,
      excludedByScript: [],
      excludedByHuman: [],
      changedSinceGeneration: [],
    },
  });
  assert.equal(ranked[0].role, "bad");
});

test("each mode asks its own questions, because the evidence differs", () => {
  assert.deepEqual([...MODES].sort(), ["base", "chapter"]);
  const base = requiredAnswers("base");
  const chapter = requiredAnswers("chapter");
  // The gate-1 question that only gate 1 can answer, and the one that needs a drill unit.
  assert.ok(base.includes("coverage"), "base must ask what the chapter teaches but nothing cards");
  assert.ok(!base.includes("dominantFrameVerdict"), "a base unit drills nothing");
  assert.ok(chapter.includes("dominantFrameVerdict"));
  assert.ok(!chapter.includes("coverage"), "by gate 3 nothing can be added, so coverage is moot");
});

test("an unknown mode is refused rather than silently defaulting", () => {
  assert.throws(() => requiredAnswers("halfway"), /unknown final-review mode/);
});

test("base mode accepts base answers and records the mode it ran in", () => {
  const review = reviewChapter({
    chapterText: "the chapter",
    targetLanguage: "ja",
    mode: "base",
    runClaude: respond({ answers: answersFor("base"), findings: [] }),
  });
  assert.equal(review.mode, "base");
  assert.equal(review.verdict, "ready");
});

test("answers for the WRONG mode are rejected, not quietly accepted", () => {
  assert.throws(
    () =>
      reviewChapter({
        chapterText: "c",
        targetLanguage: "ja",
        mode: "chapter",
        runClaude: respond({ answers: answersFor("base"), findings: [] }),
      }),
    /dominantFrameVerdict/,
  );
});

test("every question has a non-empty prompt line, or the model is asked nothing", () => {
  for (const mode of MODES) {
    for (const [key, text] of QUESTIONS[mode]) {
      assert.ok(key.length, `${mode} has a question with no key`);
      assert.ok(text.length > 40, `${mode}/${key} has no usable question text`);
    }
  }
});

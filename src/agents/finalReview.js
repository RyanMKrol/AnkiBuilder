// The final review: one Opus pass over a finished chapter, before any audio is paid for.
//
// WHAT THIS IS FOR. Four loops already read this pipeline's output and none of them asks the
// question a human ends up asking anyway. `preflight` computes facts and says so. The coverage
// adversary re-derives the chapter's items and is diffed in code. The learning pass attributes a
// reviewer's edits back to the role that wrote the card. `adversary-learnings` clusters the gaps.
// Every one of them is narrow on purpose, and the thing that fell between them on 2026-09-20 was a
// unit that passed all of them while half its sentences drilled a pattern its chapter does not
// teach. Nothing was wrong with any single card; the SHAPE was wrong, and only reading the chapter
// against the unit reveals that.
//
// WHY IT IS ALLOWED TO BE AN AGENT AT ALL. Because the discriminator is semantic and was measured to
// be so. `src/cards/drillShape.js` records the calibration: the obvious deterministic check fires on
// the units that are RIGHT, because a chapter with one grammar point SHOULD drill it heavily. What
// separates a good concentration from a bad one is whether the dominant frame is the chapter's own
// point, and no arithmetic over cards knows what a chapter teaches.
//
// WHY IT CANNOT PASS BY SAYING NOTHING. This is the standing risk with any reviewing agent and the
// reason this repo prefers checks to prose: a miss and a clean run produce identical output. So the
// prompt asks six fixed questions rather than inviting an opinion, and `assertAnswered` refuses a
// response that left any of them out. An empty `findings` array is a fine result; an unanswered
// question is a failed run. That makes silence expensive instead of free.

import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const FINAL_REVIEW_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "final-review-prompt.md"),
);

export const ROLE_ID = "finalReview";

/**
 * The questions, per mode. A response missing any of its mode's questions is rejected.
 *
 * TWO MODES, because the same six questions are not worth asking twice. At gate 1 the base unit is
 * all that exists and its deadline is absolute: nothing may be added to a lesson after its reviewer
 * signs off, so "does this card everything the chapter teaches" is the most valuable question
 * available and it is only answerable HERE. By the time the extras unit exists that ship has sailed,
 * and the useful question becomes whether the drilling matches what the chapter teaches — which is
 * meaningless at gate 1, since a base unit holds lexical entries and drills nothing.
 *
 * Asking a question the evidence cannot answer is not free: it invites a confident paragraph about
 * nothing, which is exactly the failure mode this role exists to avoid.
 */
export const QUESTIONS = Object.freeze({
  base: [
    [
      "grammarPoints",
      "What does this chapter actually teach? Read the chapter, not the cards. List each grammar point and each vocabulary set in its own words. This is the anchor for every answer below and you must derive it from the chapter alone.",
    ],
    [
      "coverage",
      "Does the base unit card everything the chapter teaches as vocabulary, including anything printed only inside a table, a paradigm or a picture? THIS IS THE MOST IMPORTANT QUESTION AT THIS GATE: nothing may be added to a lesson after its reviewer signs off, so a word missed here is missed permanently. Name anything the chapter teaches that has no card, and say whether it should have one.",
    ],
    [
      "collisions",
      "Does any card in this unit share an English gloss or a target with another card in this unit OR in an earlier lesson, in a way a learner could not resolve? A shared target is the sharper case: two different words spelled identically need a scene on BOTH, because a hint does not render on the Recognition front where that collision bites.",
    ],
    [
      "prematureOrUntaught",
      "Does any card teach something this chapter does not, or something a later lesson owns? Both directions are defects: a card the chapter never taught arrives without its explanation, and a card belonging to a later lesson steals it.",
    ],
    [
      "factualClaims",
      "Are the notes TRUE? Notes assert decompositions, derivations and classifications, and nothing upstream verifies them. A note that misclassifies a form teaches the learner something false with the deck's full authority. Check the ones the deterministic findings name first, then any others you can see.",
    ],
    [
      "transcripts",
      "Does anything in the agent transcripts explain a finding, or reveal a problem the cards alone do not show? Say plainly if the transcripts are absent, which is the case for any unit built before they were recorded — that is missing evidence, not a clean result.",
    ],
  ],
  chapter: [
    [
      "grammarPoints",
      "What does this chapter actually teach? Read the chapter, not the cards. List each grammar point in its own words plus, where the language has one, the concrete sentence ending or pattern a learner would produce. This is the anchor for question 2 and you must derive it from the chapter alone.",
    ],
    [
      "dominantFrameVerdict",
      "You are told which sentence ending dominates the extras unit and by how much. Is that frame one of the grammar points you just listed? A high share is CORRECT when the chapter has one point and the unit drills it; it is a defect only when the unit is concentrated on something the chapter does not teach. Say which this is, and why.",
    ],
    [
      "underDrilled",
      "Which things the chapter teaches are drilled thinly or not at all, and does that matter? Some genuinely do not need a sentence: a fixed greeting is already a sentence. Judge each rather than reporting the list back.",
    ],
    [
      "untaughtVocabulary",
      "Does any shipping sentence use a word or form the deck has not introduced by this chapter? This is the most damaging single defect available, because a card nobody can study looks exactly like one they can. Quote any you find.",
    ],
    [
      "factualClaims",
      "Are the notes TRUE? Notes assert decompositions, derivations and classifications, and nothing upstream verifies them. A note that misclassifies a form teaches the learner something false with the deck's full authority. Check the ones the deterministic findings name first, then any others you can see.",
    ],
    [
      "transcripts",
      "Does anything in the agent transcripts explain a finding, or reveal a problem the cards alone do not show? Say plainly if the transcripts are absent, which is the case for any unit built before they were recorded — that is missing evidence, not a clean result.",
    ],
  ],
});

export const MODES = Object.freeze(Object.keys(QUESTIONS));

/** The answer keys required for a mode. */
export function requiredAnswers(mode = "chapter") {
  const questions = QUESTIONS[mode];
  if (!questions) throw new Error(`unknown final-review mode: ${mode}`);
  return questions.map(([key]) => key);
}

const SCOPE = Object.freeze({
  base:
    "You are reviewing the BASE unit of this chapter, at its corpus gate. The extras unit does not " +
    "exist yet. This is the LAST point at which a card can be added to this lesson: once its " +
    "reviewer signs off, nothing may be added. Weigh your answers accordingly.",
  chapter:
    "You are reviewing this chapter's two finished units, after both corpus gates and BEFORE any " +
    "audio is paid for. Both units are already signed off, so a card cannot be added to either " +
    "without sending it back through its gate — say so explicitly if you think one must be.",
});

function renderQuestions(mode) {
  return QUESTIONS[mode]
    .map(([key, text], index) => `${index + 1}. **\`${key}\`** — ${text}`)
    .join("\n\n");
}

const SEVERITIES = new Set(["blocker", "concern", "note"]);

/**
 * How much of each transcript reaches the prompt.
 *
 * A whole extras run is eleven responses, several of them fifty cards of JSON, and sending all of it
 * verbatim would crowd out the chapter. The head of each response is enough to see its SHAPE, which
 * is what this role reads transcripts for; the parsed output is already in the cards.
 */
const TRANSCRIPT_CHARS = 4000;

export function summarizeTranscripts(logs, { chars = TRANSCRIPT_CHARS } = {}) {
  return logs.map((log) => ({
    role: log.role,
    ok: log.ok,
    model: log.model ?? null,
    durationMs: log.durationMs ?? null,
    error: log.error ?? null,
    responseChars: log.response?.length ?? 0,
    response: (log.response ?? "").slice(0, chars),
  }));
}

export function renderFinalReviewPrompt({
  chapterText,
  baseItems = [],
  extrasItems = null,
  deterministic = {},
  transcripts = [],
  targetLanguage,
  mode = "chapter",
}) {
  if (!QUESTIONS[mode]) throw new Error(`unknown final-review mode: ${mode}`);
  return renderPromptTemplate(FINAL_REVIEW_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    SCOPE: SCOPE[mode],
    QUESTIONS: renderQuestions(mode),
    CHAPTER_TEXT: chapterText,
    BASE_CARDS: JSON.stringify(baseItems, null, 2),
    // An absent extras unit is stated rather than sent as an empty array: "[]" reads as a unit that
    // produced nothing, which is a finding, and this is a unit that does not exist yet.
    EXTRAS_CARDS: extrasItems
      ? ["```json", JSON.stringify(extrasItems, null, 2), "```"].join("\n")
      : "_This chapter has no extras unit yet. It is built after this gate, so its absence is expected and is not a finding._",
    DETERMINISTIC_FINDINGS: JSON.stringify(deterministic, null, 2),
    TRANSCRIPTS: transcripts.length
      ? JSON.stringify(transcripts, null, 2)
      : '"none — this unit was built before agent transcripts were recorded. That is missing evidence, not a clean result."',
  });
}

/** The questions a response left unanswered. Empty is the only acceptable value. */
export function unansweredQuestions(parsed, mode = "chapter") {
  const answers = parsed?.answers ?? {};
  return requiredAnswers(mode).filter((key) => {
    const value = answers[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

/**
 * Refuses a response that skipped a question.
 *
 * Deliberately harsher than the rest of this file's tolerance for imperfect model output, for the
 * reason in the header: an unanswered question is the shape a miss takes, and accepting it would
 * make the six questions decorative.
 */
export function assertAnswered(parsed, mode = "chapter") {
  const missing = unansweredQuestions(parsed, mode);
  if (missing.length) {
    throw new Error(
      `final review left ${missing.length} question(s) unanswered: ${missing.join(", ")}`,
    );
  }
}

function normalizeFindings(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((finding) => finding && typeof finding === "object")
    .map((finding) => ({
      severity: SEVERITIES.has(finding.severity) ? finding.severity : "note",
      area: finding.area ?? "unknown",
      summary: String(finding.summary ?? "").trim(),
      evidence: finding.evidence ?? null,
      suggestion: finding.suggestion ?? null,
    }))
    .filter((finding) => finding.summary.length > 0);
}

/**
 * Runs the final review over one chapter.
 *
 * `verdict` is recomputed here from the findings rather than trusted from the response: a model that
 * reports a blocker and then says "ready" has contradicted itself, and the findings are the part
 * backed by evidence.
 */
export function reviewChapter({
  chapterFilePath,
  chapterText = null,
  baseItems = [],
  extrasItems = null,
  deterministic = {},
  transcripts = [],
  targetLanguage,
  mode = "chapter",
  runClaude,
} = {}) {
  const text =
    chapterText ??
    (chapterFilePath && existsSync(chapterFilePath)
      ? readFileSync(chapterFilePath, "utf-8")
      : null);
  if (!text) throw new Error(`final review needs the chapter text: ${chapterFilePath}`);

  const prompt = renderFinalReviewPrompt({
    chapterText: text,
    baseItems,
    extrasItems,
    deterministic,
    transcripts,
    targetLanguage,
    mode,
  });
  const parsed = JSON.parse(
    extractJsonObjectText(runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {})),
  );
  assertAnswered(parsed, mode);

  const findings = normalizeFindings(parsed.findings);
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  return {
    mode,
    answers: parsed.answers,
    findings,
    blockers,
    verdict: blockers.length ? "not-ready" : "ready",
    claimedVerdict: parsed.verdict ?? null,
    notes: parsed.notes ?? null,
  };
}

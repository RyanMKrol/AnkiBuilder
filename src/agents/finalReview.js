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

/** Every question the prompt asks. A response missing one is rejected rather than reported. */
export const REQUIRED_ANSWERS = Object.freeze([
  "grammarPoints",
  "dominantFrameVerdict",
  "underDrilled",
  "untaughtVocabulary",
  "factualClaims",
  "transcripts",
]);

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
  extrasItems = [],
  deterministic = {},
  transcripts = [],
  targetLanguage,
}) {
  return renderPromptTemplate(FINAL_REVIEW_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_TEXT: chapterText,
    BASE_CARDS: JSON.stringify(baseItems, null, 2),
    EXTRAS_CARDS: JSON.stringify(extrasItems, null, 2),
    DETERMINISTIC_FINDINGS: JSON.stringify(deterministic, null, 2),
    TRANSCRIPTS: transcripts.length
      ? JSON.stringify(transcripts, null, 2)
      : '"none — this unit was built before agent transcripts were recorded. That is missing evidence, not a clean result."',
  });
}

/** The questions a response left unanswered. Empty is the only acceptable value. */
export function unansweredQuestions(parsed) {
  const answers = parsed?.answers ?? {};
  return REQUIRED_ANSWERS.filter((key) => {
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
export function assertAnswered(parsed) {
  const missing = unansweredQuestions(parsed);
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
  extrasItems = [],
  deterministic = {},
  transcripts = [],
  targetLanguage,
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
  });
  const parsed = JSON.parse(
    extractJsonObjectText(runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {})),
  );
  assertAnswered(parsed);

  const findings = normalizeFindings(parsed.findings);
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  return {
    answers: parsed.answers,
    findings,
    blockers,
    verdict: blockers.length ? "not-ready" : "ready",
    claimedVerdict: parsed.verdict ?? null,
    notes: parsed.notes ?? null,
  };
}

import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";

// The flagged pages, checked by a model instead of by a person.
//
// The OCR cross-check is free and catches things nothing else can, but on a real book it flags a
// fifth of the pages (51 of 265 on Genki) and almost every flag is the OCR's own mistake. A check
// nobody reads is worse than no check, so each flagged page gets one call that sees the page image,
// the transcript and the SPECIFIC disagreements, and answers only about those.
//
// It returns exact find-and-replace swaps rather than a rewritten page, and each swap is checked
// mechanically before it is applied: the text must occur exactly once, and the whole audit may only
// change a small number of characters. An auditor cannot quietly re-transcribe a page it was asked
// to spot-check, which is the failure mode that made the settle pass need its own guard.

const TEMPLATE = resolve(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "remaster-audit-prompt.md"),
);

const VERDICTS = new Set(["transcript-correct", "transcript-wrong", "unclear"]);

// A spot-check fixes a word, a line, a reading. Beyond this many characters it is rewriting the
// page, which is not what it was asked to do and not what its evidence supports.
const MAX_CHANGED_CHARS = 200;

/** The check's findings for one page, as the lines an auditor is asked about. */
export function describeDisagreements(check) {
  const lines = [];
  if (check.onlyInOcr) {
    lines.push(`- Characters the OCR saw that the transcript does not have: ${check.onlyInOcr}`);
  }
  if (check.onlyInTranscript) {
    lines.push(`- Characters only the transcript has: ${check.onlyInTranscript}`);
  }
  if (check.wordsOnlyInOcr) {
    lines.push(`- Words the OCR saw that the transcript does not have: ${check.wordsOnlyInOcr}`);
  }
  if (check.wordsOnlyInTranscript) {
    lines.push(`- Words only the transcript has: ${check.wordsOnlyInTranscript}`);
  }
  for (const line of check.missingLines ?? []) {
    lines.push(
      `- A line the OCR read (about ${Math.round(line.fromTop * 100)}% down the page) that the ` +
        `transcript does not contain: "${line.text}"`,
    );
  }
  for (const gap of check.numberingGaps ?? []) {
    lines.push(`- A gap in numbered items: ${gap}`);
  }
  return lines.join("\n");
}

export function renderAuditPrompt({ imagePath, bookTitle, pageNumber, transcript, check }) {
  return renderPromptTemplate(TEMPLATE, {
    IMAGE_PATH: resolve(imagePath),
    BOOK_TITLE: bookTitle ?? "(untitled)",
    PAGE_NUMBER: String(pageNumber),
    DISAGREEMENTS: describeDisagreements(check),
    TRANSCRIPT: transcript,
  });
}

export function parseAudit(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  if (!VERDICTS.has(parsed.verdict)) {
    throw new Error(`unknown verdict "${parsed.verdict}"`);
  }
  const corrections = Array.isArray(parsed.corrections) ? parsed.corrections : [];
  for (const correction of corrections) {
    if (typeof correction?.find !== "string" || typeof correction?.replace !== "string") {
      throw new Error("a correction needs a string find and a string replace");
    }
  }
  return {
    verdict: parsed.verdict,
    reason: String(parsed.reason ?? "").trim(),
    corrections: parsed.verdict === "transcript-wrong" ? corrections : [],
  };
}

/**
 * Applies an audit's corrections to a page body. Returns `{ body, applied, problems }`; when
 * `problems` is non-empty nothing is applied and the page is left exactly as it was.
 */
export function applyCorrections(body, corrections, { maxChangedChars = MAX_CHANGED_CHARS } = {}) {
  const problems = [];
  let out = body;
  let changed = 0;
  for (const { find, replace } of corrections) {
    if (!find) {
      problems.push("a correction has an empty find");
      continue;
    }
    const occurrences = out.split(find).length - 1;
    if (occurrences !== 1) {
      problems.push(
        `"${find.slice(0, 40)}…" occurs ${occurrences} time(s) in the transcript, so the swap is ` +
          `not unique`,
      );
      continue;
    }
    out = out.replace(find, replace);
    changed += Math.max(find.length, replace.length);
  }
  if (changed > maxChangedChars) {
    problems.push(
      `the corrections change ${changed} characters, past the ${maxChangedChars} a spot-check may: ` +
        `this is a rewrite, not a fix`,
    );
  }
  if (problems.length) return { body, applied: 0, problems };
  return { body: out, applied: corrections.length, problems: [] };
}

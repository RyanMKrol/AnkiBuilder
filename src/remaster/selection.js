import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { ocrLinesTopDown } from "./visionOcr.js";

// Which of a book's study units become chapters of the converted book.
//
// The outline says what the book contains. This step says what is worth building, and it lives in
// the conversion, not in the deck pipeline, because it is a judgement about the book as a whole and
// the pipeline only ever sees one chapter at a time. The case that forced it: Genki's second half
// (Reading and Writing) teaches the kanji of words the first half already taught, so every one of
// its cards would look "already taught" to the backward dedup. Whether to convert such a part is a
// trade-off, and the person who studies the deck makes it.
//
// So an agent recommends and the owner decides. The recommendation (include, exclude, or ask, with
// a category, a reason and the units it overlaps) is kept beside the owner's decision in
// selection.json, and nothing is transcribed or built while any unit is undecided.

const TEMPLATE = resolve(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "remaster-select-prompt.md"),
);

const RECOMMENDATIONS = new Set(["include", "exclude", "ask"]);
const CATEGORIES = new Set([
  "core-lesson",
  "kana",
  "kanji-and-reading",
  "reference",
  "practice-only",
  "other",
]);
// How much of each unit the agent sees: its first pages' OCR, capped. Enough to tell what a unit
// is for; the whole book would not fit and is not needed to judge purpose.
const SAMPLE_PAGES = 2;
const SAMPLE_CHARS = 1200;

/** The outline entries a selection is about: everything the outline calls a study unit. */
export function candidateUnits(outline) {
  return outline.entries.filter((entry) => entry.kind === "lesson");
}

export function renderSelectPrompt({ bookTitle, outline, ocrByPage, purpose }) {
  const units = candidateUnits(outline).map((entry) => {
    const pages = [];
    for (
      let p = entry.firstPage;
      p <= Math.min(entry.lastPage, entry.firstPage + SAMPLE_PAGES - 1);
      p++
    ) {
      pages.push(
        ocrLinesTopDown(ocrByPage.get(p))
          .map((line) => line.text)
          .join("\n"),
      );
    }
    const sample = pages.join("\n").slice(0, SAMPLE_CHARS);
    const count = entry.lastPage - entry.firstPage + 1;
    return `### entry ${entry.number}: ${entry.label} (${count} page(s))\n\n${sample}`;
  });
  return renderPromptTemplate(TEMPLATE, {
    BOOK_TITLE: bookTitle ?? "(untitled)",
    PURPOSE: purpose.title,
    PURPOSE_CRITERIA: purpose.criteria,
    UNITS: units.join("\n\n"),
  });
}

/**
 * Parses and checks the agent's answer: one verdict for every study unit, each with a known
 * recommendation and category. Returns the selection record with every `decision` still null,
 * because only the owner fills that in (applyDecisions).
 */
export function parseSelection(raw, { outline, purpose }) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  const units = candidateUnits(outline);
  const byEntry = new Map((parsed.units ?? []).map((u) => [u.entry, u]));
  const problems = [];
  for (const entry of units) {
    const unit = byEntry.get(entry.number);
    if (!unit) {
      problems.push(`no verdict for entry ${entry.number} ("${entry.label}")`);
      continue;
    }
    if (!RECOMMENDATIONS.has(unit.recommendation)) {
      problems.push(`entry ${entry.number}: unknown recommendation "${unit.recommendation}"`);
    }
    if (!CATEGORIES.has(unit.category)) {
      problems.push(`entry ${entry.number}: unknown category "${unit.category}"`);
    }
  }
  const known = new Set(units.map((u) => u.number));
  for (const n of byEntry.keys()) {
    if (!known.has(n)) problems.push(`a verdict for entry ${n}, which is not a study unit`);
  }
  if (problems.length) {
    throw new Error(`the selection is not usable:\n  - ${problems.join("\n  - ")}`);
  }
  return {
    // Which purpose these decisions are for (purpose.js); one selection file per purpose.
    purpose: purpose?.name ?? null,
    summary: parsed.summary ?? "",
    units: units.map((entry) => {
      const unit = byEntry.get(entry.number);
      return {
        entry: entry.number,
        label: entry.label,
        recommendation: unit.recommendation,
        category: unit.category,
        overlapsWith: Array.isArray(unit.overlapsWith) ? unit.overlapsWith : [],
        reason: unit.reason ?? "",
        decision: null,
        decidedAt: null,
      };
    }),
  };
}

/**
 * Records the owner's decisions. `acceptRecommendations` takes every include/exclude as given;
 * `include` and `exclude` (entry numbers) override single units, and are the only way to settle a
 * unit the agent marked `ask`. Returns a new record; units left undecided keep `decision: null`.
 */
export function applyDecisions(
  selection,
  { acceptRecommendations = false, include = [], exclude = [], now = new Date().toISOString() },
) {
  const both = include.filter((n) => exclude.includes(n));
  if (both.length) throw new Error(`entry ${both.join(", ")} is both included and excluded`);
  const known = new Set(selection.units.map((u) => u.entry));
  const unknown = [...include, ...exclude].filter((n) => !known.has(n));
  if (unknown.length) throw new Error(`not a study unit in this selection: ${unknown.join(", ")}`);
  return {
    ...selection,
    units: selection.units.map((unit) => {
      let decision = unit.decision;
      if (acceptRecommendations && unit.recommendation !== "ask" && decision === null) {
        decision = unit.recommendation;
      }
      if (include.includes(unit.entry)) decision = "include";
      if (exclude.includes(unit.entry)) decision = "exclude";
      return decision === unit.decision ? unit : { ...unit, decision, decidedAt: now };
    }),
  };
}

export function undecided(selection) {
  return selection.units.filter((unit) => unit.decision === null);
}

/** The entry numbers the owner chose to convert, or null when there is no selection yet. */
export function includedEntries(selection) {
  if (!selection) return null;
  return new Set(selection.units.filter((u) => u.decision === "include").map((u) => u.entry));
}

export function formatSelection(selection) {
  const lines = [];
  if (selection.summary) lines.push(selection.summary, "");
  for (const unit of selection.units) {
    const decided = unit.decision ? `decided: ${unit.decision}` : "UNDECIDED";
    const overlaps = unit.overlapsWith.length ? ` (overlaps ${unit.overlapsWith.join(", ")})` : "";
    lines.push(
      `[${String(unit.entry).padStart(2)}] ${unit.recommendation.toUpperCase().padEnd(7)} ` +
        `${unit.category.padEnd(17)} ${decided.padEnd(17)} ${unit.label}${overlaps}`,
    );
    lines.push(`       ${unit.reason}`);
  }
  return lines;
}

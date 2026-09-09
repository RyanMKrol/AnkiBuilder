// Fills the holes the coverage adversary found, instead of reporting them.
//
// WHY THIS EXISTS. The adversary enumerates the chapter independently and a set operation in code
// diffs that against the corpus. That machinery worked from the first run: on chapter 9 it found 48
// items the corpus lacked, including two paired constructions (あまり…〜ません, ぜんぜん…〜ません)
// that the specialists had carded only as bare adverbs, losing the pairing that makes them usable.
//
// And nothing consumed any of it. `candidates/coverage.json` was written, a line was printed
// suggesting somebody read it, and no code path anywhere opened the file. The most expensive role in
// phase 1 produced findings into a file nobody opens, which is the exact failure this project names
// as its signature: an absent thing looks exactly like a working one.
//
// The owner's ruling, 2026-09-08: the adversary should FILL the gaps, not surface them. A review is
// a light human check that nothing is missing, not a worklist of holes to chase.
//
// WHY IT IS A SEPARATE ROLE FROM THE ADVERSARY. The adversary must never see the corpus: a list
// written after reading someone else's answer agrees with it, and that independence is the whole
// reason the diff means anything. This role sees everything — the gaps, the corpus, the chapter —
// because its job is the opposite one. Splitting them keeps the enumeration honest and lets the
// filling be informed.
//
// WHY IT MAY DECLINE. Not every gap is a card. An earlier chapter may already teach the word, it may
// be a sentence belonging to the extras unit, or it may be a name the chapter never taught. But the
// default is to FILL: an unfilled gap is a card that does not get made, and nobody reads the file.

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { CATEGORIES } from "../model/categories.js";
import { describeScheme } from "../cards/inflectionSchemes.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const GAP_FILLER_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "gap-filler-prompt.md"),
);

export const ROLE_ID = "gapFiller";

/**
 * The artifact the phase writes: what was filled, what was declined, and why.
 *
 * Named for COVERAGE rather than "gap-fills", because phase 2 has a different gap author writing
 * `candidates/gap-fills.json` into its own unit dir, and two files with one name in sibling
 * directories is a trap for whoever reads them next.
 */
export const GAP_FILLS_FILE = "candidates/coverage-fills.json";

/** The corpus as the prompt sees it: enough to recognise a duplicate, and nothing more. */
function corpusForPrompt(items) {
  return (items ?? [])
    .filter((i) => !i.excluded)
    .map((i) => ({ target: i.target ?? null, english: i.english ?? null }));
}

export function renderGapFillerPrompt({ gaps, items, chapterFilePath, targetLanguage }) {
  return renderPromptTemplate(GAP_FILLER_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    CORPUS_JSON: JSON.stringify(corpusForPrompt(items), null, 2),
    GAPS_JSON: JSON.stringify(gaps ?? [], null, 2),
    CATEGORY_LIST: CATEGORIES.join(", "),
    INFLECTION_SCHEME: describeScheme(targetLanguage),
  });
}

/**
 * The gaps a response neither filled nor declined.
 *
 * Reported rather than thrown, and written before it is judged: the gap author's guard used to throw
 * straight after parsing, and a real run failed with a count and no artifact to say why.
 */
export function unfilledGaps(gaps, { items = [], declined = [] } = {}) {
  const filled = new Set(items.map((i) => i.fillsGap).filter(Boolean));
  const refused = new Set(declined.map((d) => d.gap).filter(Boolean));
  return (gaps ?? [])
    .map((g) => g.target)
    .filter(Boolean)
    .filter((target) => !filled.has(target) && !refused.has(target));
}

/**
 * Fills what it can. Returns `{ items, declined, unfilled, skipped }`.
 *
 * `items` carry `producedBy` and `aiSuggested`, so the reconciler credits them and the reviewer can
 * see which cards came from here rather than from a specialist reading the chapter directly.
 *
 * Costs nothing when the adversary found no gaps, which is the result to hope for.
 */
export function fillCoverageGaps({
  gaps,
  items = [],
  chapterFilePath,
  targetLanguage,
  runClaude,
} = {}) {
  if (!gaps || gaps.length === 0) {
    return { items: [], declined: [], unfilled: [], skipped: true };
  }

  const raw = runRole(
    ROLE_ID,
    renderGapFillerPrompt({ gaps, items, chapterFilePath, targetLanguage }),
    runClaude ? { runClaude } : {},
  );
  const parsed = JSON.parse(extractJsonObjectText(raw));

  const filled = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
    aiSuggested: true,
  }));
  const declined = Array.isArray(parsed.declined) ? parsed.declined : [];

  return {
    items: filled,
    declined,
    unfilled: unfilledGaps(gaps, { items: filled, declined }),
    skipped: false,
  };
}

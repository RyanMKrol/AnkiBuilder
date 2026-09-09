// The coverage adversary: an independent enumeration of the chapter, diffed against the corpus in
// code.
//
// WHY IT IS NOT ASKED "WHAT DID THEY MISS". Asked directly whether something is absent from a
// document, a reader performs at close to chance, because absence has no text to attend to. Asked to
// enumerate a source independently, the same reader does well, and comparing the two lists finds the
// gaps reliably. So this role produces a LIST and `findGaps` does the comparison in JavaScript.
// Absence detection is a set operation, and a set operation belongs in code.
//
// WHY IT IS SHOWN NEITHER THE CORPUS NOR THE OTHER PROMPTS. A list written after reading someone
// else's answer agrees with it. Withholding both is what keeps this an independent sample rather
// than a review, and it is why the role is pinned above the roles it checks: noticing an omission is
// harder than producing content, and a checker drawn from the same family as its generator leans
// toward approving it.
//
// WHAT IT IS NOT. It does not decide anything. Its output is candidate gaps for a human to read at
// the review gate, and `confidence` travels with each one so a reviewer can start where the evidence
// is strongest. A gap it reports may be a word the corpus deliberately excluded.

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { diffItemSets } from "../cards/itemSetDiff.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const COVERAGE_ADVERSARY_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "coverage-adversary-prompt.md"),
);

export const ROLE_ID = "coverageAdversary";

/** The artifact the phase writes, and the gate checks for. */
export const COVERAGE_FILE = "candidates/coverage.json";

const NO_IMAGES = "(this chapter references no images)";

/**
 * The prompt for one chapter.
 *
 * It takes the chapter path and the image paths and NOTHING derived from the corpus. That absence is
 * a property of the function, not a habit of its callers: there is no parameter here that could
 * carry the other roles' output even by accident.
 */
export function renderCoverageAdversaryPrompt({
  chapterFilePath,
  imagePaths = [],
  targetLanguage,
}) {
  return renderPromptTemplate(COVERAGE_ADVERSARY_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    IMAGE_COUNT: String(imagePaths.length),
    IMAGE_PATHS: imagePaths.length ? ["```", ...imagePaths, "```"].join("\n") : NO_IMAGES,
  });
}

/**
 * Runs the enumeration. Returns `{ items, coverage }`.
 *
 * Deliberately takes no corpus argument. A caller that wants the gaps calls `findGaps` afterwards.
 */
export function enumerateChapter({
  chapterFilePath,
  imagePaths = [],
  targetLanguage,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(`coverage adversary needs a chapter file that exists: ${chapterFilePath}`);
  }
  const prompt = renderCoverageAdversaryPrompt({ chapterFilePath, imagePaths, targetLanguage });
  const raw = runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {});
  const parsed = JSON.parse(extractJsonObjectText(raw));
  return {
    items: Array.isArray(parsed.items) ? parsed.items : [],
    coverage: parsed.coverage ?? null,
  };
}

/**
 * What the enumeration found that the corpus does not have.
 *
 * The comparison is `diffItemSets` with the ENUMERATION as the reference, so its `missing` is
 * exactly "enumerated, and not produced". Same matcher as the reconciler and the eval fixtures, so
 * three callers cannot drift apart on what counts as the same item.
 *
 * `extra` is returned too, and it is not noise: an item the corpus has and the adversary did not
 * enumerate is either a legitimate addition the roles made or a sign the adversary read short, and
 * both are worth a glance before trusting the gap list.
 */
export function findGaps(enumerated, corpusItems, { languageCode } = {}) {
  const diff = diffItemSets(enumerated, corpusItems ?? [], { languageCode });
  return {
    gaps: diff.missing,
    onlyInCorpus: diff.extra,
    counts: {
      enumerated: enumerated.length,
      corpus: (corpusItems ?? []).length,
      matched: diff.counts.matched,
      gaps: diff.missing.length,
    },
  };
}

/**
 * The artifact body the phase writes to `candidates/coverage.json`.
 *
 * It records the gaps AND the counts that produced them, because a gap list with no denominator
 * cannot be judged: "four gaps" means something different against an enumeration of twelve than
 * against one of two hundred.
 */
export function buildCoverageArtifact({ coverage, gaps }) {
  return {
    role: ROLE_ID,
    capturedAt: new Date().toISOString(),
    counts: gaps.counts,
    coverage,
    gaps: gaps.gaps,
    onlyInCorpus: gaps.onlyInCorpus,
  };
}

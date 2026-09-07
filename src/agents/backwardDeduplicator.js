// Judges whether a new unit's cards repeat what an earlier unit already taught.
//
// WHAT IT REPLACES, AND WHAT IT DOES NOT. `dedupBackward` (src/corpus/epubDedup.js) still runs in
// `assemble` and still compares exact strings against the reviewed-corpus library. This does not
// remove it: an exact match is worth flagging and costs nothing to find. What this adds is the half
// exact matching cannot reach, and the half the library cannot see.
//
// THE LIBRARY'S BLIND SPOT, precisely. It is keyed `(epubHash, chapterNumber)`, and an `-extras` unit
// shares its base unit's chapter number, so writing one would overwrite the base chapter's entry.
// The code refuses, a FAIL-tier check enforces it, and the result is that extras content never
// enters the library at all. On the live book that is 1,163 targets a new chapter cannot see, next
// to the 1,176 it can. This role is handed every earlier unit's items directly, so the storage key
// never comes into it.
//
// IT FLAGS, IT NEVER REMOVES. That is `dedupBackward`'s existing philosophy and it is right: a word
// deliberately re-taught in a new grammatical role is a legitimate card, and only a human reading
// both can say. An `already-taught` verdict sets `uncertain` and appends a review note naming the
// earlier unit, which is exactly what the string matcher already does for the cases it can find.

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import {
  findBackwardCandidates,
  describeCandidatesForPrompt,
} from "../cards/backwardCandidates.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const BACKWARD_DEDUPLICATOR_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "backward-deduplicator-prompt.md"),
);

export const ROLE_ID = "backwardDeduplicator";

/** The artifact the phase writes. */
export const BACKWARD_FILE = "candidates/backward.json";

export function renderBackwardDeduplicatorPrompt({ candidates, targetLanguage }) {
  return renderPromptTemplate(BACKWARD_DEDUPLICATOR_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CANDIDATES_JSON: JSON.stringify(describeCandidatesForPrompt(candidates), null, 2),
  });
}

const CONCERN = "Possibly already taught";

/** Appends a concern without discarding whatever the card already said. */
function noteWith(existing, reason) {
  const concern = `${CONCERN} — ${reason}`;
  return existing ? `${existing} | ${concern}` : concern;
}

/**
 * Applies verdicts, returning `{ items, flagged, cleared, unaccounted }`.
 *
 * Validated against the candidate list rather than trusted, for the same reason the semantic
 * deduplicator validates its own: a verdict for a candidate that was not raised is a parse error,
 * and acting on it would annotate a card nobody asked about.
 */
export function applyBackwardVerdicts(items, candidates, verdicts) {
  const byCandidate = new Map((verdicts ?? []).map((v) => [v.candidate, v]));
  const flagged = [];
  const cleared = [];
  const unaccounted = [];

  candidates.forEach((candidate, index) => {
    const verdict = byCandidate.get(index + 1);
    if (!verdict) {
      unaccounted.push({ candidate: index + 1, id: candidate.item.id, reason: "no verdict" });
      return;
    }
    if (verdict.verdict === "new") {
      cleared.push({ id: candidate.item.id, reason: verdict.reason ?? null });
      return;
    }
    if (verdict.verdict !== "already-taught") {
      unaccounted.push({
        candidate: index + 1,
        id: candidate.item.id,
        reason: `unknown verdict "${verdict.verdict}"`,
      });
      return;
    }
    const reason = verdict.reason || "an earlier unit teaches this";
    candidate.item.uncertain = true;
    candidate.item.reviewNote = noteWith(candidate.item.reviewNote, reason);
    flagged.push({
      id: candidate.item.id,
      reason,
      priorUnits: [...new Set(candidate.matches.map((m) => m.prior.__unit).filter(Boolean))],
    });
  });

  return { items, flagged, cleared, unaccounted };
}

/**
 * Judges one unit against everything earlier. Returns
 * `{ items, candidates, flagged, cleared, unaccounted, skipped }`.
 *
 * Costs nothing when the filter raises nothing, which is the common case for a chapter of genuinely
 * new vocabulary.
 */
export function deduplicateAgainstEarlier({
  items,
  earlierItems,
  targetLanguage,
  languageCode,
  skipExactMatches = false,
  runClaude = (prompt) => runRole(ROLE_ID, prompt),
} = {}) {
  const candidates = findBackwardCandidates(items ?? [], earlierItems ?? [], {
    languageCode,
    skipExactMatches,
  });
  if (candidates.length === 0) {
    return { items, candidates, flagged: [], cleared: [], unaccounted: [], skipped: true };
  }
  const raw = runClaude(renderBackwardDeduplicatorPrompt({ candidates, targetLanguage }));
  const parsed = JSON.parse(extractJsonObjectText(raw));
  return {
    ...applyBackwardVerdicts(items, candidates, parsed.candidates),
    candidates,
    skipped: false,
  };
}

// The semantic deduplicator: decides which of a corpus's look-alike items are actually one card.
//
// WHY THIS ROLE EXISTS AT ALL. Every other agent in this pipeline is a PRODUCER: it finds content or
// authors it. Reconciliation, the one place where "is this the same as that?" gets asked, was a
// script comparing normalised strings. On the first live phase-1 run that put 19 duplicate items
// into an 83-item corpus, all of them a target already present, differing only in whether the gloss
// used a comma or a semicolon.
//
// That is not a tuning failure in the key. `reconcile` merges on target AND gloss precisely so that
// はし (bridge) and はし (chopsticks) cannot collapse into one card, and no normalisation separates
// "Watch, clock." from "Watch; clock." while keeping "Bridge" apart from "Chopsticks". The question
// is semantic, so under this project's own rule it belongs to an agent and not to a regex.
//
// WHY IT IS PINNED ABOVE THE PRODUCERS. It judges their output, and it can DELETE. A checker drawn
// from the same family as its generator leans toward approving that generator's work, and the cost
// here is asymmetric in the other direction too: a wrong `duplicate` verdict removes a card nobody
// will notice is gone.
//
// WHY IT EXCLUDES RATHER THAN DELETES. `excluded: true` with `excludedBy: "semantic-dedup"` is the
// existing reversible idiom. The card stays in the file, the reviewer sees why it went, and the
// learning pass can tell a script's exclusion from a human's.
//
// WHY IT RUNS AFTER THE SNAPSHOT. The snapshot is the pre-review baseline, so anything this role
// removes shows up in the learning pass as "cut by script" rather than never having existed. If it
// ran first, its work would be invisible to the one mechanism built to audit what the pipeline does
// to a corpus between generation and review.

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { findDuplicateCandidates, describeGroupsForPrompt } from "../cards/dedupGroups.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const SEMANTIC_DEDUPLICATOR_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "semantic-deduplicator-prompt.md"),
);

export const ROLE_ID = "semanticDeduplicator";

/** The artifact the phase writes, so the verdicts survive the run that made them. */
export const DEDUP_FILE = "candidates/dedup.json";

export function renderSemanticDeduplicatorPrompt({ groups, targetLanguage }) {
  return renderPromptTemplate(SEMANTIC_DEDUPLICATOR_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    GROUPS_JSON: JSON.stringify(describeGroupsForPrompt(groups), null, 2),
  });
}

/**
 * Applies verdicts to items, returning `{ items, excluded, distinct, unaccounted }`.
 *
 * VALIDATED AGAINST THE GROUPS, not trusted. A verdict naming an id outside its group, or dropping
 * every member, is discarded with the group left intact: this role can delete, so a malformed answer
 * must cost nothing rather than cost a card. `unaccounted` names the groups whose verdict was
 * missing or unusable, so a silent no-op is visible instead of reading as "no duplicates found".
 */
export function applyVerdicts(items, groups, verdicts, { languageCode } = {}) {
  const byGroup = new Map((verdicts ?? []).map((v) => [v.group, v]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const excluded = [];
  const distinct = [];
  const unaccounted = [];

  groups.forEach((group, index) => {
    const verdict = byGroup.get(index + 1);
    const ids = new Set(group.items.map((i) => i.id));

    if (!verdict) {
      unaccounted.push({ group: index + 1, key: group.key, reason: "no verdict returned" });
      return;
    }
    if (verdict.verdict === "distinct") {
      distinct.push({ key: group.key, ids: [...ids], reason: verdict.reason ?? null });
      return;
    }
    if (verdict.verdict !== "duplicate") {
      unaccounted.push({
        group: index + 1,
        key: group.key,
        reason: `unknown verdict "${verdict.verdict}"`,
      });
      return;
    }

    const drop = (verdict.drop ?? []).filter((id) => ids.has(id));
    const keep = ids.has(verdict.keep) ? verdict.keep : null;
    // Every member must be accounted for, and something must survive. A group that drops everything
    // is a parse error wearing a verdict's clothes.
    if (!keep || drop.length === 0 || drop.includes(keep) || drop.length !== ids.size - 1) {
      unaccounted.push({
        group: index + 1,
        key: group.key,
        reason: `verdict does not account for the group's ${ids.size} member(s)`,
      });
      return;
    }

    for (const id of drop) {
      const item = byId.get(id);
      if (!item || item.excluded) continue;
      item.excluded = true;
      item.excludedBy = "semantic-dedup";
      item.excludedReason = verdict.reason || `duplicate of ${keep}`;
      excluded.push({ id, keep, reason: item.excludedReason });
    }
  });

  return { items, excluded, distinct, unaccounted, languageCode };
}

/**
 * Judges one corpus. Returns `{ items, groups, excluded, distinct, unaccounted, skipped }`.
 *
 * Costs nothing when there is nothing to judge: a corpus with no look-alike groups skips the call
 * entirely rather than paying an Opus round trip to be told so.
 */
export function deduplicateCorpus({
  items,
  targetLanguage,
  languageCode,
  runClaude = (prompt) => runRole(ROLE_ID, prompt),
} = {}) {
  const groups = findDuplicateCandidates(items ?? [], languageCode);
  if (groups.length === 0) {
    return { items, groups, excluded: [], distinct: [], unaccounted: [], skipped: true };
  }
  const raw = runClaude(renderSemanticDeduplicatorPrompt({ groups, targetLanguage }));
  const parsed = JSON.parse(extractJsonObjectText(raw));
  return {
    ...applyVerdicts(items, groups, parsed.groups, { languageCode }),
    groups,
    skipped: false,
  };
}

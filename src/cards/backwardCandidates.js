// Which of a new unit's cards MIGHT already be taught by an earlier unit. Grouped, never judged.
//
// THE BLIND SPOT THIS EXISTS TO CLOSE. Backward dedup runs in exactly one place (`assemble`), which
// means an `-extras` unit never runs it at all, and it compares against a library keyed
// `(epubHash, chapterNumber)`. An extras unit shares its base unit's chapter number, so writing one
// to that library would overwrite the base chapter's entry, and the code refuses. The consequence,
// measured on the live book: a new chapter is deduped against 1,176 targets and blind to 1,163 more
// that its extras units already teach. Half the collection is invisible to it.
//
// WHY THE FIX DOES NOT TOUCH THE LIBRARY. The `(epubHash, chapterNumber)` collision is a property of
// how that file is STORED, not of the comparison. A script can read every earlier unit off disk and
// hand the items over directly, and the key never comes into it.
//
// WHY IT IS FUZZY, AND WHY THAT IS THE WHOLE POINT. The existing matcher compares exact strings, so
// it already finds what exact matching can find. Everything it misses is a near miss: おかし against
// かし, a gloss that says the same thing in different words, a word taught bare in one chapter and
// with an honorific in another. Those are the cases worth an agent, so this pre-filter deliberately
// over-produces and lets the judge cut it down.
//
// IT DECIDES NOTHING. A candidate here is a question, not a finding. A word legitimately re-taught
// in a later chapter is ordinary, and a target appearing twice can be two senses.

import { targetKey } from "./itemSetDiff.js";
import { glossesAgree } from "./glossMatch.js";

/** Why a pair was proposed, so the prompt can say what the mechanism noticed. */
export const MATCH_REASON = Object.freeze({
  TARGET: "same-target",
  CONTAINS: "one-target-contains-the-other",
  GLOSS: "glosses-agree",
});

// CONTAINMENT IS ONLY SIGNAL AT THE EDGES, AND ONLY WHEN THE SHORTER IS MOST OF THE LONGER.
//
// Both rules were derived by running the unfiltered version over a real chapter. Plain "is a
// substring" proposed せん inside いきませんか and です inside どうですか, because grammatical endings
// are substrings of everything that uses them, and each of those is a question the judge has to
// answer for nothing.
//
// A prefix or suffix is what a real relationship looks like: おかし against かし, ごふん against ふん.
// The ratio then drops the case where a phrase merely contains a word (ちょっと inside
// ちょっとまってください is 0.36, and they are two different cards).
const MIN_CONTAINMENT_LENGTH = 2;
const MIN_CONTAINMENT_RATIO = 0.5;

function edgeContained(shorter, longer) {
  if (shorter.length < MIN_CONTAINMENT_LENGTH) return false;
  if (shorter.length / longer.length < MIN_CONTAINMENT_RATIO) return false;
  return longer.startsWith(shorter) || longer.endsWith(shorter);
}

function bare(item, languageCode) {
  const key = targetKey(item, languageCode);
  return key ? key.slice("target:".length) : "";
}

/**
 * Candidate prior art for each new item.
 *
 * Returns `[{ item, matches: [{ prior, reason }] }]`, only for items with at least one match.
 * `earlierItems` are expected to carry `__unit` (and optionally `__chapterLabel`) so a finding can
 * name where the earlier card lives.
 *
 * Excluded items are skipped on both sides. A card that ships nowhere teaches nothing, so it can
 * neither be prior art nor be duplicated.
 */
export function findBackwardCandidates(
  newItems,
  earlierItems,
  { languageCode, skipExactMatches = false } = {},
) {
  const priors = (earlierItems ?? []).filter((i) => i && !i.excluded && i.target);
  const byTarget = new Map();
  for (const prior of priors) {
    const key = bare(prior, languageCode);
    if (key) byTarget.set(key, [...(byTarget.get(key) ?? []), prior]);
  }

  const out = [];
  for (const item of newItems ?? []) {
    if (item?.excluded || !item?.target) continue;
    const key = bare(item, languageCode);
    if (!key) continue;

    const matches = new Map();
    const add = (prior, reason) => {
      if (!matches.has(prior)) matches.set(prior, reason);
    };

    // `skipExactMatches` is set on the base path, where `assemble` runs the v1 string matcher after
    // this phase and flags every exact target repeat itself. Raising them here too would spend an
    // Opus judgement to produce a second review note saying what the first already said. The extras
    // path does NOT set it: nothing else ever runs backward dedup for an extras unit, so there the
    // exact matches are the only coverage there is.
    if (!skipExactMatches) {
      for (const prior of byTarget.get(key) ?? []) add(prior, MATCH_REASON.TARGET);
    }

    for (const prior of priors) {
      const priorKey = bare(prior, languageCode);
      if (!priorKey || priorKey === key) continue;
      if (matches.has(prior)) continue;
      const shorter = key.length <= priorKey.length ? key : priorKey;
      const longer = shorter === key ? priorKey : key;
      if (edgeContained(shorter, longer)) {
        add(prior, MATCH_REASON.CONTAINS);
        continue;
      }
      if (item.english && prior.english && glossesAgree(item.english, prior.english)) {
        add(prior, MATCH_REASON.GLOSS);
      }
    }

    if (matches.size === 0) continue;
    out.push({
      item,
      matches: [...matches.entries()].map(([prior, reason]) => ({ prior, reason })),
    });
  }
  return out;
}

// How many prior cards to show per candidate. One chapter-16 card matched dozens on gloss overlap
// alone, and a prompt carrying all of them asks the judge to read a wall to answer one question.
// The strongest signals come first, so the cap drops the weakest evidence rather than a random slice.
const MAX_MATCHES_SHOWN = 5;
const REASON_RANK = {
  [MATCH_REASON.TARGET]: 0,
  [MATCH_REASON.CONTAINS]: 1,
  [MATCH_REASON.GLOSS]: 2,
};

/** The candidates as the compact shape the prompt sends. */
export function describeCandidatesForPrompt(candidates) {
  return candidates.map((candidate, index) => ({
    candidate: index + 1,
    card: {
      id: candidate.item.id,
      target: candidate.item.target ?? null,
      english: candidate.item.english ?? null,
    },
    alreadyInTheDeck: [...candidate.matches]
      .sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason])
      .slice(0, MAX_MATCHES_SHOWN)
      .map(({ prior, reason }) => ({
        unit: prior.__unit ?? prior.__chapterLabel ?? "an earlier unit",
        target: prior.target ?? null,
        english: prior.english ?? null,
        noticed: reason,
      })),
  }));
}

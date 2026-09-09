// Candidates for deduplication, GROUPED and not judged.
//
// WHY A SEPARATE MODULE FROM THE RECONCILER. `reconcile` merges on an exact key: same normalised
// target AND same normalised gloss. That key is deliberately strict, because loosening it is how a
// sense gets deleted — はし (bridge) and はし (chopsticks) share a spelling and must stay two cards.
// The cost of that strictness is measurable: on the one live phase-1 run, 19 of 83 items were a
// target already present in the same corpus, differing only in whether the gloss used a comma or a
// semicolon.
//
// Those two facts do not have a shared answer in string space. "Watch, clock." and "Watch; clock."
// are one word; "Bridge" and "Chopsticks" are two. No normalisation separates them, because the
// difference is meaning, not spelling.
//
// So this file does the half that IS mechanical: find every set of items that could be duplicates of
// each other, and hand them over. It never removes anything and never decides anything. The decision
// is a semantic judgement, which under this project's rules belongs to an agent, and the agent is
// pinned above the roles whose output it is judging.
//
// TWO GROUPINGS, because a duplicate can hide on either side of a card. Same target with different
// glosses is the common case (two specialists describing one word). Same gloss with different
// targets is rarer and more interesting: it is usually two spellings of one entry, and occasionally
// two genuinely different words that a lazy gloss failed to distinguish.

import { targetKey, englishKey } from "./itemSetDiff.js";

/** How a group was found, so the prompt can say what the items have in common. */
export const GROUP_KIND = Object.freeze({
  TARGET: "same-target",
  GLOSS: "same-gloss",
});

function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    if (item?.excluded) continue;
    const key = keyOf(item);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

/**
 * Every set of items in one corpus that might be the same card.
 *
 * Returns `[{ kind, key, items }]`, each with two or more members. An item can appear in more than
 * one group (same target as one item, same gloss as another), which is correct: both are questions
 * worth asking, and the judge answers them independently.
 *
 * Excluded items are skipped. A card a human already cut is not a duplicate of anything, and
 * re-litigating it would spend a judgement on a decision that has been made.
 */
export function findDuplicateCandidates(items, languageCode) {
  const groups = [];

  for (const [key, members] of groupBy(items, (i) => targetKey(i, languageCode))) {
    if (members.length < 2) continue;
    groups.push({
      kind: GROUP_KIND.TARGET,
      key: key.slice("target:".length),
      items: members,
    });
  }

  for (const [key, members] of groupBy(items, (i) => englishKey(i))) {
    if (members.length < 2) continue;
    // A group whose members ALSO share a target is already reported above; reporting it twice asks
    // the judge the same question twice and doubles the prompt for nothing.
    const targets = new Set(members.map((i) => targetKey(i, languageCode)));
    if (targets.size < 2) continue;
    groups.push({
      kind: GROUP_KIND.GLOSS,
      key: key.slice("english:".length),
      items: members,
    });
  }

  return groups;
}

/**
 * The groups as the compact shape the prompt sends.
 *
 * Only the fields a duplication judgement can turn on. `note` and `scene` are included because they
 * are where a real sense distinction is usually already written down: a card whose note says "the
 * one you cross" is evidence that its twin is a different word, not a restatement.
 */
export function describeGroupsForPrompt(groups) {
  return groups.map((group, index) => ({
    group: index + 1,
    sharing: group.kind,
    value: group.key,
    items: group.items.map((item) => ({
      id: item.id,
      target: item.target ?? null,
      english: item.english ?? null,
      category: item.category ?? null,
      ...(item.note ? { note: item.note } : {}),
      ...(item.scene ? { scene: item.scene } : {}),
    })),
  }));
}

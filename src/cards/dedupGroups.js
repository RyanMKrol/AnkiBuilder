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
  INTERJECTION: "same-after-interjection",
});

/**
 * Interjections that open a spoken line without changing what it asks for or states.
 *
 * Deliberately short, and limited to words that carry no content of their own. ちょっと is NOT here:
 * ちょっとまってください and まってください are a different request. いいえ is not here either,
 * because it reverses the answer.
 */
const LEADING_INTERJECTIONS = [
  "すみません",
  "じゃあ",
  "じゃ",
  "では",
  "はい",
  "ええ",
  "あのう",
  "あの",
];

/**
 * A target with one leading interjection and its punctuation removed, or "" when there is none.
 *
 * Only a leading one, and only once: the question is whether a miner transcribed the same line with
 * and without the word the speaker opened with, not whether two sentences are loosely similar.
 */
export function interjectionFreeKey(item, languageCode) {
  const key = targetKey(item, languageCode);
  if (!key) return "";
  const text = key.slice("target:".length);
  for (const word of LEADING_INTERJECTIONS) {
    if (!text.startsWith(word)) continue;
    const rest = text.slice(word.length).replace(/^[、。,.!！？?\s]+/, "");
    // A bare interjection is a card in its own right, not a prefix on another one.
    if (rest.length < 2) return "";
    return `target:${rest}`;
  }
  return "";
}

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

  // THIRD, the pair neither grouping above can see. Two miners hitting one dialogue line produce
  // もうふをおねがいできますか and すみません。もうふをおねがいできますか: the targets differ and so do the
  // glosses ("May I ask for a blanket?" / "Excuse me. May I ask for a blanket?"), so both groupings
  // miss them and the judge is never asked. Three such pairs reached Lesson 19's review.
  //
  // This FINDS them and stops there, like the rest of this file. Whether a leading word matters is
  // the judge's call, not a string rule's.
  const byStripped = new Map();
  for (const item of items) {
    if (item?.excluded) continue;
    const own = targetKey(item, languageCode);
    const stripped = interjectionFreeKey(item, languageCode) || own;
    if (!stripped) continue;
    byStripped.set(stripped, [...(byStripped.get(stripped) ?? []), item]);
  }
  for (const [key, members] of byStripped) {
    if (members.length < 2) continue;
    // Only worth asking when an interjection is what separates them. Members that already share a
    // full target were reported as same-target above.
    const targets = new Set(members.map((i) => targetKey(i, languageCode)));
    if (targets.size < 2) continue;
    groups.push({
      kind: GROUP_KIND.INTERJECTION,
      key: key.slice("target:".length),
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

// Merging the overlapping phase-1 roles into one candidate corpus.
//
// UNION FOR EXISTENCE, NEVER A VOTE. The table specialist, the chapter reader and the image
// specialist deliberately cover the same chapter by different routes, so an item two of them found
// is ordinary and an item only one found is the entire reason all three exist. Majority voting would
// delete exactly those, and in a recall task the minority report is the thing worth keeping: a
// surplus card costs the reviewer one click, a missing one is invisible and surfaces months later if
// at all.
//
// So nothing here decides an item is wrong. It decides only when two items are THE SAME item, and
// what the merged version should say.
//
// AGREEMENT IS RECORDED, NOT ACTED ON. Each merged item carries the roles that produced it, which is
// what lets the review gate sort a reviewer's attention (unanimous items are near-certain; a
// singleton is where a minute is worth most) and what lets the learning pass attribute a correction
// back to a role. It is evidence for a human, never a threshold in code.

import { normalizeDisplayText } from "../model/scriptSpacing.js";
import { targetKey, englishKey } from "./itemSetDiff.js";

/**
 * The key two candidates are considered THE SAME ITEM on: the target and the gloss together.
 *
 * Target alone is not enough, and that is the whole subtlety here. Two roles both finding `はし` may
 * have found one word glossed twice, or two senses that share a spelling: bridge and chopsticks.
 * v1 learned this the expensive way and its duplicate check says so in as many words, that roughly a
 * third of the groups it reports are cards that should stay. Merging on target alone silently
 * deletes one of the two senses, and a deleted sense is invisible.
 *
 * So same target with a different gloss stays two items, and is REPORTED as a sense collision for
 * the reviewer rather than resolved by a rule that cannot know. A candidate carrying only a target,
 * or only a gloss, still matches one that carries both, because a role that found less is agreeing
 * rather than disagreeing.
 */
export function candidateKey(item, languageCode) {
  const target = targetKey(item, languageCode);
  const english = englishKey(item);
  if (!target && !english) return null;
  return `${target}|${english}`;
}

/** The target half alone, for spotting two senses that share a spelling. */
function targetOnly(item, languageCode) {
  return targetKey(item, languageCode) || null;
}

function richer(a, b) {
  const score = (item) =>
    ["english", "note", "hint", "scene", "category", "ttsText"].reduce(
      (n, field) => n + (typeof item?.[field] === "string" && item[field].trim() ? 1 : 0),
      0,
    );
  return score(b) > score(a) ? b : a;
}

/**
 * Merges candidate lists into one, and returns `{ items, provenance, singletons, agreement }`.
 *
 * `items` keeps every distinct candidate. `provenance` maps the merged item's id to the role ids
 * that produced it, which is exactly the shape `writeSnapshot` stores. `singletons` are the ids only
 * one role found: not a problem, but the list a reviewer should read first.
 *
 * When two roles disagree about the same item's fields, the richer record wins and the other's roles
 * are still recorded. That is deliberate: dropping a gloss because two roles worded it differently
 * would lose information to a tie-break, and the reviewer can see both roles were involved.
 */
export function reconcile(candidateLists, { languageCode } = {}) {
  const merged = new Map();
  const unmatchable = [];

  for (const list of candidateLists) {
    for (const item of list ?? []) {
      const key = candidateKey(item, languageCode);
      if (!key) {
        unmatchable.push({ item, roles: new Set([item.producedBy].filter(Boolean)) });
        continue;
      }
      // A role that found only the target, or only the gloss, is agreeing with a role that found
      // both rather than describing something else, so it folds into the fuller entry.
      const existing = merged.get(key) ?? findPartialMatch(merged, item, languageCode);
      if (!existing) {
        merged.set(key, { key, item, roles: new Set([item.producedBy].filter(Boolean)) });
        continue;
      }
      existing.item = richer(existing.item, item);
      if (item.producedBy) existing.roles.add(item.producedBy);
    }
  }

  const entries = [...merged.values(), ...unmatchable];
  const items = [];
  const provenance = {};
  const singletons = [];
  const seenIds = new Set();

  for (const { item, roles } of entries) {
    const id = uniqueId(item.id, seenIds);
    seenIds.add(id);
    const producers = [...roles].sort();
    // `producedBy` was a per-role stamp; the merged item carries the full list in `provenance`
    // instead, so a card found twice does not read as having come from whichever role happened to be
    // merged into. Deleting it from a copy keeps the source list untouched for the caller.
    const rest = { ...item };
    delete rest.producedBy;
    items.push({ ...rest, id });
    provenance[id] = producers;
    if (producers.length <= 1) singletons.push(id);
  }

  return {
    items,
    provenance,
    singletons,
    senseCollisions: findSenseCollisions(items, languageCode),
    agreement: {
      total: items.length,
      byRoleCount: countBy(Object.values(provenance).map((roles) => roles.length)),
    },
  };
}

/**
 * A candidate carrying only half the key joins the entry that carries both.
 *
 * Without this, the image specialist finding `れい` with no gloss and the table specialist finding
 * `れい` glossed "Zero" would ship as two cards for one word.
 */
function findPartialMatch(merged, item, languageCode) {
  const target = targetKey(item, languageCode);
  const english = englishKey(item);
  if (target && english) return null;
  for (const entry of merged.values()) {
    const [entryTarget, entryEnglish] = entry.key.split("|");
    if (target && entryTarget === target) return entry;
    if (english && entryEnglish === `english:${english.slice("english:".length)}`) {
      if (!target && entryEnglish === english) return entry;
    }
  }
  return null;
}

/**
 * Items sharing a target but glossed differently: kept, and named for the reviewer.
 *
 * Not an error. It is the state where a rule cannot tell one word glossed twice from two senses that
 * share a spelling, so the answer is to keep both and say so. `preflight`'s collisions check will
 * separately insist each one carries a cue before it ships.
 */
export function findSenseCollisions(items, languageCode) {
  const byTarget = new Map();
  for (const item of items) {
    const key = targetOnly(item, languageCode);
    if (!key) continue;
    byTarget.set(key, [...(byTarget.get(key) ?? []), item.id]);
  }
  return [...byTarget.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ target: key.slice("target:".length), ids }));
}

/**
 * Keeps an id unique within the merged set.
 *
 * Roles author their own ids and two of them naming the same word the same way is likely rather than
 * unlucky. A collision matters here because a card id becomes an Anki note GUID: a duplicate makes
 * the package build refuse outright, and it used to do so only at Mark done, after both reviews had
 * been signed off.
 */
function uniqueId(candidate, taken) {
  const base = typeof candidate === "string" && candidate.trim() ? candidate.trim() : "item";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const next = `${base}-${n}`;
    if (!taken.has(next)) return next;
  }
}

function countBy(values) {
  return values.reduce((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), {});
}

/** Normalizes for display the same way the matcher does, for a caller reporting on a merge. */
export function displayKey(text, languageCode) {
  return normalizeDisplayText(String(text ?? "").trim(), languageCode);
}

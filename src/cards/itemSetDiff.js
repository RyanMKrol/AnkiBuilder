import { normalizeDisplayText } from "../model/scriptSpacing.js";

/**
 * Set-level diff between a human-approved REFERENCE item list and the CANDIDATE list a pass just
 * produced.
 *
 * It lives under `cards/` rather than `evals/` because three things need it and only one of them
 * is an eval: the eval fixtures, the union reconciler that merges the overlapping phase-1 roles,
 * and the learning pass that diffs a unit's as-generated snapshot against what the reviewer
 * approved. All three are asking the same question, "which items are the same item", and the
 * answer must not differ between them.
 *
 * This is deliberately not an assertion. Extraction is generative: two good runs of the same prompt
 * over the same chapter will disagree about a handful of borderline items, and an exact-match check
 * would either be permanently red or force the prompt to be tuned toward one historical sample. So
 * the diff is EVIDENCE — it says what moved, and a person decides whether that is better or worse.
 *
 * Matching is by content, never by `id`: ids are model-authored slugs and a rewritten prompt renames
 * them freely, which would report a whole unchanged chapter as 100% churn. Two passes, most reliable
 * key first:
 *
 *   1. `target` — verbatim source text, so it is stable across runs. Normalized through
 *      `normalizeDisplayText` first, exactly as the backward-dedup pass does, so editorial spaces or
 *      a trailing 。 never split a real match.
 *   2. `english` — for the leftovers, so an item whose target got re-spelled (a resolved placeholder,
 *      a stripped 〜) still pairs up with its reference instead of showing as one miss plus one extra.
 *
 * Duplicates on a key are paired in order and any surplus falls through to the next pass, so a
 * chapter that legitimately teaches the same word twice does not silently absorb an extra card.
 */
export function diffItemSets(reference, candidate, { languageCode } = {}) {
  const refEntries = reference.map((item, index) => ({ item, index, matched: false }));
  const candEntries = candidate.map((item, index) => ({ item, index, matched: false }));

  const matched = [];
  for (const keyOf of [(item) => targetKey(item, languageCode), (item) => englishKey(item)]) {
    pairOn(refEntries, candEntries, keyOf, matched);
  }

  const changed = matched.filter((pair) => pair.changes.length > 0);
  return {
    matched,
    changed,
    categoryChanged: matched.filter((pair) => pair.changes.some((c) => c.field === "category")),
    missing: refEntries.filter((entry) => !entry.matched).map((entry) => entry.item),
    extra: candEntries.filter((entry) => !entry.matched).map((entry) => entry.item),
    counts: {
      reference: reference.length,
      candidate: candidate.length,
      matched: matched.length,
      changed: changed.length,
    },
  };
}

function pairOn(refEntries, candEntries, keyOf, matched) {
  const buckets = new Map();
  for (const entry of refEntries) {
    if (entry.matched) continue;
    const key = keyOf(entry.item);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }

  for (const cand of candEntries) {
    if (cand.matched) continue;
    const key = keyOf(cand.item);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (!bucket || bucket.length === 0) continue;
    const ref = bucket.shift();
    ref.matched = true;
    cand.matched = true;
    matched.push({
      key,
      reference: ref.item,
      candidate: cand.item,
      referenceIndex: ref.index,
      candidateIndex: cand.index,
      changes: fieldChanges(ref.item, cand.item),
    });
  }
}

/**
 * The spoken form of an item, under EITHER field name.
 *
 * The field was renamed `reading` → `ttsText` (2026-08); every tracked corpus was migrated with it,
 * and the current prompt asks for `ttsText`. The old name is still read here because a RECORDED
 * response predating the rename, or a corpus restored from an older backup, would otherwise diff as
 * a chapter-wide change to every spoken form. Reading both keeps the diff about CONTENT.
 */
export function spokenTextOf(item) {
  if (typeof item?.ttsText === "string") return item.ttsText;
  if (typeof item?.reading === "string") return item.reading;
  return undefined;
}

// The fields worth diffing on a matched pair. `id` is excluded on purpose (model-authored slug), and
// so are the free-prose note fields: they are rewritten wholesale by any prompt edit, and listing
// every one of them would bury the category and spoken-form changes that actually matter.
const COMPARED_FIELDS = ["english", "target", "category"];

function fieldChanges(refItem, candItem) {
  const changes = [];
  for (const field of COMPARED_FIELDS) {
    const from = refItem[field] ?? "";
    const to = candItem[field] ?? "";
    if (from !== to) changes.push({ field, from, to });
  }
  const fromSpoken = spokenTextOf(refItem) ?? "";
  const toSpoken = spokenTextOf(candItem) ?? "";
  if (fromSpoken !== toSpoken) {
    changes.push({ field: "ttsText", from: fromSpoken, to: toSpoken });
  }
  for (const flag of ["uncertain", "aiSuggested"]) {
    const from = Boolean(refItem[flag]);
    const to = Boolean(candItem[flag]);
    if (from !== to) changes.push({ field: flag, from, to });
  }
  return changes;
}

/**
 * The two match keys, exported because more than one caller must agree on them.
 *
 * The eval diff, the union reconciler that merges the overlapping phase-1 roles, and the learning
 * pass all ask "are these the same item", and a second implementation of that question is how the
 * unit-directory regex ended up hand-copied into seven files with three different shapes. One
 * definition, used everywhere.
 */
export function targetKey(item, languageCode) {
  if (typeof item?.target !== "string") return "";
  const normalized = normalizeDisplayText(item.target.trim(), languageCode);
  return normalized ? `target:${normalized}` : "";
}

export function englishKey(item) {
  if (typeof item?.english !== "string") return "";
  const normalized = item.english
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "");
  return normalized ? `english:${normalized}` : "";
}

/** `id → count` for each category present, so the report can show the shape of the assignment. */
export function categoryHistogram(items) {
  const counts = new Map();
  for (const item of items) {
    const category = item?.category ?? "(none)";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

/**
 * Kendall-tau-style ordering disagreement between two id sequences, over the ids they share: the
 * fraction of id PAIRS the candidate orders the opposite way from the reference. 0 means identical
 * order, 1 means exactly reversed. This is what makes a sort-pass diff readable — a single swapped
 * neighbour and a wholesale reshuffle both change "the order", and only this tells them apart.
 */
export function orderDisagreement(referenceIds, candidateIds) {
  const candRank = new Map(candidateIds.map((id, index) => [id, index]));
  const shared = referenceIds.filter((id) => candRank.has(id));
  if (shared.length < 2) return { shared: shared.length, pairs: 0, inverted: 0, fraction: 0 };

  let inverted = 0;
  let pairs = 0;
  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      pairs++;
      if (candRank.get(shared[i]) > candRank.get(shared[j])) inverted++;
    }
  }
  return { shared: shared.length, pairs, inverted, fraction: inverted / pairs };
}

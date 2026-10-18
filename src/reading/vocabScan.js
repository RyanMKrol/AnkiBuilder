// The vocabulary scan behind scripts/reading-vocab-scan.mjs: what the widened card rules 1 (owner
// ruling, 2026-10-18) would add to a reading collection that was built under the old rule, which
// carded only the vocabulary lists. The chapter reader is run again over every chapter with the new
// prompt; this module turns its answer into one row per candidate word, for the owner to approve.
//
// Read-only by design: it decides nothing and writes nothing under output/. Whether a word becomes a
// card is the owner's call at the review, and a new card goes through the additions gates.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { targetKey, splitAlternateForms, resolveBrackets } from "./readingPhase.js";
import { readingScheme } from "./readingSchemes.js";
import { TEACHING_PLACES } from "./readingAgents.js";

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};

/**
 * Every written form this collection already cards, `Map<form, chapter label>`, the kana unit
 * included. Only this collection's own units (golden rule 7).
 */
export function cardedForms(collectionDir, targetLanguage) {
  const carded = new Map();
  if (!existsSync(collectionDir)) return carded;
  for (const name of readdirSync(collectionDir).sort()) {
    if (!/^chapter-\d+$/.test(name)) continue;
    const cards = readJson(join(collectionDir, name, "cards.json"));
    for (const item of cards?.items ?? []) {
      if (item.excluded) continue;
      const form = targetKey(item.target, targetLanguage);
      if (form && !carded.has(form)) carded.set(form, cards.meta?.chapterLabel ?? name);
    }
  }
  return carded;
}

/**
 * One row per candidate word the chapter reader found in one chapter.
 *
 * `decision` is what the widened rule says about it: `card exists` (somewhere in this collection),
 * `skip, carded there` (only used here, and a later chapter's list introduces it), or `candidate`
 * (no card yet: the owner decides). A form the reader gave twice in one chapter is one row.
 */
export function scanRows({
  chapterLabel,
  chapterNumber,
  items,
  laterTaught = new Map(),
  carded = new Map(),
  targetLanguage,
}) {
  const scheme = readingScheme(targetLanguage);
  const rows = [];
  const seen = new Set();
  for (const item of (items ?? [])
    .flatMap(splitAlternateForms)
    .flatMap((i) => resolveBrackets(i, scheme))) {
    const form = targetKey(item.target, targetLanguage);
    if (!form || seen.has(form)) continue;
    seen.add(form);
    const where = item.where ?? null;
    const taughtHere = where == null || TEACHING_PLACES.includes(where);
    const laterChapter = laterTaught.get(form) ?? null;
    const cardIn = carded.get(form) ?? null;
    let decision = "candidate";
    if (cardIn) decision = "card exists";
    else if (laterChapter && !taughtHere) decision = "skip, carded there";
    rows.push({
      chapter: chapterLabel,
      chapterNumber,
      target: form,
      ...(item.reading ? { reading: item.reading } : {}),
      english: item.english ?? "",
      kind: item.kind ?? null,
      where,
      section: item.section ?? null,
      glossed: item.glossed !== false,
      // A kana-only word goes to the collection's one kana deck, chosen by budget, not to a chapter.
      ...(scheme?.kanaDeck ? { kanaOnly: !scheme.requiresReading(form) } : {}),
      laterChapter,
      cardExists: Boolean(cardIn),
      cardIn,
      decision,
    });
  }
  return rows;
}

/** Counts by decision, for the summary line. */
export function summarizeRows(rows) {
  const counts = {};
  for (const row of rows) counts[row.decision] = (counts[row.decision] ?? 0) + 1;
  return counts;
}

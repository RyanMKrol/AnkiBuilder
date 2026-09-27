// The order a reading unit's cards are studied in: a fixed shuffle, never book order (owner rulings,
// 2026-09-27). In book order a run gives each card away: the kana deck's いち, に, さん…, a chapter's
// days of the month. A reading deck is for reading, and the order the book taught the words in
// teaches nothing here, so every reading unit, the kana deck and each chapter, is shuffled.
//
// The shuffle is keyed on each card's id, so the same unit always comes out in the same order, and a
// card added or removed moves no other. `sourceOrder` is renumbered to the new order; the dashboard,
// the package's new-card order and delivery all follow it.

import { existsSync, readFileSync, statSync, utimesSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { writeFileAtomic } from "../util/atomicWrite.js";

// The key's prefix is fixed: the kana deck was first delivered in this order (2026-09-27), and
// changing the prefix would reshuffle every unit already built.
const orderKey = (item) => createHash("sha1").update(`kana-order:${item.id}`).digest("hex");

/** `items` in study order, with `sourceOrder` renumbered 0, 1, 2… */
export function readingStudyOrder(items) {
  return [...items]
    .map((item) => ({ item, key: orderKey(item) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ item }, index) => ({ ...item, sourceOrder: index }));
}

// The merge writes reading-report.json and cards.json together, so a cards.json much newer than the
// report was changed after the merge: by a reviewer on the dashboard, or by hand.
const REPORT = "reading-report.json";
const EDIT_SLACK_MS = 5000;

/** Whether a unit's cards were changed after its last merge (see REPORT above). */
export function editedSinceMerge(unitDir) {
  const cards = join(unitDir, "cards.json");
  const report = join(unitDir, REPORT);
  if (!existsSync(cards) || !existsSync(report)) return false;
  return statSync(cards).mtimeMs > statSync(report).mtimeMs + EDIT_SLACK_MS;
}

/**
 * Puts an already-written unit into study order IN PLACE: its cards.json and corpus.json are
 * reordered, and nothing else about any card changes, so a reviewer's edits are kept. A unit marked
 * done is left alone (its order is already in the package, and in Anki if delivered). Returns
 * whether it changed anything.
 */
export function applyStudyOrder(unitDir) {
  const cardsPath = join(unitDir, "cards.json");
  if (!existsSync(cardsPath)) return false;
  const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
  if (cards.meta?.done === true || !(cards.items ?? []).length) return false;
  const ordered = readingStudyOrder(cards.items);
  const rank = new Map(ordered.map((item) => [item.id, item.sourceOrder]));
  const same = cards.items.every((item, i) => rank.get(item.id) === i && item.sourceOrder === i);
  if (same) return false;
  // Reordering is not an edit: a unit nobody had edited stays "not edited" (its report is touched
  // with it), so a later rule change can still re-merge it. An edited one stays edited.
  const wasEdited = editedSinceMerge(unitDir);
  writeFileAtomic(cardsPath, `${JSON.stringify({ ...cards, items: ordered }, null, 2)}\n`);
  const corpusPath = join(unitDir, "corpus.json");
  if (existsSync(corpusPath)) {
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    const items = [...(corpus.items ?? [])]
      .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
      .map((item) => (rank.has(item.id) ? { ...item, sourceOrder: rank.get(item.id) } : item));
    writeFileAtomic(corpusPath, `${JSON.stringify({ ...corpus, items }, null, 2)}\n`);
  }
  const reportPath = join(unitDir, REPORT);
  if (!wasEdited && existsSync(reportPath)) {
    const now = new Date();
    utimesSync(reportPath, now, now);
  }
  return true;
}

// Shared by the QA scripts (qa-render-unit.mjs, qa-ledger.mjs): which units a collection has, in
// STUDY order, and which of their cards ship.
//
// Study order is the book's own order, because that is the order the learner meets the material in:
// `meta.chapterNumber` is the spine index the unit was built from, so a supplement the book places
// between two lessons (Busy People's Casual Style 1 sits after Lesson 17) lands where the book puts
// it, not where it was built. A chapter's base unit comes before its extras unit. Owner ruling for
// the QA pass, 2026-10-15: book order, not build order.
//
// Read-only. Nothing here writes.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { shippableCards } from "../src/deck/shippableCards.js";

const UNIT_DIR = /^(chapter|lesson)-\d+(-extras)?$/;

export function readUnit(unitDir) {
  const file = join(unitDir, "cards.json");
  if (!existsSync(file)) return null;
  const cards = JSON.parse(readFileSync(file, "utf-8"));
  const name = basename(unitDir);
  return {
    dir: resolve(unitDir),
    name,
    isExtras: name.endsWith("-extras"),
    label: cards.meta?.chapterLabel ?? cards.meta?.lessonLabel ?? name,
    spine: Number(cards.meta?.chapterNumber ?? cards.meta?.lessonNumber ?? 0),
    done: Boolean(cards.meta?.done),
    items: cards.items ?? [],
    shipping: shippableCards(cards),
  };
}

/** Every unit under a collection, sorted into study order. */
export function listUnitsInStudyOrder(collectionDir) {
  const units = readdirSync(collectionDir)
    .filter((name) => UNIT_DIR.test(name))
    .map((name) => readUnit(join(collectionDir, name)))
    .filter(Boolean);
  return units.sort(
    (a, b) =>
      a.spine - b.spine ||
      Number(a.isExtras) - Number(b.isExtras) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** The collection a unit belongs to: its parent directory. */
export function collectionDirOf(unitDir) {
  return resolve(unitDir, "..");
}

#!/usr/bin/env node
// Backfills the backward-dedup library from lessons that were reviewed but never saved into it.
//
// Usage: node scripts/backfill-dedup-library.mjs [--dry] <bookDir> [<bookDir> ...]
//
// The library at `.anki-builder/epubs/<epubHash>/corpora/<chapterNumber>.json` is written by the
// dashboard's "Mark reviewed" and read by the next lesson's backward-dedup pass. A lesson reviewed
// through some other path -- an older build, a hand-edit, a review that predates that wiring -- is
// therefore invisible to every later lesson's dedup, silently, and nothing in the output says so.
//
// This re-saves each such lesson from its own cards.json, filtered to the items a reviewer kept,
// which is exactly the shape markCardsReviewed writes. Idempotent: a lesson already in the library
// is left alone. Touches no deck and no Anki scheduling.
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { saveChapterCorpus, loadPriorChapterItems } from "../src/corpus/epubLibrary.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirs = args.filter((a) => a !== "--dry");
if (dirs.length === 0) {
  console.error("give one or more book directories (e.g. output/epubs/<slug>)");
  process.exit(1);
}

// Exactly the shape markCardsReviewed writes (src/server/adapters/applyCards.js) — same fields, same
// excluded filter — so a lesson backfilled here is byte-identical to one saved by clicking through the
// review, and a later re-review produces no diff.
function corpusFromCards(cards) {
  const items = cards.items
    .filter((i) => !i.excluded)
    .map((i) => ({
      id: i.id,
      english: i.english,
      category: i.category,
      reviewNote: i.reviewNote ?? null,
      target: i.target ?? null,
      reading: i.reading,
      ...(i.uncertain ? { uncertain: true } : {}),
      ...(i.aiSuggested ? { aiSuggested: true } : {}),
    }));
  return { meta: cards.meta, items };
}

for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error("skip (missing):", dir);
    continue;
  }
  console.error(`${dir}:`);

  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const cardsPath = join(dir, entry.name, "cards.json");
    if (!existsSync(cardsPath)) continue;

    const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
    const { epubHash, chapterNumber, reviewed, chapterLabel } = cards.meta ?? {};
    if (!epubHash || typeof chapterNumber !== "number") continue;
    if (reviewed !== true) {
      console.error(`  ${entry.name}: not reviewed — nothing to save`);
      continue;
    }

    // loadPriorChapterItems keys on "strictly before", so ask for chapterNumber + 1 to learn whether
    // THIS chapter is present rather than reaching for the library's path layout directly.
    const present = loadPriorChapterItems(epubHash, chapterNumber + 1).some(
      (item) => item.__chapterNumber === chapterNumber,
    );
    if (present) {
      console.error(`  ${entry.name}: already in the library`);
      continue;
    }

    const corpus = corpusFromCards(cards);
    if (dry) {
      console.error(
        `  ${entry.name}: WOULD save ${corpus.items.length} item(s) as chapter ${chapterNumber} (${chapterLabel ?? "?"})`,
      );
      continue;
    }
    const dest = saveChapterCorpus(epubHash, chapterNumber, corpus);
    console.error(
      `  ${entry.name}: saved ${corpus.items.length} item(s) as chapter ${chapterNumber} -> ${dest}`,
    );
  }
}

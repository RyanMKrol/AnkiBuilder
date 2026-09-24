// The kana unit of a Japanese reading collection: every kana word the book teaches, chosen once for
// the whole collection (src/reading/kanaUnits.js for the rules; owner decisions, 2026-09-24). Its
// chapters card kanji only, and pass their kana words here through `kanaPool` in each chapter's
// reading-report.json, so choosing the deck calls no reader again.
//
// The unit is an ordinary reading unit in every other way: `chapter-N/` with corpus.json and
// cards.json, `meta.chapterNumber` 0 (no real chapter has spine 0, so it is found like any other
// unit and never collides), the scheme's label (`Chapter 00: Kana`, which sorts first in Anki), the
// same review, audio and done gates, and the same romaji cache and retry rules as a chapter.

import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";
import { validateCorpus, validateCards } from "../model/index.js";
import { writeSnapshot, hasSnapshot } from "../agents/snapshot.js";
import { readingScheme, silentCardPredicate } from "./readingSchemes.js";
import { romanizeReadingItems } from "./readingRomaji.js";
import { selectKanaDeck, kanaScript } from "./kanaUnits.js";
import { READING_REPORT_FILE, READING_ROMAJI_FILE, readingCardId } from "./readingPhase.js";

export const KANA_CHAPTER_NUMBER = 0;
export const KANA_REPORT_FILE = "kana-report.json";

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};

function writeJson(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, `${JSON.stringify(body, null, 2)}\n`);
}

/**
 * Every chapter's kana words, in book order, as `{ target, english, category, position,
 * chapterLabel }`. `missing` names the chapters whose last merge predates the kana deck (a report
 * with no `kanaPool`), which must be re-merged first or their words would be absent from the choice.
 */
export function collectKanaPool(collectionDir) {
  const pool = [];
  const missing = [];
  if (!existsSync(collectionDir)) return { pool, missing };
  for (const name of readdirSync(collectionDir)) {
    if (!/^chapter-\d+$/.test(name)) continue;
    const dir = join(collectionDir, name);
    const meta = readJson(join(dir, "corpus.json"))?.meta;
    if (typeof meta?.chapterNumber !== "number" || meta.chapterNumber === KANA_CHAPTER_NUMBER) {
      continue;
    }
    const report = readJson(join(dir, READING_REPORT_FILE));
    if (!Array.isArray(report?.kanaPool)) {
      missing.push(meta.chapterLabel ?? name);
      continue;
    }
    report.kanaPool.forEach((entry, index) =>
      pool.push({
        ...entry,
        chapterLabel: meta.chapterLabel ?? null,
        position: meta.chapterNumber * 100000 + index,
      }),
    );
  }
  return { pool: pool.sort((a, b) => a.position - b.position), missing };
}

/**
 * Chooses and writes the kana unit into `unitDir`. Refuses (throws) when the unit already has a
 * human review, since re-choosing would discard it, and when a chapter has not been merged under the
 * kana-deck rule. `runRomanization` is the romaji correction call, faked in tests.
 */
export async function buildKanaUnit({
  unitDir,
  collectionDir,
  targetLanguage,
  epubHash,
  runRomanization,
  romanize = romanizeReadingItems,
  log = () => {},
}) {
  const scheme = readingScheme(targetLanguage);
  if (!scheme?.kanaDeck) throw new Error(`${targetLanguage} has no kana deck`);
  const existing = readJson(join(unitDir, "cards.json"));
  if (existing?.meta?.reviewed === true) {
    throw new Error(
      `${unitDir} is reviewed. Choosing the kana deck again would discard the review; withdraw it ` +
        `in the dashboard first.`,
    );
  }
  const { pool, missing } = collectKanaPool(collectionDir);
  if (missing.length) {
    throw new Error(
      `these chapters were merged before the kana deck existed, so their kana words are not in the ` +
        `pool; re-merge them first (build-reading.mjs --remerge): ${missing.join(", ")}`,
    );
  }

  const { budgets, minPerUnit, label } = scheme.kanaDeck;
  const choice = selectKanaDeck(pool, { budgets, minPerUnit });
  let items = choice.selected.map((entry, index) => ({
    id: readingCardId(entry.target),
    target: entry.target,
    english: entry.english,
    category: entry.category,
    sourceOrder: index,
  }));

  const cached = readJson(join(unitDir, READING_ROMAJI_FILE))?.items ?? [];
  const romaji = await romanize(items, {
    targetLanguage,
    isSilent: silentCardPredicate({ targetLanguage, deckKind: "reading" }),
    cached: Object.fromEntries(
      cached.filter((r) => r.pronunciation).map((r) => [r.id, r.pronunciation]),
    ),
    ...(runRomanization ? { runClaude: runRomanization } : {}),
    log,
  });
  items = romaji.items;
  // A failed correction is not cached, exactly as for a chapter (readingPhase.js), so a re-run
  // corrects it.
  const rows = new Map(cached.map((r) => [r.id, r]));
  if (!romaji.failed) for (const row of romaji.romanized) rows.set(row.id, row);
  writeJson(join(unitDir, READING_ROMAJI_FILE), { items: [...rows.values()] });

  if (!hasSnapshot(unitDir)) writeSnapshot(unitDir, { phase: "reading", items, provenance: {} });

  const meta = {
    targetLanguage,
    sourceType: "epub",
    reviewed: false,
    epubHash,
    chapterNumber: KANA_CHAPTER_NUMBER,
    chapterLabel: label,
    phase: "reading",
  };
  const corpus = {
    meta,
    items: items.map((item) => {
      const rest = { ...item };
      delete rest.pronunciation;
      return rest;
    }),
  };
  validateCorpus(corpus);
  writeJson(join(unitDir, "corpus.json"), corpus);
  const cards = {
    meta,
    items: items.map((item) => ({ ...item, pronunciation: item.pronunciation ?? "" })),
  };
  validateCards(cards);
  writeJson(join(unitDir, "cards.json"), cards);

  const perScript = { hiragana: 0, katakana: 0 };
  for (const item of items) perScript[kanaScript(item.target)]++;
  const report = {
    pool: pool.length,
    selected: items.length,
    perScript,
    budgets,
    minPerUnit,
    coverage: choice.coverage,
    short: choice.short,
    unselected: choice.unselected,
    romajiFailed: romaji.failed ? romaji.reason : null,
  };
  writeJson(join(unitDir, KANA_REPORT_FILE), report);
  return report;
}

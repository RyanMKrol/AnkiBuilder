// The words a LATER chapter's vocabulary list introduces, for card rules 1 (owner ruling,
// 2026-10-18, DECISIONS.md "A reading deck cards vocabulary from anywhere in the chapter"): a reading
// deck cards every word a chapter puts in front of the learner as Japanese to read, wherever it
// appears, but a word that only turns up in a dialogue or a culture note and that a later chapter's
// list introduces is carded there, so the deck keeps the book's order.
//
// Deterministic and free: it reads the reading collection's OWN later chapters (golden rule 7: never
// another collection), from the free chapter cache and, where a later chapter is already built, from
// what its table reader saved. Which tables are vocabulary lists, best source first:
//
//   1. the later unit's table reader verdicts (`candidates/tables.json`), over its saved raw tables
//      (`candidates/tables-raw.json`), plus that reader's own items from those tables, which are
//      already in the form a card takes (the kanji spelling);
//   2. otherwise the chapter file itself, where the book's `vocabularyTableClass` hint matches;
//   3. otherwise a table whose class says "vocab" (a converted book writes `class="vocabulary"`).
//
// A later chapter none of these can read contributes nothing. The cost of missing a word is that it
// is carded in the earlier chapter that uses it, which is what the rule did before; the cost of a
// false match would be a word carded nowhere, so the matching is exact on the written form.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseTables, annotateWithHints } from "../corpus/chapterTables.js";
import { targetKey } from "./readingPhase.js";

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};

// A cell is often more than one form: "えいが／映画", "part-time job (more colloquially, バイト)".
const CELL_SEPARATORS = /[／/・,，、;；()（）[\]［］「」]/u;

/** The written forms a cell holds: the whole cell and each piece between separators. */
export function cellForms(text, targetLanguage) {
  const whole = String(text ?? "");
  return [whole, ...whole.split(CELL_SEPARATORS)]
    .map((piece) => targetKey(piece, targetLanguage))
    .filter(Boolean);
}

/** The vocabulary tables of one later chapter and, where its table reader ran, that reader's items. */
function vocabularyOf({ chapterFilePath, unitDir }, { vocabularyTableClass }) {
  const verdicts = unitDir ? readJson(join(unitDir, "candidates", "tables.json")) : null;
  const raw = unitDir ? readJson(join(unitDir, "candidates", "tables-raw.json")) : null;
  if (Array.isArray(verdicts?.tables) && Array.isArray(raw)) {
    const vocab = new Set(
      verdicts.tables.filter((t) => t?.verdict === "vocabulary").map((t) => t.index),
    );
    return {
      tables: raw.filter((t) => vocab.has(t.index)),
      items: (verdicts.items ?? []).filter((i) => vocab.has(i?.table)),
    };
  }
  if (!chapterFilePath || !existsSync(chapterFilePath)) return { tables: [], items: [] };
  const tables = annotateWithHints(parseTables(readFileSync(chapterFilePath, "utf-8")), {
    vocabularyTableClass,
  });
  return {
    tables: tables.filter((t) =>
      t.hintMatch === null ? /vocab/i.test(t.className ?? "") : t.hintMatch,
    ),
    items: [],
  };
}

/**
 * `Map<written form, chapter label>`: each form a later chapter's vocabulary list introduces, mapped
 * to the FIRST later chapter (in the order given, which is book order) whose list has it.
 * `laterChapters` is `[{ label, chapterFilePath, unitDir? }]`, the chapters after the one being
 * built, in book order.
 */
export function laterVocabulary(
  laterChapters,
  { targetLanguage = null, vocabularyTableClass = null } = {},
) {
  const taught = new Map();
  for (const chapter of laterChapters ?? []) {
    const { tables, items } = vocabularyOf(chapter, { vocabularyTableClass });
    const forms = [
      ...items.flatMap((item) => [item.target, item.reading]),
      ...tables.flatMap((table) => (table.rows ?? []).flat().map((cell) => cell?.text)),
    ].flatMap((text) => cellForms(text, targetLanguage));
    for (const form of forms) if (!taught.has(form)) taught.set(form, chapter.label);
  }
  return taught;
}

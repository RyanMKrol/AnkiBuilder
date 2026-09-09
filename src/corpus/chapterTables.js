// Every table in a chapter, with no opinion about which of them are vocabulary.
//
// WHY THIS REPLACES A SELECTOR. `vocabCoverage` found a chapter's vocabulary blocks by matching
// `<table class="voca">`, which is one publisher's markup. On any other book the regex matched
// nothing, `findUncoveredVocab` received an empty list, and the coverage check reported zero
// uncovered headwords, which is indistinguishable from a chapter whose vocabulary is fully carded.
// That is a silent zero in the one check written to catch a silent miss.
//
// The fix is not a better selector. There is no promise an EPUB is internally consistent, let alone
// consistent with the next book, so any selector is a good guess and never a guarantee, and code
// that BRANCHES on a guess produces confidently wrong answers. So this module makes no judgement at
// all: it dumps every table it can find, and deciding which are vocabulary is an agent's job.
//
// HINTS ANNOTATE, THEY NEVER FILTER. A book's `hints` may say its vocabulary tables usually carry a
// particular class. That is worth telling a reader, and it is worth ordering by, so a matching table
// is flagged `hintMatch: true`. Nothing is ever removed for failing to match, because the failure
// mode of a hint is that it is out of date and the table it missed is the one that mattered.
//
// KNOWN LIMIT: a nested `<table>` inside another is read as one table ending at the first
// `</table>`. EPUB textbooks nest tables for layout rarely enough that a real parser is not yet
// worth the dependency, and the failure is visible rather than silent (the outer table's later rows
// go missing from a dump a human or an agent is reading), which is the trade this file exists to
// avoid making invisibly.

import { plainText } from "./chapterOutline.js";

const TABLE = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
const CLASS_ATTR = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/** The `class` attribute of an opening tag, or `null`. Reported, never matched on. */
export function classOf(attrs) {
  const m = CLASS_ATTR.exec(String(attrs ?? ""));
  return m ? (m[1] ?? m[2]) : null;
}

function parseRows(body) {
  const rows = [];
  for (const [, rowBody] of body.matchAll(ROW)) {
    const cells = [...rowBody.matchAll(CELL)].map(([, tag, attrs, cellBody]) => ({
      header: tag.toLowerCase() === "h",
      className: classOf(attrs),
      text: plainText(cellBody),
    }));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * Every `<table>` in document order, as
 * `{ index, at, className, attrs, rows, rowCount, columnCounts, cellText }`.
 *
 * `columnCounts` is a list rather than a number because a ragged table is a real and informative
 * shape: a vocabulary block whose rows are mostly two cells with a few threes usually means indented
 * sub-entries, and flattening that to "the table has 2 columns" throws away the signal.
 */
export function parseTables(html) {
  const source = String(html ?? "");
  return [...source.matchAll(TABLE)].map(([, attrs, body], index) => {
    const rows = parseRows(body);
    return {
      index,
      className: classOf(attrs),
      attrs: String(attrs ?? "").trim() || null,
      rows,
      rowCount: rows.length,
      columnCounts: [...new Set(rows.map((row) => row.length))].sort((a, b) => a - b),
      cellText: rows.flatMap((row) => row.map((cell) => cell.text)).filter(Boolean),
    };
  });
}

/**
 * Flags the tables a book's hints would have pointed at, without removing any.
 *
 * `hint` is a substring matched against the table's class attribute, which is what a hint like
 * `vocabularyTables: 'class="voca"'` is really saying. A book with no hint gets every table flagged
 * `hintMatch: null`, meaning "not asked", which is deliberately distinct from `false`, meaning
 * "asked, and this one did not match".
 */
export function annotateWithHints(tables, { vocabularyTableClass = null } = {}) {
  return tables.map((table) => ({
    ...table,
    hintMatch: vocabularyTableClass
      ? Boolean(table.className?.includes(vocabularyTableClass))
      : null,
  }));
}

/**
 * A one-line-per-table summary for a human or an agent to read.
 *
 * Says "no tables" explicitly rather than printing nothing, because an empty dump and a chapter
 * nobody managed to read look identical otherwise, and that is the whole failure this replaces.
 */
export function describeTables(tables) {
  if (!tables.length) return "NO TABLES — this chapter references none.";
  return tables
    .map((table) => {
      const cls = table.className ? `class="${table.className}"` : "(no class)";
      const cols = table.columnCounts.join("/") || "0";
      const flag = table.hintMatch === true ? "  [matches this book's hint]" : "";
      return `[${table.index}] ${cls} — ${table.rowCount} row(s), ${cols} col(s)${flag}`;
    })
    .join("\n");
}

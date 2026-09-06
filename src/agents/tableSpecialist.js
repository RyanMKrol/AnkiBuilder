// The table specialist: which of a chapter's tables are vocabulary, and what is in them.
//
// It is fed the raw dump from `parseTables` (src/corpus/chapterTables.js), which judges nothing, and
// it returns both the entries it read AND a verdict for every table it was shown. The second half is
// not bookkeeping. The failure this role replaces was a CSS-class selector that, on a book marking
// tables any other way, matched nothing and reported the chapter's vocabulary fully covered — so a
// table nobody judged and a table holding nothing have to be distinguishable in the output, or the
// same silence comes back wearing a model's name.
//
// `assertAccountedFor` is where that is enforced: a response missing a verdict for any table it was
// given is rejected rather than merged. The model is told this in the prompt, and checked here,
// because a rule stated only in a prompt is a rule that holds until the day it does not.

import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { renderBookHints } from "../corpus/bookConfig.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const TABLE_SPECIALIST_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "table-specialist-prompt.md"),
);

export const ROLE_ID = "tableSpecialist";

/** Verdicts the role may return. Anything else is a parse error, not a new category. */
export const TABLE_VERDICTS = Object.freeze([
  "vocabulary",
  "paradigm",
  "reference",
  "example",
  "layout",
  "unreadable",
]);

const NO_HINTS =
  "(no conventions recorded for this book — judge every table on what it contains, and expect nothing)";

/**
 * The prompt for one chapter's tables.
 *
 * The dump is trimmed to what the judgement needs: index, class, shape and cell text. The raw
 * attribute string is dropped, because a model shown a full markup blob starts reasoning about the
 * markup instead of the content, and the class is the only attribute that has ever meant anything.
 */
export function renderTableSpecialistPrompt({ tables, targetLanguage, meta = null }) {
  const payload = tables.map((table) => ({
    index: table.index,
    className: table.className,
    rowCount: table.rowCount,
    columnCounts: table.columnCounts,
    rows: table.rows.map((row) => row.map((cell) => cell.text)),
  }));
  return renderPromptTemplate(TABLE_SPECIALIST_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    BOOK_HINTS: renderBookHints(meta) ?? NO_HINTS,
    TABLES_JSON: JSON.stringify(payload, null, 2),
  });
}

/**
 * Rejects a response that did not account for every table it was shown.
 *
 * Both directions are errors. A missing verdict is the silence this role exists to remove; a verdict
 * for a table that was never sent means the model is answering about something else, and merging
 * that would attribute entries to a table nobody can go and check.
 */
export function assertAccountedFor(tables, verdicts) {
  const given = new Set(tables.map((t) => t.index));
  const seen = new Map();
  for (const verdict of verdicts) {
    if (!given.has(verdict.index)) {
      throw new Error(`table specialist judged table ${verdict.index}, which it was not given`);
    }
    if (seen.has(verdict.index)) {
      throw new Error(`table specialist judged table ${verdict.index} twice`);
    }
    if (!TABLE_VERDICTS.includes(verdict.verdict)) {
      throw new Error(
        `table specialist returned unknown verdict ${JSON.stringify(verdict.verdict)} for table ` +
          `${verdict.index}. One of: ${TABLE_VERDICTS.join(", ")}`,
      );
    }
    seen.set(verdict.index, verdict);
  }
  const missing = [...given].filter((index) => !seen.has(index));
  if (missing.length) {
    throw new Error(
      `table specialist did not account for table(s) ${missing.join(", ")}. ` +
        `A table nobody judged and a table holding nothing must not look the same.`,
    );
  }
  return verdicts;
}

/**
 * Judges one chapter's tables. Returns `{ items, tables }`.
 *
 * `runClaude` is injectable so tests never spawn a model. Every item is stamped with the role that
 * produced it, which is what lets the snapshot attribute a reviewer's later correction back here.
 */
export function judgeTables({ tables, targetLanguage, meta = null, runClaude } = {}) {
  if (!Array.isArray(tables) || tables.length === 0) {
    return { items: [], tables: [] };
  }
  const prompt = renderTableSpecialistPrompt({ tables, targetLanguage, meta });
  const raw = runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {});
  const parsed = JSON.parse(extractJsonObjectText(raw));

  const verdicts = Array.isArray(parsed.tables) ? parsed.tables : [];
  assertAccountedFor(tables, verdicts);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
  }));
  return { items, tables: verdicts };
}

/** The prompt template, for the eval fixtures and the golden placeholder check. */
export function readPromptTemplate() {
  return readFileSync(TABLE_SPECIALIST_PROMPT_PATH, "utf-8");
}

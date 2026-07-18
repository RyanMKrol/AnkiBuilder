import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the extraction and forward-flag
// prompts — a plain, human-editable Markdown file meant to be tuned by hand.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "pedagogical-sort-prompt.md"),
);

const NO_BOOK_CONVENTIONS = "(no book-wide conventions available for this source)";

function substitute(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

export function renderPedagogicalSortPrompt({
  targetLanguage,
  items,
  bookConventions = null,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  const template = readFileSync(templatePath, "utf-8");
  // Only the fields the ordering decision needs — keep the prompt payload lean.
  const itemData = items.map(({ id, english, target, category, notes }) => {
    const entry = { id, english, target };
    if (category) entry.category = category;
    if (notes) entry.notes = notes;
    return entry;
  });

  const rendered = substitute(template, {
    TARGET_LANGUAGE: targetLanguage,
    ITEM_COUNT: String(items.length),
    ITEMS_JSON: JSON.stringify(itemData, null, 2),
    BOOK_CONVENTIONS: bookConventions || NO_BOOK_CONVENTIONS,
  });

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}

// The model is asked for a bare JSON object but may wrap it in a markdown fence or preface it
// with prose. Prefer a fenced block; otherwise take the span from the first "{" to the last "}"
// rather than requiring the entire response to be JSON. Mirrors epubForwardFlags.js.
function extractJsonObjectText(raw) {
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return raw.trim();
}

function parseSortResponse(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.order)) {
    throw new Error('model response must be a JSON object with an "order" array');
  }
  if (!parsed.order.every((id) => typeof id === "string")) {
    throw new Error('every entry in "order" must be a string id');
  }

  return parsed.order;
}

// Re-order `items` to follow `order`, defensively: honor the model's sequence for every id it
// names (once, ignoring unknown ids), then append any items the model omitted in their original
// relative order. This can never add, drop, or duplicate an item — a malformed/partial `order`
// degrades toward the original order rather than corrupting the corpus.
function reorderByIds(items, order) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set();
  const result = [];

  for (const id of order) {
    if (byId.has(id) && !seen.has(id)) {
      result.push(byId.get(id));
      seen.add(id);
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * LLM-driven, dependency-aware pedagogical re-ordering of a lesson's items. Asks a Sonnet-medium
 * model to sequence the items so a learner meets vocabulary before the sentences built from it
 * (atoms → molecules), keeping related items grouped. Purely a re-ordering: the returned items are
 * the SAME objects, unchanged, in a new order.
 *
 * Returns `{ items, changed }`: `items` is the re-ordered array (same objects, same count);
 * `changed` is whether the order actually differs from the input.
 *
 * No-ops (returns items unchanged, `changed: false`) when there's nothing to order — fewer than two
 * items — without ever invoking runClaude. Fails open on any parse/shape/thrown error: logs a
 * warning naming the actual failure and returns items in their original order, never blocking
 * assemble.
 */
export function sortItemsPedagogically({
  items,
  targetLanguage,
  bookConventions = null,
  log = () => {},
  runClaude = defaultRunClaude,
} = {}) {
  if (!Array.isArray(items) || items.length < 2) {
    return { items, changed: false };
  }

  const prompt = renderPedagogicalSortPrompt({ targetLanguage, items, bookConventions });

  let order;
  try {
    order = parseSortResponse(runClaude(prompt));
  } catch (error) {
    log(`pedagogical sort: failed (${error.message}) — keeping the extracted order`);
    return { items, changed: false };
  }

  const reordered = reorderByIds(items, order);
  const changed = reordered.some((item, index) => item !== items[index]);
  return { items: reordered, changed };
}

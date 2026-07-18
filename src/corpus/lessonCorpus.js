import { CATEGORIES } from "../model/categories.js";
import { validateCorpus } from "../model/index.js";
import { slugify } from "../util/slugify.js";
import { runClaude as defaultRunClaude } from "../translate/runClaude.js";

// Unbounded — one call for the whole lesson, same reasoning as translate/index.js's own BATCH_SIZE
// (every LLM pass is pinned to Sonnet at medium effort, which handles a whole lesson in one shot).
const BATCH_SIZE = Infinity;

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function uniqueId(english, usedIds) {
  const base = slugify(english, { maxLength: 40 });
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  usedIds.add(candidate);
  return candidate;
}

function buildCategorizePrompt(items) {
  return [
    "# Task: Categorize Flashcard Terms",
    "",
    "## Overview",
    "You are assigning a topical category to a list of English flashcard terms, dictated",
    "from a real-life language lesson. No translation is needed here — only categorization.",
    "",
    "## Input Format",
    "A JSON array of objects, one per term:",
    "",
    "- `id` (string): a unique identifier for this item — reuse it unchanged in your response.",
    "- `english` (string): the English term or phrase.",
    "",
    "## Allowed Categories",
    "Choose exactly one, verbatim, from this list:",
    JSON.stringify(CATEGORIES),
    "",
    "## Output Format",
    "Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).",
    "Produce exactly one object per input item:",
    "",
    "- `id` (string): the SAME id as the corresponding input item.",
    "- `category` (string): the single best-fitting category from the allowed list above.",
    "",
    "### Example Output",
    "```json",
    JSON.stringify([{ id: "good-morning", category: "Greetings" }], null, 2),
    "```",
    "",
    "## Important",
    "- Include every id from the input exactly once.",
    "  - Order does not matter.",
    "- Only use categories from the allowed list, verbatim (exact spelling/casing).",
    "- Do not wrap the response in markdown code fences.",
    "- Do not include any text before or after the JSON array.",
    "",
    `## Input Data (${items.length} item(s))`,
    "```json",
    JSON.stringify(items, null, 2),
    "```",
  ].join("\n");
}

function stripMarkdownFence(text) {
  const match = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return match ? match[1] : text;
}

function parseCategoryBatch(raw) {
  const trimmed = stripMarkdownFence(raw.trim()).trim();
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("model response must be a JSON array");
  }
  return parsed;
}

/**
 * Builds a schema-valid corpus from a plain list of English phrases dictated from a
 * real-life lesson — unlike assembleCorpusFromChapter (epubLlmCorpus.js), there is no
 * bilingual source text to extract a translation from, so every item's `target` stays
 * null here, exactly like a freshly-loaded template — ready for the normal translate
 * stage to fill in. The only per-item judgment call this makes is category assignment,
 * via a small batched Haiku pass. Mirrors the rest of this project's "flag/fail open,
 * never block" idiom: a batch that fails to parse, or returns no valid category for an
 * item, defaults that item to "Other" rather than failing assembly — the corpus review
 * stage (same as every other source) is where a wrong category actually gets fixed.
 */
export function assembleCorpusFromLessonWords({
  englishWords,
  targetLanguage,
  runClaude = defaultRunClaude,
  log = () => {},
} = {}) {
  if (!Array.isArray(englishWords) || englishWords.length === 0) {
    throw new Error("englishWords must be a non-empty array");
  }

  const usedIds = new Set();
  const items = englishWords.map((english) => ({
    id: uniqueId(english, usedIds),
    english,
    category: "Other",
    notes: null,
    target: null,
  }));

  for (const batch of chunk(items, BATCH_SIZE)) {
    try {
      const prompt = buildCategorizePrompt(
        batch.map((item) => ({ id: item.id, english: item.english })),
      );
      const entries = parseCategoryBatch(runClaude(prompt));
      const byId = new Map(
        entries
          .filter((entry) => entry && typeof entry === "object" && typeof entry.id === "string")
          .map((entry) => [entry.id, entry]),
      );

      for (const item of batch) {
        const entry = byId.get(item.id);
        if (entry && CATEGORIES.includes(entry.category)) {
          item.category = entry.category;
        } else {
          log(
            `categorization missing/invalid for "${item.english}" (id: ${item.id}) — defaulting to "Other"`,
          );
        }
      }
    } catch (error) {
      log(`categorization batch failed (${error.message}) — defaulting this batch to "Other"`);
    }
  }

  const corpus = {
    meta: {
      targetLanguage,
      sourceType: "manual",
      reviewed: false,
    },
    items,
  };

  validateCorpus(corpus);
  return corpus;
}

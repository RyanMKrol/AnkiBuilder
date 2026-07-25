import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { normalizeDisplayText } from "../model/scriptSpacing.js";
import { resolveIso639Code } from "../model/iso639.js";
import { runClaude as defaultRunClaude } from "../corpus/epubLlmRunClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) for the same reason as the extraction, forward-flag and pedagogical-sort
// prompts — a plain, human-editable Markdown file meant to be tuned by hand.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "fill-in-blank-prompt.md"),
);

const NO_EARLIER_VOCAB = "(no earlier lessons — this is the first lesson of the course)";

// How many practice cards to ask for. Deliberately modest: the de-dup pass that follows deletes
// pattern-repeats, so a big haul mostly converts into a big deletion list.
const DEFAULT_TARGET_COUNT = 12;

const SOURCE_FROM_FILE = (path) =>
  [
    `The lesson's source material is the file at:`,
    "",
    `    ${path}`,
    "",
    "**Read that file yourself with your Read tool** and mine its fill-in-the-blank drills, substitution",
    "tables and practice exercises. Work from what the source actually drills rather than inventing",
    "exercises of your own.",
  ].join("\n");

const SOURCE_NONE = [
  "This lesson has **no source document** — it was dictated as a plain word list.",
  "",
  "Compose practice sentences directly from the lesson's own cards below: take the sentence patterns",
  "the lesson teaches and exercise them against the lesson's other vocabulary. Everything in the",
  "vocabulary rule below still applies.",
].join("\n");

export function renderFillInBlankPrompt({
  cards,
  chapterFilePath = null,
  earlierVocab = null,
  targetLanguage,
  targetCount = DEFAULT_TARGET_COUNT,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  // Only the fields the drill-writing decision needs — keep the prompt payload lean.
  const cardData = cards.map((card) => {
    const entry = { id: card.id, english: card.english, target: card.target };
    if (card.category) entry.category = card.category;
    if (card.reading) entry.reading = card.reading;
    if (card.excluded) entry.excluded = true;
    return entry;
  });

  return renderPromptTemplate(templatePath, {
    TARGET_LANGUAGE: targetLanguage,
    SOURCE_INSTRUCTION: chapterFilePath ? SOURCE_FROM_FILE(chapterFilePath) : SOURCE_NONE,
    CARDS_JSON: JSON.stringify(cardData, null, 2),
    EARLIER_VOCAB: earlierVocab || NO_EARLIER_VOCAB,
    TARGET_COUNT: String(targetCount),
  });
}

function parseCardsResponse(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cards)) {
    throw new Error('model response must be a JSON object with a "cards" array');
  }
  return parsed.cards;
}

// A returned card is only usable if it carries every field the deck needs as a non-empty string.
// Anything short of that is dropped rather than patched: a practice card is optional enrichment, so
// a half-formed one is worth less than no card at all.
function isUsable(card) {
  return ["id", "english", "category", "target", "pronunciation"].every(
    (field) => typeof card[field] === "string" && card[field].trim().length > 0,
  );
}

/**
 * Mines fill-in-the-blank practice cards out of a lesson's source material (or, for a dictated
 * lesson with no source, out of the lesson's own patterns) and appends them to the card list as a
 * contiguous drill block at the END — a drill only ever reuses vocabulary the lesson has already
 * introduced, so putting the block last keeps the lesson's dependency order intact.
 *
 * Every produced card is marked `fillInBlank: true` so the reviews can badge it and the semantic
 * de-dup pass can target it.
 *
 * Returns `{ items, added, patterns }`: `items` is the full card list with the drills appended,
 * `added` the drill cards alone, and `patterns` an id → sentence-frame map for the de-dup pass to
 * group on (the frame is prompt-only scaffolding and is never persisted to cards.json).
 *
 * Fails open: any parse/shape/thrown error logs a warning naming the actual failure and returns the
 * cards untouched, never blocking the build.
 */
export function mineFillInBlankCards({
  items,
  targetLanguage,
  chapterFilePath = null,
  earlierVocab = null,
  targetCount = DEFAULT_TARGET_COUNT,
  log = () => {},
  runClaude = defaultRunClaude,
} = {}) {
  const empty = { items, added: [], patterns: {} };
  if (!Array.isArray(items) || items.length === 0) {
    return empty;
  }
  if (chapterFilePath && !existsSync(chapterFilePath)) {
    log(
      `fill-in-the-blank: source file not found at ${chapterFilePath} — skipping drill enrichment`,
    );
    return empty;
  }

  const prompt = renderFillInBlankPrompt({
    cards: items,
    chapterFilePath,
    earlierVocab,
    targetLanguage,
    targetCount,
  });

  let produced;
  try {
    produced = parseCardsResponse(runClaude(prompt));
  } catch (error) {
    log(`fill-in-the-blank: failed (${error.message}) — leaving the lesson's cards as they are`);
    return empty;
  }

  const displayLang = resolveIso639Code(targetLanguage);
  const knownCategories = new Set(items.map((item) => item.category).filter(Boolean));
  const fallbackCategory = items[0]?.category || "Other";
  const usedIds = new Set(items.map((item) => item.id));

  const added = [];
  const patterns = {};
  for (const card of produced) {
    if (!card || typeof card !== "object" || !isUsable(card) || usedIds.has(card.id)) continue;
    usedIds.add(card.id);

    const item = {
      id: card.id,
      english: card.english.trim(),
      // A category the lesson doesn't already use would show up as a stray group in the review, so
      // snap an unrecognized one back to a category this lesson actually has.
      category: knownCategories.has(card.category) ? card.category : fallbackCategory,
      target: normalizeDisplayText(card.target.trim(), displayLang),
      pronunciation: card.pronunciation.trim(),
      note: typeof card.note === "string" && card.note.trim() ? card.note.trim() : null,
      // Provenance: these are AI-authored practice cards, not source material. `aiSuggested` is what
      // the dashboard badges at every gate; `fillInBlank` is what the de-dup pass targets.
      fillInBlank: true,
      aiSuggested: true,
    };
    if (typeof card.reading === "string" && card.reading.trim()) {
      item.reading = normalizeDisplayText(card.reading.trim(), displayLang);
    }
    added.push(item);
    if (typeof card.sourcePattern === "string" && card.sourcePattern.trim()) {
      patterns[item.id] = card.sourcePattern.trim();
    }
  }

  if (added.length === 0) {
    log(
      "fill-in-the-blank: no usable practice cards produced — leaving the lesson's cards as they are",
    );
    return empty;
  }

  return { items: [...items, ...added], added, patterns };
}

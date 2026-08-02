import { renderExtractionPrompt } from "./epubLlmPrompt.js";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";
import { CATEGORIES } from "../model/categories.js";

// The model is told to respond with ONLY a JSON array, but in practice two
// deviations have both been observed for real: the whole response wrapped in
// a ```json fence, and — from Haiku specifically — prose commentary before a
// fenced block ("Now I'll extract... ```json\n[...]\n```"). Searching for the
// first fenced block whose content is array-shaped (not just the first fence —
// a preamble can carry an incidental fence of its own) handles both. With no
// array-shaped fence, take the span from the first "[" to the last "]" (the
// prose-then-bare-JSON case, mirroring the object-side helper in
// epubForwardFlags.js); only a response with neither is treated as raw JSON.
function extractJsonArrayText(raw) {
  const fences = [...raw.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
  const arrayFence = fences.find((m) => m[1].trim().startsWith("["));
  if (arrayFence) {
    return arrayFence[1];
  }

  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return raw.slice(firstBracket, lastBracket + 1);
  }

  return raw.trim();
}

function validateItem(item, index) {
  if (typeof item !== "object" || item === null) {
    throw new Error(`item ${index} must be an object`);
  }
  for (const field of ["id", "english", "target", "category"]) {
    if (typeof item[field] !== "string" || !item[field]) {
      throw new Error(`item ${index} missing required string field "${field}"`);
    }
  }
  if (!CATEGORIES.includes(item.category)) {
    throw new Error(`item ${index} has an invalid "category": ${JSON.stringify(item.category)}`);
  }
  for (const noteField of ["hint", "note", "cardNote", "reviewNote", "notes"]) {
    if (item[noteField] !== undefined && typeof item[noteField] !== "string") {
      throw new Error(`item ${index} field "${noteField}" must be a string when present`);
    }
  }
  if (item.reading !== undefined && typeof item.reading !== "string") {
    throw new Error(`item ${index} field "reading" must be a string when present`);
  }
  if (item.uncertain !== undefined && typeof item.uncertain !== "boolean") {
    throw new Error(`item ${index} field "uncertain" must be a boolean when present`);
  }
  if (item.aiSuggested !== undefined && typeof item.aiSuggested !== "boolean") {
    throw new Error(`item ${index} field "aiSuggested" must be a boolean when present`);
  }
}

/**
 * Extracts a flashcard-worthy item list from ONE chapter file by having the
 * model read it directly (no pre-split text blocks). Returns the parsed and
 * validated item array: { id, english, target, category, reading?, reviewNote?, uncertain?, aiSuggested? }.
 *
 * This is the extraction primitive only — it does not write corpus.json/
 * cards.json, generate pronunciation, or handle more than one chapter. See
 * docs/epub-extraction-prompt.md for the prompt itself.
 */
export function extractChapterViaLlm({
  chapterFilePath,
  targetLanguage,
  categoryList = CATEGORIES,
  bookConventions = null,
  runClaude = defaultRunClaude,
} = {}) {
  const prompt = renderExtractionPrompt({
    targetLanguage,
    chapterFilePath,
    categoryList,
    bookConventions,
  });
  const raw = runClaude(prompt);

  const jsonText = extractJsonArrayText(raw);
  let items;
  try {
    items = JSON.parse(jsonText);
  } catch {
    throw new Error("model response was not valid JSON (even after stripping any markdown fence)");
  }

  if (!Array.isArray(items)) {
    throw new Error("model response must be a JSON array");
  }

  items.forEach(validateItem);

  return items;
}

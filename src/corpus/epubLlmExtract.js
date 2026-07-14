import { renderExtractionPrompt } from "./epubLlmPrompt.js";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";

// The model is told to respond with ONLY a JSON array, but in practice two
// deviations have both been observed for real: the whole response wrapped in
// a ```json fence, and — from Haiku specifically — prose commentary before a
// fenced block ("Now I'll extract... ```json\n[...]\n```"). Searching for a
// fenced block anywhere in the text (not just at the very start/end) handles
// both; a response with no fence at all is treated as already being raw JSON.
function extractJsonArrayText(raw) {
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  return raw.trim();
}

function validateItem(item, index) {
  if (typeof item !== "object" || item === null) {
    throw new Error(`item ${index} must be an object`);
  }
  for (const field of ["id", "english", "target"]) {
    if (typeof item[field] !== "string" || !item[field]) {
      throw new Error(`item ${index} missing required string field "${field}"`);
    }
  }
  if (item.notes !== undefined && typeof item.notes !== "string") {
    throw new Error(`item ${index} field "notes" must be a string when present`);
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
 * validated item array: { id, english, target, notes?, uncertain?, aiSuggested? }.
 *
 * This is the extraction primitive only — it does not write corpus.json/
 * cards.json, assign categories, generate pronunciation, or handle more than
 * one chapter. See docs/epub-extraction-prompt.md for the prompt itself.
 */
export function extractChapterViaLlm({
  chapterFilePath,
  targetLanguage,
  runClaude = defaultRunClaude,
} = {}) {
  const prompt = renderExtractionPrompt({ targetLanguage, chapterFilePath });
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

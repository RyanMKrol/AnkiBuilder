import { readFileSync } from "fs";
import { basename } from "path";
import { renderExtractionPrompt } from "./epubLlmPrompt.js";
import { runClaude as defaultRunClaude } from "./epubLlmRunClaude.js";
import { referencedImageSrcs } from "./epubArchive.js";
import { CATEGORIES } from "../model/categories.js";

// The model is told to respond with ONLY JSON, but in practice two deviations have both been
// observed for real: the whole response wrapped in a ```json fence, and — from Haiku specifically —
// prose commentary before a fenced block ("Now I'll extract... ```json\n[...]\n```"). Searching for
// the first fenced block whose content is JSON-shaped (not just the first fence — a preamble can
// carry an incidental fence of its own) handles both. With no such fence, take the outermost span
// (the prose-then-bare-JSON case, mirroring the object-side helper in epubForwardFlags.js); only a
// response with neither is treated as raw JSON.
//
// The response may be a bare ARRAY of items or the ENVELOPE `{ items, coverage }`, so the span can
// be object-shaped or array-shaped. Both are accepted permanently: the envelope is what the prompt
// now asks for, but an older cached response, a smaller model or a partial answer will still be a
// bare array, and an extraction that lost its coverage report is far better than one that throws.
function extractJsonText(raw) {
  const fences = [...raw.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
  const jsonFence = fences.find((m) => /^[[{]/.test(m[1].trim()));
  if (jsonFence) return jsonFence[1];

  const spans = [
    [raw.indexOf("{"), raw.lastIndexOf("}")],
    [raw.indexOf("["), raw.lastIndexOf("]")],
  ]
    .filter(([open, close]) => open !== -1 && close > open)
    // Whichever opens first is the outer one: an envelope's `{` precedes its items' `[`.
    .sort((a, b) => a[0] - b[0]);
  if (spans.length) {
    const [open, close] = spans[0];
    return raw.slice(open, close + 1);
  }

  return raw.trim();
}

// A coverage block the model did not send, or sent malformed, is reported as absent rather than
// throwing: the items are the valuable part of the response and must never be lost to a bad
// side-channel. `null` and "the model sent nothing" mean the same thing on purpose — the chapter's
// image coverage is unknown, which is exactly what the caller warns about.
function normalizeCoverage(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const strings = (value) =>
    Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim()) : [];
  return {
    imagesOpened: strings(raw.imagesOpened),
    imagesSkippedAsDecorative: strings(raw.imagesSkippedAsDecorative),
    concerns: strings(raw.concerns),
  };
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
  for (const noteField of ["scene", "hint", "note", "cardNote", "reviewNote", "notes"]) {
    if (item[noteField] !== undefined && typeof item[noteField] !== "string") {
      throw new Error(`item ${index} field "${noteField}" must be a string when present`);
    }
  }
  if (item.ttsText !== undefined && typeof item.ttsText !== "string") {
    throw new Error(`item ${index} field "ttsText" must be a string when present`);
  }
  if (item.uncertain !== undefined && typeof item.uncertain !== "boolean") {
    throw new Error(`item ${index} field "uncertain" must be a boolean when present`);
  }
  if (item.aiSuggested !== undefined && typeof item.aiSuggested !== "boolean") {
    throw new Error(`item ${index} field "aiSuggested" must be a boolean when present`);
  }
}

/**
 * Every image this chapter's markup references, compared against the ones the model says it opened
 * or dismissed as decorative. Matched on BASENAME: the model reports whatever path it resolved and
 * opened, which is rarely character-identical to the `<img src>` in the markup.
 *
 * The gap this closes: a chapter the model could not read produces the same output shape as a
 * chapter with nothing in it. taught-index.json records `teaches: []` for the two image-only kana
 * chapters, and nothing distinguishes that from "read it, found nothing".
 */
export function diffImageCoverage(chapterHtml, coverage) {
  const referenced = referencedImageSrcs(chapterHtml);
  if (!coverage) {
    return { referenced, accountedFor: [], unaccountedFor: referenced, reported: false };
  }

  const seen = new Set(
    [...coverage.imagesOpened, ...coverage.imagesSkippedAsDecorative].map((path) =>
      basename(String(path)),
    ),
  );
  return {
    referenced,
    accountedFor: referenced.filter((src) => seen.has(basename(src))),
    unaccountedFor: referenced.filter((src) => !seen.has(basename(src))),
    reported: true,
  };
}

/**
 * Extracts a flashcard-worthy item list from ONE chapter file by having the model read it directly
 * (no pre-split text blocks).
 *
 * Returns `{ items, coverage, imageCoverage }`:
 *  - `items`: the parsed, validated items —
 *    { id, english, target, category, ttsText?, reviewNote?, uncertain?, aiSuggested? }
 *  - `coverage`: the model's own report, `{ imagesOpened, imagesSkippedAsDecorative, concerns }`,
 *    or null when it sent none
 *  - `imageCoverage`: that report diffed against the images the chapter actually references
 *
 * Every unaccounted-for image and every stated concern is logged. It is a WARNING and never a
 * failure: the model's account of its own work is evidence, not proof, and an extraction is not
 * worth discarding over a side-channel.
 *
 * This is the extraction primitive only — it does not write corpus.json/cards.json, generate
 * pronunciation, or handle more than one chapter. See docs/epub-extraction-prompt.md for the prompt.
 */
export function extractChapterViaLlm({
  chapterFilePath,
  targetLanguage,
  categoryList = CATEGORIES,
  bookConventions = null,
  runClaude = defaultRunClaude,
  log = () => {},
} = {}) {
  const prompt = renderExtractionPrompt({
    targetLanguage,
    chapterFilePath,
    categoryList,
    bookConventions,
  });
  const raw = runClaude(prompt);

  const jsonText = extractJsonText(raw);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("model response was not valid JSON (even after stripping any markdown fence)");
  }

  const isEnvelope = !Array.isArray(parsed) && parsed && typeof parsed === "object";
  const items = isEnvelope ? parsed.items : parsed;
  const coverage = isEnvelope ? normalizeCoverage(parsed.coverage) : null;

  if (!Array.isArray(items)) {
    throw new Error(
      "model response must be a JSON array of items, or an object with an `items` array",
    );
  }

  items.forEach(validateItem);

  const chapterHtml = readChapterHtml(chapterFilePath);
  const imageCoverage = chapterHtml ? diffImageCoverage(chapterHtml, coverage) : null;
  reportCoverage({ imageCoverage, coverage, items, log });

  return { items, coverage, imageCoverage };
}

function readChapterHtml(chapterFilePath) {
  try {
    return readFileSync(chapterFilePath, "utf-8");
  } catch {
    // The prompt named a path the model could read. If this process cannot, that costs nothing more
    // than the coverage diff.
    return null;
  }
}

function reportCoverage({ imageCoverage, coverage, items, log }) {
  for (const concern of coverage?.concerns ?? []) {
    log(`extraction concern: ${concern}`);
  }
  if (!imageCoverage || imageCoverage.referenced.length === 0) return;

  if (!imageCoverage.reported) {
    log(
      `extraction: ${imageCoverage.referenced.length} image(s) referenced by this chapter and no ` +
        `coverage report from the model, so whether it opened them is unknown` +
        (items.length === 0 ? ", and it returned no items at all" : ""),
    );
    return;
  }
  if (imageCoverage.unaccountedFor.length > 0) {
    log(
      `extraction: ${imageCoverage.unaccountedFor.length} of ${imageCoverage.referenced.length} ` +
        `referenced image(s) unaccounted for (neither opened nor called decorative): ` +
        imageCoverage.unaccountedFor.join(", "),
    );
  }
}

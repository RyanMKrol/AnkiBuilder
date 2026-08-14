import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { runClaude as defaultRunClaude } from "./runClaude.js";
import { getLanguagePromptRules } from "./languageRules.js";
import { resolveIso639Code } from "../model/iso639.js";
import { renderPromptTemplate } from "../util/promptTemplate.js";
import { chunk } from "../util/chunk.js";
import { stripMarkdownFence } from "../util/markdownFence.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

// Lives in docs/ (not src/) like every other prompt in the pipeline: a plain, human-editable
// Markdown file. This one touches EVERY card in every deck and used to be the only prompt a human
// could not edit without a code change, which is exactly how its hand-maintained transcript in
// docs/translate-prompts.md drifted from the prompt actually being sent.
const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "romanization-prompt.md"),
);

// Same batch size/semantics as the rest of the translate stage: unbounded, i.e. one call per group.
// (A const of its own rather than imported from index.js because index.js imports
// romanizeAndEvaluate from here, so this module can't import back from index.js.)
const BATCH_SIZE = Infinity;

export function buildRomanizationPrompt(
  items,
  targetLanguage,
  { templatePath = DEFAULT_TEMPLATE_PATH, languageCode = null } = {},
) {
  const inputData = items.map((item) => ({
    id: item.id,
    english: item.english,
    // The text that was actually romanized — the spoken `ttsText` when set (e.g. kana にせんえん),
    // else `target`. This is what the romanization must match, not a digit/kanji display form.
    target: item.ttsText || item.target,
    libraryRomanization: item.libraryPronunciation,
  }));

  // Per-language style fragment, same plug-in shape as every other prompt (languageRules.js). No
  // language sets `romanizationStyle` yet; it is the single place a pinned Hepburn spec belongs, so
  // that all four prompts that romanize can be fed from one string instead of drifting apart.
  const rules = getLanguagePromptRules(languageCode ?? resolveIso639Code(targetLanguage));
  const styleRules = rules.romanizationStyle ?? [];

  return renderPromptTemplate(templatePath, {
    TARGET_LANGUAGE: targetLanguage,
    // The placeholder sits in an already-flush "## Important" bullet list, so each rule is a
    // plain top-level bullet. Empty for a language with no configured style.
    ROMANIZATION_STYLE_RULES: styleRules.map((rule) => `- ${rule}`).join("\n"),
    ITEM_COUNT: String(items.length),
    INPUT_JSON: JSON.stringify(inputData, null, 2),
  });
}

function parseEvalBatch(raw) {
  const trimmed = stripMarkdownFence(raw.trim()).trim();
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("model response must be a JSON array");
  }
  return parsed;
}

// Deterministic tidy-up applied to whatever romanization we end up with (model correction or library
// fallback): a space before ASCII punctuation is never right in a romanization ("desu ." → "desu."),
// nor are doubled/edge spaces. Catches the residue the model occasionally leaves (kuroshiro emits
// "desu ." and the model sometimes agrees). Safe for every language's romanization/transliteration.
function normalizeRomaji(text) {
  return text
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function assembleCard(item, correction) {
  // Use the model's corrected romanization; fall back to the library's value only when the model
  // omitted this item or returned a non-string (fail-open — a real romanization beats nothing).
  const chosen =
    correction &&
    typeof correction.pronunciation === "string" &&
    correction.pronunciation.length > 0
      ? correction.pronunciation
      : item.libraryPronunciation;

  const card = { ...item, pronunciation: normalizeRomaji(chosen) };
  delete card.libraryPronunciation;
  return card;
}

/**
 * Corrects the library-romanized items with the pinned Sonnet-medium model. The library
 * (kuroshiro et al.) is a starting point, not ground truth — it frequently mis-splits words,
 * mishandles the sokuon っ, and spells unfamiliar kana letter-by-letter — so the model reviews
 * every romanization and returns the CORRECT value in place (keeping the library's when it's already
 * right, fixing it when it's wrong). The corrected value lands directly in `pronunciation`; no
 * `uncertain` flag or note is added — the correction IS the resolution.
 *
 * Fails open on a malformed/missing response: any item in an unparseable batch, or any item the
 * model omits, keeps the library's romanization rather than being dropped — a real (if imperfect)
 * value beats none.
 */
function correctRomanizations(items, { targetLanguage, runClaude, log = () => {} }) {
  const cards = [];

  for (const batch of chunk(items, BATCH_SIZE)) {
    const prompt = buildRomanizationPrompt(batch, targetLanguage);

    let correctionById = new Map();
    try {
      const corrections = parseEvalBatch(runClaude(prompt));
      for (const correction of corrections) {
        if (correction && typeof correction === "object" && typeof correction.id === "string") {
          correctionById.set(correction.id, correction);
        }
      }
    } catch (error) {
      // Fail open — every item below keeps the library value — but SAY so: the library's known
      // failure modes (mis-split words, literal "tsu" for っ) go uncorrected for this whole batch.
      correctionById = new Map();
      log(
        `romanization eval: failed (${error.message}) — keeping the library romanization for ${batch.length} item(s)`,
      );
    }

    for (const item of batch) {
      cards.push(assembleCard(item, correctionById.get(item.id)));
    }
  }

  return cards;
}

/**
 * Fills in `pronunciation` for every item already holding a `target` (freshly translated or
 * pre-existing), via the configured romanization library for `targetLanguage` plus a Sonnet-medium
 * correction pass — see `correctRomanizations`. A per-item adapter failure (missing package,
 * dictionary load failure, or any other library-internal error) is not a hard failure: that one
 * item falls through to the ordinary pronunciation-only LLM path instead (reusing
 * `buildPronunciationOnlyPrompt`/`validatePronunciationEntry`/`assemblePronunciationOnlyCard` from
 * `index.js`), logged via `log()`, with no `uncertain` flag (it used the other already-trusted
 * path, not uncertain content).
 *
 * Returns `{ items: cards, errors }` — `errors` mirrors `translateCorpus`'s shape but is expected
 * to stay empty in practice, since every item here either gets a library-or-fallback
 * pronunciation; kept for interface consistency with the rest of the translate pipeline.
 */
export async function romanizeAndEvaluate(
  items,
  { targetLanguage, libraryEntry, runClaude = defaultRunClaude, log = () => {}, fallback },
) {
  const romanized = [];
  const needsFallback = [];

  for (const item of items) {
    try {
      const mod = await libraryEntry.load();
      // Romanize the spoken form when set (e.g. kana にせんえん) rather than the display
      // `target` (e.g. "2,000えん", which kuroshiro would leave as "2 , 000 en").
      const libraryPronunciation = await mod.romanize(item.ttsText || item.target);
      romanized.push({ ...item, libraryPronunciation });
    } catch (error) {
      log(
        `romanization library failed for item ${item.id} (${error.message}) — falling back to LLM-only pronunciation`,
      );
      needsFallback.push(item);
    }
  }

  const corrected = correctRomanizations(romanized, { targetLanguage, runClaude, log });
  const { items: fallbackCards, errors } = fallback(needsFallback);

  return { items: [...corrected, ...fallbackCards], errors };
}

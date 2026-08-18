import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { runRomanizationClaude as defaultRunClaude } from "./runClaude.js";
import { getLanguagePromptRules, romanizationExamples } from "./languageRules.js";
import { formatStyleRules } from "./romajiStyle.js";
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

  // Per-language fragments, same plug-in shape as every other prompt (languageRules.js). Everything
  // language-specific in this prompt comes from there — the style rules, what the library gets
  // wrong, the romanization system's name, and the few-shot pair. It used to be written into the
  // template, so a Hindi or Arabic run was shown two Japanese exemplars (ろっかい, こんにちは) and
  // told about the small っ. Few-shot examples dominate a one-line instruction, so the model was
  // anchored on the wrong task entirely.
  //
  // `romanizationStyle` in particular is the pinned spec from src/translate/romajiStyle.js — the
  // same list the number-reading and fill-in-the-blank passes get, and the same one preflight lints
  // the result against, so no pass can describe the style in its own words.
  const code = languageCode ?? resolveIso639Code(targetLanguage);
  const rules = getLanguagePromptRules(code);
  const styleRules = rules.romanizationStyle ?? [];
  const examples = romanizationExamples(code);
  // Whether a library value is coming at all. `hasLibrary` is what the caller knows: a language with
  // no configured library takes the LLM-only path per ITEM, but a per-item adapter failure also
  // lands here with no `libraryRomanization`, so the prompt has to read correctly either way.
  const withLibrary = inputData.some((item) => item.libraryRomanization);
  const failureModes = rules.libraryFailureModes ?? [];

  return renderPromptTemplate(templatePath, {
    TARGET_LANGUAGE: targetLanguage,
    // The standard system's name, so the instruction is concrete rather than "the standard system
    // for X, whatever that is". Falls back to a description that is true of every language.
    ROMANIZATION_SYSTEM:
      rules.romanizationSystem ?? `the standard romanization for ${targetLanguage}`,
    LIBRARY_INPUT_CLAUSE: withLibrary
      ? " and a `libraryRomanization` — a romanization produced by a deterministic library"
      : "",
    LIBRARY_FAILURE_MODES:
      withLibrary && failureModes.length
        ? `That library is a useful starting point but is frequently WRONG for ${targetLanguage}:\n` +
          failureModes.map((mode) => `- ${mode}`).join("\n") +
          "\n\nKeep its value where it is already right, and fix it everywhere it is not."
        : withLibrary
          ? "That library is a starting point, not an answer. Keep its value where it is already " +
            "right, and fix it everywhere it is not."
          : "",
    // Rendered through the shared formatter so this pass cannot format the pinned spec differently
    // from the three others that inject it. The placeholder sits on an already-indented
    // continuation line of an "## Important" bullet, so the first rule needs no indent of its own
    // and the rest align under it. Empty for a language with no configured style.
    ROMANIZATION_STYLE_RULES: formatStyleRules(styleRules, { indent: "  " }),
    // The example INPUT is the example minus its answer, and minus the library value when this run
    // has no library — showing a `libraryRomanization` that the real input will not carry teaches
    // the model to expect a field that is not there.
    EXAMPLE_INPUT: JSON.stringify(
      examples.map((example) =>
        omit(example, "pronunciation", ...(withLibrary ? [] : ["libraryRomanization"])),
      ),
      null,
      2,
    ),
    EXAMPLE_OUTPUT: JSON.stringify(
      examples.map(({ id, pronunciation }) => ({ id, pronunciation })),
      null,
      2,
    ),
    ITEM_COUNT: String(items.length),
    INPUT_JSON: JSON.stringify(inputData, null, 2),
  });
}

function omit(object, ...keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
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
  const failedBatches = [];

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
      failedBatches.push(error.message);
      log(
        `romanization eval: failed (${error.message}) — keeping the library romanization for ${batch.length} item(s)`,
      );
    }

    for (const item of batch) {
      cards.push(assembleCard(item, correctionById.get(item.id)));
    }
  }

  return { cards, failed: failedBatches.length > 0, reason: failedBatches[0] ?? null };
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

  const {
    cards: corrected,
    failed,
    reason,
  } = correctRomanizations(romanized, {
    targetLanguage,
    runClaude,
    log,
  });
  const { items: fallbackCards, errors } = fallback(needsFallback);

  return { items: [...corrected, ...fallbackCards], errors, failed, reason };
}

import { validateCards } from "../model/index.js";
import { resolveIso639Code } from "../model/iso639.js";
import { runClaude as defaultRunClaude } from "./runClaude.js";
import { getRomanizationLibrary as defaultGetRomanizationLibrary } from "./romanizationLibraries.js";
import { romanizeAndEvaluate } from "./romanizationEval.js";

// Max corpus items per `claude -p` invocation. Unbounded — a lesson's worth of items goes in a
// SINGLE call now that every LLM pass is pinned to Sonnet at medium effort (a capable model handles
// a whole lesson in one shot, and one call keeps translations self-consistent instead of split
// across independent batches). Each of the two groups below (full-translation vs. pronunciation-only)
// is still a call of its own, since they're different tasks on different item sets.
const BATCH_SIZE = Infinity;

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function buildFullTranslationPrompt(items, targetLanguage) {
  const inputData = items.map((item) => {
    const entry = { id: item.id, english: item.english };
    if (item.notes) {
      entry.notes = item.notes;
    }
    return entry;
  });

  return [
    "# Task: Translate Flashcards",
    "",
    "## Overview",
    "You are translating flashcards for a language-learning deck.",
    `Target language: ${targetLanguage}.`,
    "You will be given a JSON array of English phrases and must translate each one, producing both a translation and a pronunciation guide.",
    "",
    "## Input Format",
    "The input is a JSON array of objects, one per flashcard:",
    "",
    "- `id` (string): a unique identifier for this item — reuse it unchanged in your response.",
    "- `english` (string): the English phrase to translate.",
    "- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.",
    "  - This is NOT a translation — use it only to disambiguate meaning or tone.",
    "",
    "### Example Input",
    "```json",
    JSON.stringify(
      [
        { id: "hello", english: "Hello" },
        { id: "cheese", english: "Cheese", notes: "as in the food, not a smile" },
      ],
      null,
      2,
    ),
    "```",
    "",
    "## Output Format",
    "Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).",
    "Produce exactly one object per input item:",
    "",
    "- `id` (string): the SAME id as the corresponding input item.",
    `- \`target\` (string): the translation into ${targetLanguage}.`,
    `- \`pronunciation\` (string): a pronunciation guide for \`target\`, readable by an English speaker unfamiliar with ${targetLanguage}.`,
    `  - If ${targetLanguage} has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.`,
    '  - Otherwise, fall back to a phonetic respelling using English spelling and stress conventions (e.g. "bohn-ZHOOR").',
    "- `hint` (string, optional): a short usage hint.",
    "  - Only include this key when you have something worth adding — omit it entirely otherwise.",
    "",
    "### Example Output",
    "```json",
    JSON.stringify(
      [
        { id: "hello", target: "Bonjour", pronunciation: "bohn-ZHOOR" },
        { id: "cheese", target: "Fromage", pronunciation: "froh-MAHZH", hint: "casual, singular" },
      ],
      null,
      2,
    ),
    "```",
    "",
    "## Important",
    "- Include every id from the input exactly once.",
    "  - Order does not matter.",
    "- Do not wrap the response in markdown code fences.",
    "- Do not include any text before or after the JSON array.",
    "",
    `## Input Data (${items.length} item(s) to translate)`,
    "```json",
    JSON.stringify(inputData, null, 2),
    "```",
  ].join("\n");
}

// Used instead of buildFullTranslationPrompt when a real romanization library (see
// romanizationLibraries.js) will produce `pronunciation` afterward — asking the model for a
// pronunciation guide it's never used would waste a model turn and risk the later eval step
// being anchored by having already seen the model's own (about-to-be-superseded) guess.
function buildTargetOnlyPrompt(items, targetLanguage) {
  const inputData = items.map((item) => {
    const entry = { id: item.id, english: item.english };
    if (item.notes) {
      entry.notes = item.notes;
    }
    return entry;
  });

  return [
    "# Task: Translate Flashcards",
    "",
    "## Overview",
    "You are translating flashcards for a language-learning deck.",
    `Target language: ${targetLanguage}.`,
    "You will be given a JSON array of English phrases and must translate each one.",
    "",
    "## Input Format",
    "The input is a JSON array of objects, one per flashcard:",
    "",
    "- `id` (string): a unique identifier for this item — reuse it unchanged in your response.",
    "- `english` (string): the English phrase to translate.",
    "- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.",
    "  - This is NOT a translation — use it only to disambiguate meaning or tone.",
    "",
    "### Example Input",
    "```json",
    JSON.stringify(
      [
        { id: "hello", english: "Hello" },
        { id: "cheese", english: "Cheese", notes: "as in the food, not a smile" },
      ],
      null,
      2,
    ),
    "```",
    "",
    "## Output Format",
    "Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).",
    "Produce exactly one object per input item:",
    "",
    "- `id` (string): the SAME id as the corresponding input item.",
    `- \`target\` (string): the translation into ${targetLanguage}.`,
    "- `hint` (string, optional): a short usage hint.",
    "  - Only include this key when you have something worth adding — omit it entirely otherwise.",
    "",
    "Do not include a `pronunciation` key — pronunciation is produced separately for this language.",
    "",
    "### Example Output",
    "```json",
    JSON.stringify(
      [
        { id: "hello", target: "Bonjour" },
        { id: "cheese", target: "Fromage", hint: "casual, singular" },
      ],
      null,
      2,
    ),
    "```",
    "",
    "## Important",
    "- Include every id from the input exactly once.",
    "  - Order does not matter.",
    "- Do not include a `pronunciation` key in your response.",
    "- Do not wrap the response in markdown code fences.",
    "- Do not include any text before or after the JSON array.",
    "",
    `## Input Data (${items.length} item(s) to translate)`,
    "```json",
    JSON.stringify(inputData, null, 2),
    "```",
  ].join("\n");
}

// For items that already have a trusted target (e.g. extracted directly from a
// bilingual source rather than invented). The model is only ever asked for a
// pronunciation guide here — never a translation — so it has no opportunity to
// second-guess or alter a target we already trust.
function buildPronunciationOnlyPrompt(items, targetLanguage) {
  const inputData = items.map((item) => {
    // Pronounce the spoken form when set (e.g. kana にせんえん) rather than the display
    // `target` (e.g. "2,000えん") — keeps this LLM/fallback path in step with the library romanizer.
    const entry = { id: item.id, english: item.english, target: item.reading || item.target };
    if (item.notes) {
      entry.notes = item.notes;
    }
    return entry;
  });

  return [
    "# Task: Produce Pronunciation Guides",
    "",
    "## Overview",
    "You are producing pronunciation guides for flashcards in a language-learning deck.",
    `Target language: ${targetLanguage}.`,
    "Each item below already has a correct, final translation — do NOT alter, correct, retranslate, or comment on it in any way.",
    "Only produce a pronunciation guide for the given `target` text.",
    "",
    "## Input Format",
    "The input is a JSON array of objects, one per flashcard:",
    "",
    "- `id` (string): a unique identifier for this item — reuse it unchanged in your response.",
    "- `english` (string): the English phrase, given for context only.",
    `- \`target\` (string): the final ${targetLanguage} translation.`,
    "  - Already correct — do not change it, and do not return it.",
    "- `notes` (string, optional): context or a hint about how this phrase is used, taken from the source material.",
    "",
    "### Example Input",
    "```json",
    JSON.stringify(
      [{ id: "cheese", english: "Cheese", target: "Fromage", notes: "as in the food" }],
      null,
      2,
    ),
    "```",
    "",
    "## Output Format",
    "Respond with ONLY a JSON array (no markdown fences, no extra prose, no commentary before or after it).",
    "Produce exactly one object per input item:",
    "",
    "- `id` (string): the SAME id as the corresponding input item.",
    `- \`pronunciation\` (string): a pronunciation guide for the given \`target\`, readable by an English speaker unfamiliar with ${targetLanguage}.`,
    `  - If ${targetLanguage} has a standard, widely-used romanization or transliteration system (e.g. romaji for Japanese, pinyin for Mandarin Chinese), use that system instead of inventing a phonetic spelling.`,
    '  - Otherwise, fall back to a phonetic respelling using English spelling and stress conventions (e.g. "froh-MAHZH").',
    "- `hint` (string, optional): a short usage hint.",
    "  - Only include this key when you have something worth adding — omit it entirely otherwise.",
    "",
    "Do not include a `target` key at all — the translation is already final and is not requested back.",
    "",
    "### Example Output",
    "```json",
    JSON.stringify(
      [{ id: "cheese", pronunciation: "froh-MAHZH", hint: "casual, singular" }],
      null,
      2,
    ),
    "```",
    "",
    "## Important",
    "- Do NOT alter, correct, retranslate, or comment on the given target in any way.",
    "- Include every id from the input exactly once.",
    "  - Order does not matter.",
    "- Do not include a `target` key in your response.",
    "- Do not wrap the response in markdown code fences.",
    "- Do not include any text before or after the JSON array.",
    "",
    `## Input Data (${items.length} item(s))`,
    "```json",
    JSON.stringify(inputData, null, 2),
    "```",
  ].join("\n");
}

// The model is asked for raw JSON but occasionally wraps it in a markdown code
// fence (```json ... ```) anyway — strip that before parsing rather than
// failing the whole batch over formatting.
function stripMarkdownFence(text) {
  const match = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return match ? match[1] : text;
}

function parseBatch(raw) {
  const trimmed = stripMarkdownFence(raw.trim()).trim();
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("model response was not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("model response must be a JSON array");
  }
  return parsed;
}

function validateFullEntry(entry) {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("model entry must be an object");
  }
  if (typeof entry.target !== "string" || !entry.target) {
    throw new Error('model entry missing string "target"');
  }
  if (typeof entry.pronunciation !== "string" || !entry.pronunciation) {
    throw new Error('model entry missing string "pronunciation"');
  }
  if (entry.hint !== undefined && typeof entry.hint !== "string") {
    throw new Error('model entry "hint" must be a string when present');
  }
}

function validateTargetOnlyEntry(entry) {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("model entry must be an object");
  }
  if (typeof entry.target !== "string" || !entry.target) {
    throw new Error('model entry missing string "target"');
  }
  if (entry.hint !== undefined && typeof entry.hint !== "string") {
    throw new Error('model entry "hint" must be a string when present');
  }
}

function validatePronunciationEntry(entry) {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("model entry must be an object");
  }
  if (typeof entry.pronunciation !== "string" || !entry.pronunciation) {
    throw new Error('model entry missing string "pronunciation"');
  }
}

function assembleFullCard(item, entry) {
  const card = {
    id: item.id,
    english: item.english,
    category: item.category,
    target: entry.target,
    pronunciation: entry.pronunciation,
  };
  if (item.notes) {
    card.notes = item.notes;
  }
  if (entry.hint) {
    card.hint = entry.hint;
  }
  return card;
}

// Produces a card-shaped object with NO `pronunciation` key at all — deliberately, since this
// feeds into romanizeAndEvaluate (romanizationEval.js), which fills `pronunciation` in afterward
// from the configured library + a Sonnet-medium eval, not from this translation call.
function assembleTargetOnlyCard(item, entry) {
  const card = {
    id: item.id,
    english: item.english,
    category: item.category,
    target: entry.target,
  };
  if (item.notes) {
    card.notes = item.notes;
  }
  if (entry.hint) {
    card.hint = entry.hint;
  }
  return card;
}

// Deliberately never reads `entry.target` anywhere in this function's body —
// the pre-existing `item.target` is authoritative. This is a structural
// guarantee, not a precedence pick: unlike the old `item.notes || entry.target`
// check (which still evaluated `entry.target` before discarding it), there is
// no expression here through which the model's response could influence the
// final target at all.
function assemblePronunciationOnlyCard(item, entry) {
  const { pronunciation } = entry;
  const card = {
    id: item.id,
    english: item.english,
    category: item.category,
    target: item.target,
    pronunciation,
  };
  if (item.notes) {
    card.notes = item.notes;
  }
  if (item.reading) {
    card.reading = item.reading;
  }
  return card;
}

function processGroup(group, { buildPrompt, validateEntry, assembleCard }, ctx) {
  const { runClaude, targetLanguage, items, errors } = ctx;

  for (const batch of chunk(group, BATCH_SIZE)) {
    const prompt = buildPrompt(batch, targetLanguage);

    let entries;
    try {
      entries = parseBatch(runClaude(prompt));
    } catch (error) {
      // The whole batch response is unusable — surface an error for every item
      // in it rather than writing bad cards.
      for (const item of batch) {
        errors.push({ id: item.id, error: error.message });
      }
      continue;
    }

    const byId = new Map();
    for (const entry of entries) {
      if (entry && typeof entry === "object" && typeof entry.id === "string") {
        byId.set(entry.id, entry);
      }
    }

    for (const item of batch) {
      const entry = byId.get(item.id);
      try {
        if (entry === undefined) {
          throw new Error("model response missing an entry for this item");
        }
        validateEntry(entry);
      } catch (error) {
        errors.push({ id: item.id, error: error.message });
        continue;
      }

      items.push(assembleCard(item, entry));
    }
  }
}

// The pre-existing-target half of the library-first path needs no model call at all (the target
// is already trusted) — just a plain object matching what assembleTargetOnlyCard would have
// produced, so both halves feed romanizeAndEvaluate in the same shape.
function toPartialCard(item) {
  const card = {
    id: item.id,
    english: item.english,
    category: item.category,
    target: item.target,
  };
  if (item.notes) {
    card.notes = item.notes;
  }
  // Carry the spoken form onto the card so the audio stage speaks it and the
  // romanizer romanized it (see romanizeAndEvaluate).
  if (item.reading) {
    card.reading = item.reading;
  }
  return card;
}

/**
 * Fills each corpus item's target/pronunciation/hint, batching up to BATCH_SIZE items per
 * `runClaude` call (the local `claude -p` CLI by default). Items are split into two groups based
 * on whether `item.target` is already set:
 *
 * - `target === null`: needs translation.
 * - `target !== null`: pre-existing target, trusted as-is.
 *
 * How `pronunciation` gets filled in depends on whether `getRomanizationLibrary` has an entry for
 * `corpus.meta.targetLanguage` (resolved via `resolveIso639Code`):
 *
 * - **No library configured** (the original, unmodified behavior): both groups go through the
 *   model — `target === null` items get `buildFullTranslationPrompt` (translation +
 *   pronunciation in one call); `target !== null` items get `buildPronunciationOnlyPrompt`
 *   (pronunciation only; the model cannot influence `target` at all — see
 *   `assemblePronunciationOnlyCard`).
 * - **Library configured**: `target === null` items get `buildTargetOnlyPrompt` (translation
 *   only, no pronunciation ask); `target !== null` items need no model call for `target` at all.
 *   Every item then goes through `romanizeAndEvaluate` (romanizationEval.js), which runs the
 *   configured library and a Sonnet-medium evaluation pass to produce `pronunciation` — falling back to
 *   the ordinary `buildPronunciationOnlyPrompt` path per-item if the library adapter itself
 *   throws (missing dependency, dictionary load failure, etc.).
 *
 * Returns `{ cards, errors }`: `cards` is a schema-valid cards.json (only items that translated
 * successfully); `errors` lists `{ id, error }` for items whose model response was missing or
 * could not be parsed. Errors stay per-item: a malformed entry only drops that item, and a whole
 * batch fails only when its response isn't a JSON array at all.
 */
export async function translateCorpus(
  corpus,
  {
    runClaude = defaultRunClaude,
    getRomanizationLibrary = defaultGetRomanizationLibrary,
    log = () => {},
  } = {},
) {
  const errors = [];
  const { targetLanguage } = corpus.meta;

  const needsFullTranslation = corpus.items.filter((item) => item.target === null);
  const needsPronunciationOnly = corpus.items.filter((item) => item.target !== null);

  const languageCode = resolveIso639Code(targetLanguage);
  const libraryEntry = languageCode ? getRomanizationLibrary(languageCode) : undefined;

  let items;

  if (libraryEntry) {
    const translated = [];
    processGroup(
      needsFullTranslation,
      {
        buildPrompt: buildTargetOnlyPrompt,
        validateEntry: validateTargetOnlyEntry,
        assembleCard: assembleTargetOnlyCard,
      },
      { runClaude, targetLanguage, items: translated, errors },
    );

    const partials = [...translated, ...needsPronunciationOnly.map(toPartialCard)];

    const fallback = (fallbackItems) => {
      const fallbackItemsResult = [];
      const fallbackErrors = [];
      processGroup(
        fallbackItems,
        {
          buildPrompt: buildPronunciationOnlyPrompt,
          validateEntry: validatePronunciationEntry,
          assembleCard: assemblePronunciationOnlyCard,
        },
        { runClaude, targetLanguage, items: fallbackItemsResult, errors: fallbackErrors },
      );
      return { items: fallbackItemsResult, errors: fallbackErrors };
    };

    const result = await romanizeAndEvaluate(partials, {
      targetLanguage,
      libraryEntry,
      runClaude,
      log,
      fallback,
    });
    items = result.items;
    errors.push(...result.errors);
  } else {
    items = [];
    const ctx = { runClaude, targetLanguage, items, errors };

    processGroup(
      needsFullTranslation,
      {
        buildPrompt: buildFullTranslationPrompt,
        validateEntry: validateFullEntry,
        assembleCard: assembleFullCard,
      },
      ctx,
    );
    processGroup(
      needsPronunciationOnly,
      {
        buildPrompt: buildPronunciationOnlyPrompt,
        validateEntry: validatePronunciationEntry,
        assembleCard: assemblePronunciationOnlyCard,
      },
      ctx,
    );
  }

  const cards = {
    meta: corpus.meta,
    items,
  };

  validateCards(cards);

  return { cards, errors };
}

import { runClaude as defaultRunClaude } from "./runClaude.js";

// Duplicated from index.js (rather than imported) to avoid a circular module dependency —
// index.js imports romanizeAndEvaluate from here, so this module can't import back from index.js.
// Same batch size/semantics as the rest of the translate stage: unbounded, i.e. one call per group.
const BATCH_SIZE = Infinity;

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function buildRomanizationPrompt(items, targetLanguage) {
  const inputData = items.map((item) => ({
    id: item.id,
    english: item.english,
    // The text that was actually romanized — the spoken `reading` when set (e.g. kana にせんえん),
    // else `target`. This is what the romanization must match, not a digit/kanji display form.
    target: item.reading || item.target,
    libraryRomanization: item.libraryPronunciation,
  }));

  return [
    "# Task: Produce the Correct Romanization",
    "",
    "## Overview",
    `Each flashcard has a ${targetLanguage} \`target\` text and a \`libraryRomanization\` — a romanization`,
    "produced by a deterministic library. That library is a useful starting point but is frequently",
    "WRONG: it mis-splits a single word into pieces with spurious spaces, mishandles the Japanese small",
    'っ (sokuon) by emitting a literal "tsu" instead of doubling the next consonant, and falls back to',
    "spelling out unfamiliar kana letter-by-letter. Your job is to return the CORRECT romanization for",
    "each item — keep the library's value when it is already right, and fix it when it is wrong. You are",
    "the final authority on the romanization.",
    "",
    "## Input Format",
    "The input is a JSON array of objects, one per flashcard:",
    "",
    "- `id` (string): a unique identifier — reuse it unchanged in your response.",
    "- `english` (string): the English phrase, for meaning context.",
    `- \`target\` (string): the ${targetLanguage} text to romanize.`,
    "- `libraryRomanization` (string): the library's attempt — a starting point, often wrong.",
    "",
    "### Example Input",
    "```json",
    JSON.stringify(
      [
        {
          id: "sixth-floor",
          english: "Sixth floor",
          target: "ろっかい",
          libraryRomanization: "ro tsu kai",
        },
        { id: "hello", english: "Hello", target: "こんにちは", libraryRomanization: "konnichiwa" },
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
    `- \`pronunciation\` (string): the correct romanization of \`target\`, using the standard system for`,
    `  ${targetLanguage} (Hepburn for Japanese, pinyin for Mandarin, etc.) — the library's value if it is`,
    "  already correct, otherwise your corrected version.",
    "",
    "## Important",
    "- Return the final, correct `pronunciation` for EVERY item — never leave a known-wrong value in place.",
    "- Romanize a single word as a single token (no spurious internal spaces); double the consonant for a",
    "  sokuon (ろっかい → `rokkai`, not `ro tsu kai`); keep natural word spacing in a full sentence.",
    "- Include every id from the input exactly once. Order does not matter.",
    "- Do not wrap the response in markdown code fences, and include no text before or after the JSON array.",
    "",
    "### Example Output",
    "```json",
    JSON.stringify(
      [
        { id: "sixth-floor", pronunciation: "rokkai" },
        { id: "hello", pronunciation: "konnichiwa" },
      ],
      null,
      2,
    ),
    "```",
    "",
    `## Input Data (${items.length} item(s) to romanize)`,
    "```json",
    JSON.stringify(inputData, null, 2),
    "```",
  ].join("\n");
}

function stripMarkdownFence(text) {
  const match = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return match ? match[1] : text;
}

function parseEvalBatch(raw) {
  const trimmed = stripMarkdownFence(raw.trim()).trim();
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("model response must be a JSON array");
  }
  return parsed;
}

function assembleCard(item, correction) {
  // Use the model's corrected romanization; fall back to the library's value only when the model
  // omitted this item or returned a non-string (fail-open — a real romanization beats nothing).
  const pronunciation =
    correction &&
    typeof correction.pronunciation === "string" &&
    correction.pronunciation.length > 0
      ? correction.pronunciation
      : item.libraryPronunciation;

  const card = { ...item, pronunciation };
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
function correctRomanizations(items, { targetLanguage, runClaude }) {
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
    } catch {
      correctionById = new Map(); // fail open — every item below keeps the library value
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
      const libraryPronunciation = await mod.romanize(item.reading || item.target);
      romanized.push({ ...item, libraryPronunciation });
    } catch (error) {
      log(
        `romanization library failed for item ${item.id} (${error.message}) — falling back to LLM-only pronunciation`,
      );
      needsFallback.push(item);
    }
  }

  const corrected = correctRomanizations(romanized, { targetLanguage, runClaude });
  const { items: fallbackCards, errors } = fallback(needsFallback);

  return { items: [...corrected, ...fallbackCards], errors };
}

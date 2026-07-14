import { validateCards } from "../model/index.js";
import { runClaude as defaultRunClaude } from "./runClaude.js";

// Max corpus items per `claude -p` invocation. Kept small so the cheaper pinned
// model has little to get wrong per call; larger corpora are split into several
// batches (e.g. 25 items → calls of 10, 10, 5). Each of the two groups below
// (full-translation vs. pronunciation-only) is batched independently.
const BATCH_SIZE = 10;

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function buildFullTranslationPrompt(items, targetLanguage) {
  const lines = [
    "You are translating flashcards for a language-learning deck.",
    `Target language: ${targetLanguage}`,
    `Translate each of the following ${items.length} English phrase(s).`,
    "",
  ];

  for (const item of items) {
    lines.push(`- id: ${item.id}`);
    lines.push(`  English: "${item.english}"`);
    if (item.notes) {
      lines.push(`  Context/hint from source material (not a translation): "${item.notes}"`);
    }
  }

  lines.push(
    "",
    "Respond with ONLY a JSON array (no markdown fences, no extra prose). One object per phrase,",
    "reusing the SAME id, of the form:",
    '[{"id": "<id>", "target": "<translation>", "pronunciation": "<phonetic pronunciation>", "hint": "<optional usage hint>"}]',
    'Include every id exactly once (order does not matter). Omit "hint" for an entry when you have none.',
  );

  return lines.join("\n");
}

// For items that already have a trusted target (e.g. extracted directly from a
// bilingual source rather than invented). The model is only ever asked for a
// pronunciation guide here — never a translation — so it has no opportunity to
// second-guess or alter a target we already trust.
function buildPronunciationOnlyPrompt(items, targetLanguage) {
  const lines = [
    "You are producing phonetic pronunciation guides for flashcards in a language-learning deck.",
    `Target language: ${targetLanguage}`,
    `Each of the following ${items.length} item(s) already has a correct, final translation.`,
    "Do NOT alter, correct, retranslate, or comment on it in any way — only produce a phonetic",
    "pronunciation guide for the given text.",
    "",
  ];

  for (const item of items) {
    lines.push(`- id: ${item.id}`);
    lines.push(`  English: "${item.english}"`);
    lines.push(`  ${targetLanguage} (already final, do not change): "${item.target}"`);
    if (item.notes) {
      lines.push(`  Context/hint from source material: "${item.notes}"`);
    }
  }

  lines.push(
    "",
    "Respond with ONLY a JSON array (no markdown fences, no extra prose). One object per item,",
    "reusing the SAME id, of the form:",
    '[{"id": "<id>", "pronunciation": "<phonetic pronunciation>"}]',
    'Include every id exactly once (order does not matter). Do not include a "target" key at all.',
  );

  return lines.join("\n");
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

/**
 * Fills each corpus item's target/pronunciation/hint by invoking `runClaude`
 * (the local `claude -p` CLI by default), batching up to BATCH_SIZE items per
 * call. Items are split into two independently-batched groups based on
 * whether `item.target` is already set:
 *
 * - `target === null`: full translation — the model produces both `target`
 *   and `pronunciation`.
 * - `target !== null`: pronunciation-only — the model is only ever asked for
 *   a pronunciation guide; it cannot influence the final `target` at all
 *   (see `assemblePronunciationOnlyCard`).
 *
 * Returns `{ cards, errors }`: `cards` is a schema-valid cards.json (only items
 * that translated successfully); `errors` lists `{ id, error }` for items whose
 * model response was missing or could not be parsed. Errors stay per-item: a
 * malformed entry only drops that item, and a whole batch fails only when its
 * response isn't a JSON array at all.
 */
export function translateCorpus(corpus, { runClaude = defaultRunClaude } = {}) {
  const items = [];
  const errors = [];
  const { targetLanguage } = corpus.meta;

  const needsFullTranslation = corpus.items.filter((item) => item.target === null);
  const needsPronunciationOnly = corpus.items.filter((item) => item.target !== null);

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

  const cards = {
    meta: corpus.meta,
    items,
  };

  validateCards(cards);

  return { cards, errors };
}

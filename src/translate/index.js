import { validateCards } from "../model/index.js";
import { runClaude as defaultRunClaude } from "./runClaude.js";

// Max corpus items per `claude -p` invocation. Kept small so the cheaper pinned
// model has little to get wrong per call; larger corpora are split into several
// batches (e.g. 25 items → calls of 10, 10, 5).
const BATCH_SIZE = 10;

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function buildBatchPrompt(items, targetLanguage) {
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
      lines.push(
        `  Candidate translation already extracted from source material: "${item.notes}". ` +
          "Verify it, correct it if wrong, and base your pronunciation on it.",
      );
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

function parseBatch(raw) {
  const trimmed = raw.trim();
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

function validateEntry(entry) {
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

/**
 * Fills each corpus item's target/pronunciation/hint by invoking `runClaude`
 * (the local `claude -p` CLI by default), batching up to BATCH_SIZE items per
 * call. Items whose `notes` already carry a source-extracted translation are
 * verified rather than regenerated: the model is asked to confirm/correct it,
 * but the existing `notes` text is kept as the authoritative `target`.
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

  for (const batch of chunk(corpus.items, BATCH_SIZE)) {
    const prompt = buildBatchPrompt(batch, targetLanguage);

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

      const card = {
        id: item.id,
        english: item.english,
        category: item.category,
        target: item.notes || entry.target,
        pronunciation: entry.pronunciation,
      };
      if (item.notes) {
        card.notes = item.notes;
      }
      if (entry.hint) {
        card.hint = entry.hint;
      }

      items.push(card);
    }
  }

  const cards = {
    meta: corpus.meta,
    items,
  };

  validateCards(cards);

  return { cards, errors };
}

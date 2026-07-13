import { validateCards } from "../model/index.js";
import { runClaude as defaultRunClaude } from "./runClaude.js";

function buildPrompt(item) {
  const lines = [
    "You are translating a flashcard for a language-learning deck.",
    `Target language: ${item.targetLanguage}`,
    `English phrase: ${item.english}`,
  ];

  if (item.notes) {
    lines.push(
      `A candidate translation was already extracted from source material: "${item.notes}".`,
      "Verify it (correct it if wrong) and use it as the basis for your answer.",
    );
  }

  lines.push(
    "Respond with ONLY a single JSON object (no markdown fences, no extra text) of the form:",
    '{"target": "<translation>", "pronunciation": "<phonetic pronunciation>", "hint": "<optional usage hint>"}',
    'Omit "hint" if you have none.',
  );

  return lines.join("\n");
}

function parseModelResponse(raw) {
  const trimmed = raw.trim();
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("model response was not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("model response JSON must be an object");
  }
  if (typeof parsed.target !== "string" || !parsed.target) {
    throw new Error('model response missing string "target"');
  }
  if (typeof parsed.pronunciation !== "string" || !parsed.pronunciation) {
    throw new Error('model response missing string "pronunciation"');
  }
  if (parsed.hint !== undefined && typeof parsed.hint !== "string") {
    throw new Error('model response "hint" must be a string when present');
  }

  return parsed;
}

/**
 * Fills each corpus item's target/pronunciation/hint by invoking `runClaude`
 * (the local `claude -p` CLI by default). Items whose `notes` already carry a
 * source-extracted translation are verified rather than regenerated: the
 * model is asked to confirm/correct it, but the existing `notes` text is kept
 * as the authoritative `target`.
 *
 * Returns `{ cards, errors }`: `cards` is a schema-valid cards.json (only
 * items that translated successfully); `errors` lists `{ id, error }` for
 * items whose model response could not be parsed.
 */
export function translateCorpus(corpus, { runClaude = defaultRunClaude } = {}) {
  const items = [];
  const errors = [];

  for (const item of corpus.items) {
    const prompt = buildPrompt({ ...item, targetLanguage: corpus.meta.targetLanguage });

    let parsed;
    try {
      const raw = runClaude(prompt);
      parsed = parseModelResponse(raw);
    } catch (error) {
      errors.push({ id: item.id, error: error.message });
      continue;
    }

    const card = {
      id: item.id,
      english: item.english,
      category: item.category,
      target: item.notes || parsed.target,
      pronunciation: parsed.pronunciation,
    };
    if (item.notes) {
      card.notes = item.notes;
    }
    if (parsed.hint) {
      card.hint = parsed.hint;
    }

    items.push(card);
  }

  const cards = {
    meta: corpus.meta,
    items,
  };

  validateCards(cards);

  return { cards, errors };
}

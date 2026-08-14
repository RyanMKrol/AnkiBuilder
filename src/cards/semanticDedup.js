import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { runClaude as defaultRunClaude } from "../translate/runClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "semantic-dedup-prompt.md"),
);

export function renderSemanticDedupPrompt({
  cards,
  targetLanguage,
  patterns = {},
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  const cardData = cards.map((card) => {
    const entry = { id: card.id, english: card.english, target: card.target };
    if (card.fillInBlank) entry.fillInBlank = true;
    if (patterns[card.id]) entry.sourcePattern = patterns[card.id];
    return entry;
  });

  return renderPromptTemplate(templatePath, {
    TARGET_LANGUAGE: targetLanguage,
    CARDS_JSON: JSON.stringify(cardData, null, 2),
  });
}

function parseRemoveResponse(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.remove)) {
    throw new Error('model response must be a JSON object with a "remove" array');
  }
  return parsed.remove;
}

/**
 * Semantic de-dup of a lesson's AI-generated practice cards against the rest of the lesson. Groups
 * every card — source material AND practice — by its sentence pattern and drops the practice cards
 * that only repeat a frame the lesson already covers, keeping at most a couple of examples each.
 *
 * A redundant card is **excluded, not deleted**: `excluded: true` (reversible in the dashboard, no
 * audio spent, dropped from the built deck) plus a `reviewNote` naming what already covers it. So the
 * reviewer sees each call and its reasoning at the corpus gate and can put any card back with one
 * click, rather than having to dig a deleted card out of a backup file.
 *
 * Only cards marked `fillInBlank: true` are ever touched — source material is the lesson and is off
 * limits. Already-excluded cards are left alone.
 *
 * Returns `{ items, excluded }` where `excluded` lists `{ id, pattern, reason }` for each call made.
 * Fails open: any parse/shape/thrown error logs a warning and returns the cards untouched.
 */
export function dedupeByPattern({
  items,
  targetLanguage,
  patterns = {},
  log = () => {},
  runClaude = defaultRunClaude,
} = {}) {
  const empty = { items, excluded: [] };
  if (!Array.isArray(items) || !items.some((item) => item.fillInBlank && !item.excluded)) {
    return empty;
  }

  const prompt = renderSemanticDedupPrompt({ cards: items, targetLanguage, patterns });

  let remove;
  try {
    remove = parseRemoveResponse(runClaude(prompt));
  } catch (error) {
    log(`semantic de-dup: failed (${error.message}) — keeping every practice card`);
    return empty;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const excluded = [];
  for (const entry of remove) {
    if (!entry || typeof entry.id !== "string") continue;
    const item = byId.get(entry.id);
    // Silently ignore an id that isn't a live practice card — the model naming a source card is
    // exactly the failure rule 1 of the prompt guards against, and it must never take effect.
    if (!item || !item.fillInBlank || item.excluded) continue;

    const pattern = typeof entry.pattern === "string" ? entry.pattern.trim() : "";
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    item.excluded = true;
    // Provenance: this is a machine judgement, not a reviewed one. `reviewNote` already carries the
    // prose, but it is free text a human also writes into, so it cannot be counted or filtered on.
    item.excludedBy = "semantic-dedup";
    item.excludedReason = [pattern ? `pattern: ${pattern}` : "", reason]
      .filter(Boolean)
      .join(" — ");
    item.reviewNote = [
      "Excluded by the semantic de-dup pass.",
      pattern ? `Pattern: ${pattern}.` : "",
      reason,
    ]
      .filter(Boolean)
      .join(" ");
    excluded.push({ id: item.id, pattern, reason });
  }

  return { items, excluded };
}

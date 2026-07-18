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

function buildRomanizationEvalPrompt(items, targetLanguage) {
  const inputData = items.map((item) => ({
    id: item.id,
    english: item.english,
    target: item.target,
    romanization: item.libraryPronunciation,
  }));

  return [
    "# Task: Judge Machine-Generated Romanizations",
    "",
    "## Overview",
    "A deterministic romanization library has already converted each flashcard's translated text",
    `(\`target\`, in ${targetLanguage}) into a romanization (\`romanization\`). Your job is only to`,
    "judge whether that romanization correctly represents the given `target` text — you are a",
    "reviewer, not a translator or a romanizer.",
    "",
    "## Input Format",
    "The input is a JSON array of objects, one per flashcard:",
    "",
    "- `id` (string): a unique identifier for this item — reuse it unchanged in your response.",
    "- `english` (string): the English phrase, given for meaning context only.",
    `- \`target\` (string): the final ${targetLanguage} text that was romanized.`,
    "- `romanization` (string): the library-generated romanization of `target`, to be judged.",
    "",
    "### Example Input",
    "```json",
    JSON.stringify(
      [{ id: "hello", english: "Hello", target: "こんにちは", romanization: "konnichiwa" }],
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
    "- `ok` (boolean): `true` if `romanization` correctly represents `target`, `false` if it looks wrong.",
    "- `concern` (string, required when `ok` is `false`): a brief, specific reason the romanization looks wrong.",
    "",
    "## Important",
    "- Do not invent, correct, or improve the romanization yourself — you are only judging the one you were given.",
    "- If it looks wrong, say so via `concern`; never provide a replacement value.",
    "- Include every id from the input exactly once.",
    "  - Order does not matter.",
    "- Do not wrap the response in markdown code fences.",
    "- Do not include any text before or after the JSON array.",
    "",
    "### Example Output",
    "```json",
    JSON.stringify(
      [
        { id: "hello", ok: true },
        { id: "cheese", ok: false, concern: "romanization reads as a different word entirely" },
      ],
      null,
      2,
    ),
    "```",
    "",
    `## Input Data (${items.length} item(s) to judge)`,
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

function noteWithConcern(existingNotes, concern) {
  const flagged = `Possibly incorrect romanization — ${concern}`;
  return existingNotes ? `${existingNotes} | ${flagged}` : flagged;
}

function assembleCard(item, verdict) {
  const card = { ...item, pronunciation: item.libraryPronunciation };
  delete card.libraryPronunciation;

  if (verdict && verdict.ok === false) {
    card.uncertain = true;
    card.notes = noteWithConcern(card.notes, verdict.concern || "reason not given");
  }

  return card;
}

/**
 * Evaluates the library-romanized items with the pinned Sonnet-medium model, mirroring
 * `dedupBackward`/`flagForwardConcerns`'s "flag, never silently override" idiom: the model can
 * only approve (`ok: true`) or flag (`ok: false, concern`) — there is no way for it to substitute
 * its own romanization, since the output schema has no key a replacement value could travel
 * through. `pronunciation` always ends up as the library's own value; a flagged item additionally
 * gets `uncertain: true` and a `"Possibly incorrect romanization — ..."` note.
 *
 * Fails open on a malformed/missing eval response — same philosophy as `flagForwardConcerns`
 * ("fails open... never blocking assemble"): every item in an unparseable batch, or any item
 * missing from an otherwise-valid response, is approved unflagged rather than dropped, since the
 * romanization itself is already a real deterministic value, not an LLM guess needing a safety
 * net the way a from-scratch invention would.
 */
function evaluateRomanizations(items, { targetLanguage, runClaude }) {
  const cards = [];

  for (const batch of chunk(items, BATCH_SIZE)) {
    const prompt = buildRomanizationEvalPrompt(batch, targetLanguage);

    let verdictById = new Map();
    try {
      const verdicts = parseEvalBatch(runClaude(prompt));
      for (const verdict of verdicts) {
        if (verdict && typeof verdict === "object" && typeof verdict.id === "string") {
          verdictById.set(verdict.id, verdict);
        }
      }
    } catch {
      verdictById = new Map(); // fail open — every item below is approved unflagged
    }

    for (const item of batch) {
      cards.push(assembleCard(item, verdictById.get(item.id)));
    }
  }

  return cards;
}

/**
 * Fills in `pronunciation` for every item already holding a `target` (freshly translated or
 * pre-existing), via the configured romanization library for `targetLanguage` plus a Sonnet-medium
 * evaluation pass — see `evaluateRomanizations`. A per-item adapter failure (missing package,
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
      const libraryPronunciation = await mod.romanize(item.target);
      romanized.push({ ...item, libraryPronunciation });
    } catch (error) {
      log(
        `romanization library failed for item ${item.id} (${error.message}) — falling back to LLM-only pronunciation`,
      );
      needsFallback.push(item);
    }
  }

  const evaluated = evaluateRomanizations(romanized, { targetLanguage, runClaude });
  const { items: fallbackCards, errors } = fallback(needsFallback);

  return { items: [...evaluated, ...fallbackCards], errors };
}

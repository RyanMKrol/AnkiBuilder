import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { findUnreadableNumbers } from "./spokenNumbers.js";
import { resolveIso639Code } from "../model/iso639.js";
import { runNumberReadingsClaude as defaultRunClaude } from "../translate/runClaude.js";
import { getLanguagePromptRules } from "../translate/languageRules.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "number-reading-prompt.md"),
);

const DIGIT = /[0-9０-９]/;

const REVIEW_NOTE =
  "Number spelled out automatically because the card had a numeral in its reading or romaji — " +
  "check the counter is right (4がつ is しがつ, not よんがつ).";

export function renderNumberReadingPrompt({
  cards,
  targetLanguage,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  // Per-language fragments (languageRules.js): the template itself stays language-neutral.
  const rules = getLanguagePromptRules(resolveIso639Code(targetLanguage));
  const styleRules = rules.numberReadingStyle?.length
    ? rules.numberReadingStyle
    : ["Match the deck's existing romanization style for this language."];
  return renderPromptTemplate(templatePath, {
    TARGET_LANGUAGE: targetLanguage,
    COUNTER_EXAMPLES: rules.counterExamples ?? "",
    // The placeholder sits on an already-indented template line, so the first bullet needs no
    // indent of its own; the rest align under it.
    ROMANIZATION_STYLE_RULES: styleRules
      .map((rule, index) => (index === 0 ? `- ${rule}` : `   - ${rule}`))
      .join("\n"),
    CARDS_JSON: JSON.stringify(
      cards.map((card) => ({
        id: card.id,
        english: card.english,
        target: card.target,
        currentReading: card.reading ?? null,
        currentPronunciation: card.pronunciation ?? null,
      })),
      null,
      2,
    ),
  });
}

function parseFixes(raw) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.fixes)) {
    throw new Error('model response must be a JSON object with a "fixes" array');
  }
  return parsed.fixes;
}

/**
 * Fills in the `reading` and `pronunciation` of any card whose number has not been spelled out.
 *
 * Detecting this is deterministic (`findUnreadableNumbers`); FIXING it is not, which is why it needs a
 * model. The right form depends on the counter and is frequently irregular — 4がつ is しがつ, 9じ is
 * くじ — so a regex would produce confidently wrong audio, which is worse than none.
 *
 * Both fields are written together, deliberately. They are two symptoms of one cause, and fixing only
 * the reading corrects the audio while leaving wrong romaji on screen — which is exactly what happened
 * when this was done by hand.
 *
 * Every card it touches is marked `uncertain` with a `reviewNote`, so the reviewer is shown what was
 * auto-filled rather than having it slipped in silently. A fix that still contains a digit is
 * discarded: the pass would otherwise report success while changing nothing, and the review gate would
 * hold the lesson back with no explanation of why its "fix" did not take.
 *
 * Returns `{ items, fixed, remaining }`. Fails open — a model or parse error leaves the cards untouched
 * and the review gate catches what is still wrong.
 */
export function fillNumberReadings({
  items,
  targetLanguage,
  log = () => {},
  runClaude = defaultRunClaude,
} = {}) {
  const languageCode = resolveIso639Code(targetLanguage);
  const offenders = findUnreadableNumbers(items, languageCode);
  if (offenders.length === 0) {
    return { items, fixed: [], remaining: [] };
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const cards = [...new Set(offenders.map((o) => o.id))].map((id) => byId.get(id)).filter(Boolean);

  let fixes;
  try {
    fixes = parseFixes(runClaude(renderNumberReadingPrompt({ cards, targetLanguage })));
  } catch (error) {
    log(`number readings: failed (${error.message}) — leaving these cards for the review gate`);
    return { items, fixed: [], remaining: offenders };
  }

  const fixed = [];
  for (const fix of fixes) {
    if (!fix || typeof fix.id !== "string") continue;
    const item = byId.get(fix.id);
    if (!item) continue;

    const reading = typeof fix.reading === "string" ? fix.reading.trim() : "";
    const pronunciation = typeof fix.pronunciation === "string" ? fix.pronunciation.trim() : "";
    // A "fix" that still carries a digit fixes nothing — drop it rather than record a change.
    if (!reading || !pronunciation || DIGIT.test(reading) || DIGIT.test(pronunciation)) continue;

    item.reading = reading;
    item.pronunciation = pronunciation;
    item.uncertain = true;
    item.reviewNote = item.reviewNote ? `${item.reviewNote} | ${REVIEW_NOTE}` : REVIEW_NOTE;
    fixed.push({ id: item.id, target: item.target, reading, pronunciation });
  }

  return { items, fixed, remaining: findUnreadableNumbers(items, languageCode) };
}

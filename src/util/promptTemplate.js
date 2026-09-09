import { readFileSync } from "fs";
import { cardRules, CARD_RULES_KEY } from "./cardRules.js";

/**
 * Renders one of the human-editable Markdown prompt templates in `docs/`, substituting every
 * `{{PLACEHOLDER}}` with the matching value. Throws when a placeholder is left unresolved, so a
 * renamed template variable fails loudly at render time instead of reaching the model as literal
 * `{{FOO}}` text.
 *
 * `{{CARD_RULES}}` is filled in HERE rather than by each caller, and that is the point of it. The
 * rules every card-writing pass shares were previously restated per prompt, which meant a rule added
 * to one prompt after another was written never reached the other, and two passes then undid each
 * other's correct work. A caller may still pass its own value to override, which is for tests.
 */
export function renderPromptTemplate(templatePath, values) {
  let rendered = readFileSync(templatePath, "utf-8");
  const resolved = CARD_RULES_KEY in values ? values : { ...values, [CARD_RULES_KEY]: cardRules() };
  for (const [key, value] of Object.entries(resolved)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }

  const unresolved = rendered.match(/\{\{[A-Z_]+\}\}/);
  if (unresolved) {
    throw new Error(`Prompt template has an unresolved placeholder: ${unresolved[0]}`);
  }

  return rendered;
}

/**
 * Pulls the JSON object out of a model response. The model is asked for bare JSON but may wrap it in
 * a markdown fence or preface it with prose, so prefer a fenced block and otherwise take the span
 * from the first "{" to the last "}". Shared by every pass that parses a JSON object response
 * (epubTaughtIndex, epubForwardFlags, pedagogicalSort, and callers here).
 */
export function extractJsonObjectText(raw) {
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return raw.trim();
}

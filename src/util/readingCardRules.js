// The one source of the card rules every READING pass shares (docs/card-rules-reading.md), the
// reading deck's counterpart of ./cardRules.js. Injected at render time wherever a prompt carries
// `{{READING_CARD_RULES}}`, for the same reason the speaking rules are: a rule written into one
// prompt and needed by four is the failure this project keeps hitting.
//
// A reading prompt carries this marker and never `{{CARD_RULES}}`, and no speaking prompt carries
// this one; test/docs/promptTemplates.test.js enumerates docs/ and holds every prompt to that.

import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

export const READING_CARD_RULES_KEY = "READING_CARD_RULES";

export const READING_CARD_RULES_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "card-rules-reading.md"),
);

let cached = null;

/** The reading rules, with the file's own explainer comment stripped. */
export function readingCardRules() {
  if (cached === null) {
    cached = readFileSync(READING_CARD_RULES_PATH, "utf-8")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
  }
  return cached;
}

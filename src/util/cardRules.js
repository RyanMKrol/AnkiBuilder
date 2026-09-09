// The one source of the card rules that every card-writing prompt shares.
//
// WHY THIS EXISTS. `card-authoring-rules.md` opened by claiming it governed "every pass that writes
// cards", and nothing made that true. The passes are separate prompts in separate files, each
// written when its pass was, and a rule added to one after another was written simply never reached
// the other. That is not hypothetical: the extraction prompt protects forms the source marks
// irregular from being sampled away, `semantic-dedup-prompt.md` never mentioned the word, and a
// correctly-mined irregular card was deleted as "the third example of a frame the source teaches
// twice". Both passes did exactly what their own prompt said.
//
// So the shared subset lives in ONE file and is injected at render time. A prompt either carries the
// `{{CARD_RULES}}` marker or is deliberately exempt, and a test enumerates every prompt in `docs/`
// and insists each is one or the other. A new pass added later cannot quietly opt out by being new.
//
// WHY IT IS A SUBSET. The full rulebook is five hundred lines and most of it concerns one pass. This
// is prepended to every card-writing call, so its length is multiplied by a dozen; a rule earns its
// place here only by being cross-pass, and every line in the file is one a pass has actually broken.

import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** The marker a prompt puts where the shared rules should be substituted. */
export const CARD_RULES_KEY = "CARD_RULES";

export const CARD_RULES_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "card-rules-shared.md"),
);

// Read once. The file does not change within a process, and a prompt render happening per item
// should not be a file read per item.
let cached = null;

/**
 * The shared rules, with the file's own HTML explainer comment stripped.
 *
 * The comment is for whoever edits the file and would be noise in a prompt, which is the whole
 * reason it is a comment rather than prose: an instruction file that explains itself to the model
 * spends tokens teaching the model about the file.
 */
export function cardRules() {
  if (cached === null) {
    cached = readFileSync(CARD_RULES_PATH, "utf-8")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
  }
  return cached;
}

/** Test seam: drop the memo so a test can point at a different file. */
export function resetCardRulesCache() {
  cached = null;
}

import { createInterface } from "readline/promises";
import { renderReviewTable } from "../audit/index.js";

/**
 * Parses a comma-separated "numbers to exclude" answer into a sorted, deduped
 * array of valid 1-based indices (within [1, itemCount]). Blank input or
 * input with no valid numbers returns an empty array.
 */
export function parseExclusionInput(input, itemCount) {
  if (!input || !input.trim()) {
    return [];
  }

  const seen = new Set();
  for (const part of input.split(",")) {
    const n = parseInt(part.trim(), 10);
    if (Number.isInteger(n) && n >= 1 && n <= itemCount) {
      seen.add(n);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The review state machine, decoupled from any real terminal I/O: `print`
 * writes a line, `ask(question)` returns a Promise<string> for the user's
 * answer. Renders the current item list, lets the user exclude items by
 * number (looping to allow further exclusion), then asks for confirmation
 * before returning the final kept-items array.
 */
export async function runReviewLoop(items, { print, ask }) {
  let working = items;

  for (;;) {
    print(renderReviewTable(working));
    const toExclude = await ask("Numbers to exclude (comma-separated, blank for none): ");
    const excluded = parseExclusionInput(toExclude, working.length);

    if (excluded.length > 0) {
      working = working.filter((_, index) => !excluded.includes(index + 1));
      continue;
    }

    const confirm = await ask(`Confirm keeping all ${working.length} item(s)? [y/N]: `);
    if (/^y(es)?$/i.test(confirm.trim())) {
      return working;
    }
    // Not confirmed — loop again (re-render, allow more exclusions or confirm again).
  }
}

/**
 * Production implementation: wires the pure review loop to a real terminal
 * via readline/promises. This is the ctx.promptReviewDecisions default in the
 * CLI — tests inject a fully-scripted replacement instead of this function.
 */
export async function defaultPromptReviewDecisions(items, { print = console.log } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await runReviewLoop(items, {
      print,
      ask: (question) => rl.question(question),
    });
  } finally {
    rl.close();
  }
}

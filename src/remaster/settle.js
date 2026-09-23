import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate } from "../util/promptTemplate.js";
import { compareReadings, contentDelta, readingText } from "./compareReadings.js";
import { transcribeWithRetries } from "./transcribeRetry.js";

// Two readings in, one settled page out.
//
// Where the readings agree, reading B is kept as it is: it carries the figure boxes the build crops
// from, and agreement is the evidence that it is right. Where they disagree, a stronger model looks
// at the image and both versions and corrects B at the disputed spans. That is the repo's rule for a
// checking role: pinned above the pass it checks (REMASTER_PASS_PINS.SETTLE is Opus, TRANSCRIBE is
// Sonnet).
//
// The adjudicator's answer is not trusted either. It is compared with both readings, and rejected if
// it adds content that neither reading has or drops content both readings agreed on. On Genki
// Lesson 1 the disagreements were a dropped line number and one extra kana, so a legitimate answer
// changes a handful of characters; a model that re-transcribes the page from scratch is caught.

const TEMPLATE = resolve(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "remaster-settle-prompt.md"),
);

// Characters an answer may add beyond both readings, or drop from what both readings share. Small
// on purpose: a correct settlement only chooses between the readings, and "neither" (both wrong)
// is the rare case that needs any slack at all.
const GUARD_SLACK = 3;

function describeDifferences(differences) {
  return differences
    .map((d, i) => `${i + 1}. (${d.stream}) …${d.before}[A: "${d.a}" | B: "${d.b}"]${d.after}…`)
    .join("\n");
}

export function renderSettlePrompt({
  imagePath,
  bookTitle,
  pageNumber,
  readingA,
  readingB,
  differences,
}) {
  return renderPromptTemplate(TEMPLATE, {
    IMAGE_PATH: resolve(imagePath),
    BOOK_TITLE: bookTitle ?? "(untitled)",
    PAGE_NUMBER: String(pageNumber),
    DIFFERENCES: describeDifferences(differences),
    READING_A: readingA,
    READING_B: readingB,
  });
}

function unionCounts(a, b) {
  // The larger count of each character across the two readings: what either one could justify.
  const out = new Map();
  for (const text of [a, b]) {
    const counts = new Map();
    for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    for (const [ch, n] of counts) out.set(ch, Math.max(out.get(ch) ?? 0, n));
  }
  return [...out].map(([ch, n]) => ch.repeat(n)).join("");
}

function sharedCounts(a, b) {
  const cb = new Map();
  for (const ch of b) cb.set(ch, (cb.get(ch) ?? 0) + 1);
  let out = "";
  for (const ch of a) {
    if ((cb.get(ch) ?? 0) > 0) {
      out += ch;
      cb.set(ch, cb.get(ch) - 1);
    }
  }
  return out;
}

/**
 * Checks a settled body against the two readings. Returns a list of problems, empty when the
 * answer only chose between (or minimally corrected) the readings.
 */
export function settleGuard(settledBody, bodyA, bodyB) {
  const problems = [];
  const s = readingText(settledBody);
  const a = readingText(bodyA);
  const b = readingText(bodyB);
  for (const stream of ["text", "readings"]) {
    const added = contentDelta(s[stream], unionCounts(a[stream], b[stream])).onlyA;
    const dropped = contentDelta(sharedCounts(a[stream], b[stream]), s[stream]).onlyA;
    if (added > GUARD_SLACK) {
      problems.push(`adds ${added} ${stream} character(s) that neither reading has`);
    }
    if (dropped > GUARD_SLACK) {
      problems.push(`drops ${dropped} ${stream} character(s) both readings agreed on`);
    }
  }
  return problems;
}

/**
 * Settles one page. `readingA`/`readingB` are parsed pages (`{ body, ... }`). Returns
 * `{ page, source, differences, problems }`: `source` is "agreed" (B kept as is), "settled"
 * (adjudicated and passed the guard) or "unsettled" (the adjudicator failed or was rejected;
 * `page` is null and a person decides).
 */
export async function settlePage({ pageNumber, readingA, readingB, prompt, run }) {
  const comparison = compareReadings(readingA.body, readingB.body);
  if (comparison.agrees) {
    return { page: readingB, source: "agreed", differences: [], problems: [] };
  }
  const result = await transcribeWithRetries({
    pageNumber,
    prompt: prompt(comparison.differences),
    run,
  });
  if (!result.page) {
    return {
      page: null,
      source: "unsettled",
      differences: comparison.differences,
      problems: result.failures.map((f) => `attempt ${f.attempt}: ${f.reason}`),
    };
  }
  const problems = settleGuard(result.page.body, readingA.body, readingB.body);
  return {
    page: problems.length ? null : result.page,
    source: problems.length ? "unsettled" : "settled",
    differences: comparison.differences,
    problems,
  };
}

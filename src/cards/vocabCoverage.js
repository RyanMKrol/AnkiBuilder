// Did the extraction miss a whole vocabulary block?
//
// SKILL.md has ruled twice that this check "is a script, not a read-through": pull every
// headword + gloss pair out of the chapter's own VOCABULARY tables and report any headword that
// appears in no card's `target`. It was never written, so every chapter re-derived a throwaway
// version of it with slightly different matching rules — on a check whose failure mode is a chapter
// that is simply short a few words, which looks exactly like a chapter that had fewer words.
//
// The matching lives here, behind tests, rather than in the script: a mutating or reporting tool's
// judgement is the thing worth pinning, and a rule that changes per chapter is not a check.

const VOCA_TABLE = /<table[^>]*class="[^"]*\bvoca\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;

// `<td class="sub">` / `sub2` is how this book indents a component or derived form under its parent
// headword (お〜 under おかし). Those rows are real, individually-glossed vocabulary — the extraction
// prompt says so explicitly — so they are entries here too, flagged for the report.
const SUB_CELL = /\bclass="[^"]*\bsub\d?\b[^"]*"/i;

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every headword/gloss pair in the chapter's `<table class="voca">` blocks, sub-rows included.
 * Two-column tables (Japanese, English) are the shape this book uses; a row with fewer than two
 * cells, or with an empty first cell, is skipped rather than guessed at.
 */
/**
 * A headword cell split into the separate words it holds.
 *
 * The book uses ／ for two things and this cannot tell them apart, which is fine — both want the
 * same treatment. Genuine synonyms (`つま ／ かない`) are separate words each needing a card. Counter
 * sound-variants (`〜ふん ／ ぷん`, `〜ほん ／ ぼん ／ ぽん`) are one counter changing shape after
 * different numbers, and each shape still has to appear SOMEWHERE in the deck or the learner has
 * never seen it — `ろっぽん` is not derivable from `にほん` by a beginner.
 *
 * Returns the whole cell unchanged when there is no separator, so every existing entry is untouched.
 */
export function splitAlternates(headword) {
  const parts = String(headword)
    .split(/[／/]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [String(headword)];
}

export function parseVocaEntries(html) {
  const entries = [];
  for (const [, tableBody] of html.matchAll(VOCA_TABLE)) {
    for (const [, rowBody] of tableBody.matchAll(ROW)) {
      const cells = [...rowBody.matchAll(CELL)].map(([, attrs, body]) => ({
        sub: SUB_CELL.test(attrs),
        text: stripTags(body),
      }));
      if (cells.length < 2) continue;
      const [head, ...rest] = cells;
      if (!head.text) continue;
      const english = rest
        .map((c) => c.text)
        .filter(Boolean)
        .join(" ");
      // A headword cell can hold SEVERAL words for one gloss, separated by ／: `つま ／ かない`
      // (my wife), `おっと ／ しゅじん` (my husband). Each is its own word and needs its own card.
      // Treating the cell as one headword is a false NEGATIVE that looks like a false positive: the
      // whole cell is reported missing, `nearest` points at the half that IS carded, and the row
      // reads as the documented optional-parts noise. That is exactly how three missing words —
      // かない, おっと, しゅじん — sat in an INFO report and were dismissed, while a card in the same
      // book used しゅじん in a sentence with nothing teaching it.
      for (const part of splitAlternates(head.text)) {
        entries.push({ target: part, english, sub: head.sub });
      }
    }
  }
  return entries;
}

/**
 * The forms a headword could plausibly appear as in a card's `target`.
 *
 * Two book conventions make a bare string match wrong, and both produce a FALSE MISS — a word the
 * deck already teaches, reported as absent:
 *   - the optional-prefix parenthesis, `(お)てら` / `(お)さけ`, where the card carries one of the two
 *   - the attachment-point wave dash, `〜さん` / `お〜`, which is notation, never card text
 * Editorial spaces go too: the deck stores Japanese unspaced (normalizeDisplayText), the book does not.
 */
export function vocabTargetVariants(headword) {
  const bare = headword.replace(/[\s\u3000]+/g, "");
  const variants = new Set();

  const add = (value) => {
    const cleaned = value.replace(/[〜～~]/g, "").replace(/[\s\u3000]+/g, "");
    if (cleaned) variants.add(cleaned);
  };

  // (お)てら -> おてら AND てら. Both are legitimate card text; either one covers the entry. The
  // parenthesized form itself is not a variant: no card's target is ever written that way.
  if (/[（(]/.test(bare)) {
    add(bare.replace(/[（(]([^）)]*)[）)]/g, "$1"));
    add(bare.replace(/[（(][^）)]*[）)]/g, ""));
  } else {
    add(bare);
  }
  return [...variants];
}

function normalizeCardTarget(target) {
  return String(target || "").replace(/[\s\u3000]+/g, "");
}

/**
 * Vocabulary entries whose headword appears in no card's `target`.
 *
 * Each report carries the entry, and a `nearest` card target sharing a run of the headword when one
 * exists. That is what turns the expected false positives into a five-second check instead of a
 * re-read: a real miss has no neighbour at all, while `(お)てら` vs `おてら` shows its twin
 * immediately. Excluded cards still count as coverage — the word IS in the deck, and whether to
 * ship it is a separate decision.
 */
export function findUncoveredVocab(entries, cards, { includeSubRows = true } = {}) {
  const targets = (cards || []).map((card) => normalizeCardTarget(card.target)).filter(Boolean);

  const misses = [];
  for (const entry of entries) {
    if (entry.sub && !includeSubRows) continue;
    const variants = vocabTargetVariants(entry.target);
    if (variants.length === 0) continue;
    if (variants.some((v) => targets.some((t) => t.includes(v)))) continue;

    misses.push({ ...entry, variants, nearest: nearestTarget(variants, targets) });
  }
  return misses;
}

// The longest card target sharing at least two characters with one of the variants. Deliberately
// crude: it is a pointer for a human, not a verdict.
function nearestTarget(variants, targets) {
  let best = null;
  let bestScore = 0;
  for (const target of targets) {
    for (const variant of variants) {
      const score = sharedRun(variant, target);
      if (score >= 2 && score > bestScore) {
        best = target;
        bestScore = score;
      }
    }
  }
  return best;
}

function sharedRun(a, b) {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let len = a.length - i; len > best; len--) {
      if (b.includes(a.slice(i, i + len))) {
        best = len;
        break;
      }
    }
  }
  return best;
}

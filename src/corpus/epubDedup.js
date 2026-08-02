import { normalizeDisplayText } from "../model/scriptSpacing.js";

function noteWithMatch(existingReviewNote, chapterLabel, matchedField) {
  const concern = `Possibly already taught — already introduced in ${chapterLabel} (matched on ${matchedField})`;
  return existingReviewNote ? `${existingReviewNote} | ${concern}` : concern;
}

/**
 * Backward-looking, deterministic, non-destructive review — pure function, no I/O.
 * Flags (never drops) any candidate item whose english (case-insensitive, trimmed)
 * or target (exact, trimmed) matches an item from an earlier chapter of the same
 * book. `priorItems` is expected to carry `__chapterNumber`/`__chapterLabel` (see
 * epubLibrary.js's loadPriorChapterItems) so a flag can name which earlier chapter
 * it matched.
 *
 * Returns `{ items, flagged }`: `items` is `candidateItems` in the same order and
 * count, annotated (`uncertain: true` plus a "Possibly already taught — ..." note)
 * where matched; `flagged` is the subset actually matched, each paired with its
 * original (pre-annotation) item plus which field matched and the prior item it
 * matched, for logging. Matched items are never removed — the human reviewer sees
 * and decides, same philosophy as the forward pass (flagForwardConcerns).
 *
 * `languageCode` (ISO 639-1) makes the target comparison normalization-proof: fresh
 * candidates arrive BEFORE the CLI's display normalization (editorial spaces, trailing
 * 。 intact) while the stored library was saved after it — and older library entries
 * predate the normalization entirely — so both sides are passed through
 * `normalizeDisplayText` before comparing. Identity for languages with real spaces.
 */
export function dedupBackward(candidateItems, priorItems, { languageCode } = {}) {
  const targetKey = (target) => normalizeDisplayText(target.trim(), languageCode);
  // First occurrence wins: priorItems arrive in chapter order, so a term taught in several
  // earlier chapters is attributed to the chapter that introduced it.
  const priorEnglish = new Map();
  const priorTarget = new Map();
  for (const prior of priorItems) {
    const englishKey = prior.english.trim().toLowerCase();
    if (!priorEnglish.has(englishKey)) {
      priorEnglish.set(englishKey, prior);
    }
    if (prior.target && !priorTarget.has(targetKey(prior.target))) {
      priorTarget.set(targetKey(prior.target), prior);
    }
  }

  const flagged = [];
  const items = candidateItems.map((item) => {
    const englishMatch = priorEnglish.get(item.english.trim().toLowerCase());
    const targetMatch = item.target ? priorTarget.get(targetKey(item.target)) : undefined;
    const match = englishMatch ?? targetMatch;

    if (!match) {
      return item;
    }

    const matchedField = englishMatch ? "english" : "target";
    flagged.push({ item, matchedField, matchedPriorItem: match });

    return {
      ...item,
      uncertain: true,
      reviewNote: noteWithMatch(item.reviewNote, match.__chapterLabel, matchedField),
    };
  });

  return { items, flagged };
}

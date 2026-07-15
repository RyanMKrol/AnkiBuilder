function noteWithMatch(existingNotes, chapterLabel, matchedField) {
  const concern = `Possibly already taught — already introduced in ${chapterLabel} (matched on ${matchedField})`;
  return existingNotes ? `${existingNotes} | ${concern}` : concern;
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
 */
export function dedupBackward(candidateItems, priorItems) {
  const priorEnglish = new Map();
  const priorTarget = new Map();
  for (const prior of priorItems) {
    priorEnglish.set(prior.english.trim().toLowerCase(), prior);
    if (prior.target) {
      priorTarget.set(prior.target.trim(), prior);
    }
  }

  const flagged = [];
  const items = candidateItems.map((item) => {
    const englishMatch = priorEnglish.get(item.english.trim().toLowerCase());
    const targetMatch = item.target ? priorTarget.get(item.target.trim()) : undefined;
    const match = englishMatch ?? targetMatch;

    if (!match) {
      return item;
    }

    const matchedField = englishMatch ? "english" : "target";
    flagged.push({ item, matchedField, matchedPriorItem: match });

    return {
      ...item,
      uncertain: true,
      notes: noteWithMatch(item.notes, match.__chapterLabel, matchedField),
    };
  });

  return { items, flagged };
}

/**
 * Backward-looking, deterministic, hard drop — pure function, no I/O.
 * Drops any candidate item whose english (case-insensitive, trimmed) or
 * target (exact, trimmed) matches an item from an earlier chapter of the
 * same book. `priorItems` is expected to carry `__chapterNumber` (see
 * epubLibrary.js's loadPriorChapterItems) so a drop can name which earlier
 * chapter it matched — `dropped[].matchedPriorItem.__chapterNumber`.
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

  const kept = [];
  const dropped = [];
  for (const item of candidateItems) {
    const englishMatch = priorEnglish.get(item.english.trim().toLowerCase());
    const targetMatch = item.target ? priorTarget.get(item.target.trim()) : undefined;
    const match = englishMatch ?? targetMatch;

    if (match) {
      dropped.push({
        item,
        matchedField: englishMatch ? "english" : "target",
        matchedPriorItem: match,
      });
    } else {
      kept.push(item);
    }
  }

  return { kept, dropped };
}

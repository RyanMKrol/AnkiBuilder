// The romaji line of a silent character card: the readings the book lists for the character, since
// a character alone has no one pronunciation and so no audio (owner decision, 2026-09-27). Nothing
// here knows a language: the language plugin supplies `characterReadings` (src/reading/readingSchemes.js:
// how to find the readings in a chapter and how to write them). A language without it is untouched.

/** The readings the language plugin finds in a chapter's HTML: `Map<character, readings>`. */
export function characterReadingsIn(html, scheme) {
  return scheme?.characterReadings?.fromChapter(html) ?? new Map();
}

/**
 * `items` with the readings line set on each silent character card `readings` covers and that has
 * no romaji yet (a reviewer's own line is never overwritten). Returns `{ items, filled }`.
 */
export function withCharacterReadings(items, readings, scheme) {
  if (!scheme?.characterReadings || !readings.size) return { items, filled: 0 };
  let filled = 0;
  const out = items.map((item) => {
    const silentCharacter = scheme.isCharacterTarget(item.target) && !item.ttsText;
    if (!silentCharacter || String(item.pronunciation ?? "").trim()) return item;
    const entry = readings.get(item.target);
    if (!entry) return item;
    filled++;
    return { ...item, pronunciation: scheme.characterReadings.line(entry) };
  });
  return { items: out, filled };
}

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

/**
 * Every character card of a unit completed through the language plugin (`characterSource.complete`
 * and `soleReading`): its readings line becomes the full reference list, the book's (or the reviewed
 * generated card's) readings first, and a character with exactly one reading is voiced with it
 * (`ttsText`), while one with several stays silent. `base` is `Map<character, readings>`; `record`
 * is the unit's candidates/characters.json, whose `cards` says which cards are character cards, so a
 * voiced one is never mistaken for a word card of a single-character word (日 read ひ). Returns
 * `{ items, record, changed }`.
 */
export function completeCharacterCards(items, { scheme, base, record }) {
  const source = scheme?.characterSource;
  if (!source?.complete) return { items, record, changed: 0 };
  const cards = { ...(record?.cards ?? {}) };
  let changed = 0;
  const out = items.map((item) => {
    const isCharacterCard =
      scheme.isCharacterTarget(item.target) && (!item.ttsText || cards[item.target]);
    if (!isCharacterCard) return item;
    const readings = source.complete(base.get(item.target) ?? null, item.target);
    if (!readings) return item;
    const sole = source.soleReading(readings);
    cards[item.target] = { readings, voiced: Boolean(sole) };
    const next = { ...item, pronunciation: source.line(readings) };
    if (sole) next.ttsText = sole;
    else delete next.ttsText;
    const same =
      next.pronunciation === item.pronunciation &&
      (next.ttsText ?? null) === (item.ttsText ?? null);
    if (!same) changed++;
    return same ? item : next;
  });
  return { items: out, record: { ...(record ?? { generated: [] }), cards }, changed };
}

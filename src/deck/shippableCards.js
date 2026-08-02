/**
 * The cards of a unit that actually ship.
 *
 * Both delivery paths need this and they must never disagree. If the `.apkg` shipped a card the
 * AnkiConnect push skipped (or the reverse), the package and the live collection would hold
 * different decks with nothing to report it. The same split already caused one bug when each side
 * worked out a deck's NAME separately, so the rule lives in one place, as `deckPath.js` does for
 * naming.
 *
 * Its own module rather than part of rebuild.js, which imports deck/index.js and would make the
 * dependency circular.
 */
export function shippableCards(cards) {
  return (cards?.items || []).filter((item) => !item.excluded);
}

/**
 * Refuses a shipping card set whose ids repeat, because the card id IS the Anki note key on
 * both delivery paths — the `.apkg` writes it as the note's `guid` and the AnkiConnect push
 * tags notes `abid:<card.id>` — so two cards with one id silently become one note and the
 * later card overwrites the earlier. The learner studies one of the two and never sees the
 * other, with nothing anywhere reporting a problem (the JBP Book 1 deck carried ten such
 * pairs for as long as delivery had existed).
 *
 * This throws instead, because there is no safe interpretation: whether the pair is one card
 * taught twice (drop a copy) or two cards that collided (re-id the later one) is a judgment
 * about the source material that only a human can make.
 *
 * `cardSets` is `[{ label, items }]` — one entry per unit/chapter, `label` naming it for the
 * error message; `deckDescription` names the whole deck being built or delivered.
 */
export function assertUniqueCardIds(cardSets, deckDescription) {
  const seen = new Map();
  for (const { label, items } of cardSets) {
    for (const card of items) {
      if (!seen.has(card.id)) seen.set(card.id, []);
      seen.get(card.id).push(label ?? "?");
    }
  }
  const clashes = [...seen.entries()].filter(([, where]) => where.length > 1);
  if (!clashes.length) return;
  const detail = clashes.map(([id, where]) => `${id} (${where.join(", ")})`).join("; ");
  throw new Error(
    `${deckDescription} has duplicate card ids, which would map two cards onto one Anki note: ` +
      `${detail}. Delete the redundant card, or give the later one its own id, then re-run.`,
  );
}

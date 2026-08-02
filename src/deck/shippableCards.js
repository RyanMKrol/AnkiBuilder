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

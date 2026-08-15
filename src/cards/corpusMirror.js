/**
 * Mirroring a `cards.json` exclusion back into the unit's `corpus.json`.
 *
 * The two files describe the same unit from two ends: `corpus.json` is what the corpus review gate
 * shows and what the dedup library is saved from, `cards.json` is what the deck is built from. When
 * a tool excludes a card in one and not the other, the review keeps offering an item the deck will
 * never ship, and the next unit's dedup pass keeps seeing it as taught. `extras-order.mjs` already
 * mirrors ORDER for exactly this reason; exclusion is the same shape of fact and was not mirrored.
 *
 * Deliberately one-directional (cards → corpus) and deliberately additive: it sets `excluded` and
 * carries the provenance across, and it never CLEARS an exclusion the corpus already carries. An
 * exclusion in the corpus and not in the cards is the ordinary result of the corpus review (translate
 * drops excluded items when it writes cards.json), not drift to be undone.
 */
export function mirrorExclusions(cardItems = [], corpusItems = []) {
  const byId = new Map(corpusItems.map((item) => [item.id, item]));
  const mirrored = [];

  for (const card of cardItems) {
    if (!card.excluded) continue;
    const item = byId.get(card.id);
    if (!item || item.excluded === true) continue;
    item.excluded = true;
    if (card.excludedBy) item.excludedBy = card.excludedBy;
    if (card.excludedReason) item.excludedReason = card.excludedReason;
    mirrored.push(card.id);
  }

  return { changed: mirrored.length > 0, ids: mirrored };
}

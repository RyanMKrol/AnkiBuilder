// Where each card's word first appears in the chapter, so a review can be read alongside the book.
//
// THIS IS NOT THE DECK'S ORDER. The stored order is pedagogical (atoms before molecules, so a learner
// meets vocabulary before the sentences built on it) and it flows to the deck unchanged. That order
// is right for studying and wrong for reviewing, because a reviewer reads the chapter top to bottom
// and the table jumps around. `sourceOrder` is a second, independent answer the review view sorts by.
//
// WHY A TEXT SEARCH RATHER THAN THE PROVENANCE THE AGENTS ALREADY REPORT. The chapter reader returns
// `foundIn` and the table specialist `fromTable`, and both are real, but neither orders a chapter:
// six of Lesson 17's sections are titled "VOCABULARY", so a section name is ambiguous, and a table
// index says nothing about where the table sits relative to the prose. A character offset into the
// chapter is unambiguous, needs no cooperation from any model, and works for every producer
// including the ones that invent nothing but were not asked where they looked.
//
// Base units only. An extras unit is sentences, many of them composed rather than printed, so most
// would have no position at all and the ones that did would sort meaninglessly against them.
import { normalizeDisplayText } from "../model/scriptSpacing.js";

/** Chapter text with markup and whitespace removed, which is what card targets are compared against. */
function flatten(chapterHtml) {
  return normalizeDisplayText(String(chapterHtml ?? "").replace(/<[^>]+>/g, " "), null).replace(
    /\s+/g,
    "",
  );
}

function key(target, languageCode) {
  return normalizeDisplayText(String(target ?? ""), languageCode).replace(/\s+/g, "");
}

/**
 * Assigns each item the offset at which its target first appears, or null when it appears nowhere.
 *
 * **Longest target first, and each match is claimed.** Without that, a short word takes the position
 * of its first occurrence INSIDE a longer card's word: on Lesson 17 `て` (hand) matched inside
 * `からて` (karate) and sorted a hundred characters early, into the middle of the hobbies list. So
 * the longest targets choose first and blank out what they take, and a short word lands on the next
 * occurrence nobody else wanted — which is the standalone entry the book prints for it.
 *
 * A target that only ever appears inside another card's word still gets that shared position rather
 * than null: it is in the chapter, the reviewer will find it there, and null would sort it to the end
 * away from its own section.
 */
export function assignSourceOrder(items, chapterHtml, { languageCode = null } = {}) {
  const flat = flatten(chapterHtml);
  if (!flat) return new Map();

  const masked = flat.split("");
  const byLength = [...(items ?? [])]
    .filter((item) => item && key(item.target, languageCode))
    .sort((a, b) => key(b.target, languageCode).length - key(a.target, languageCode).length);

  const out = new Map();
  for (const item of byLength) {
    const needle = key(item.target, languageCode);
    const unclaimed = masked.join("").indexOf(needle);
    if (unclaimed >= 0) {
      for (let i = unclaimed; i < unclaimed + needle.length; i += 1) masked[i] = "\u0000";
      out.set(item.id, unclaimed);
      continue;
    }
    const anywhere = flat.indexOf(needle);
    out.set(item.id, anywhere >= 0 ? anywhere : null);
  }
  return out;
}

/**
 * The items in the order the book prints them, with anything unplaced kept in its existing order at
 * the end. Pure: it returns a new array and never touches the input or the stored order.
 */
export function inSourceOrder(items) {
  return [...(items ?? [])]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const av = a.item.sourceOrder;
      const bv = b.item.sourceOrder;
      const aHas = typeof av === "number";
      const bHas = typeof bv === "number";
      if (aHas && bHas) return av - bv || a.index - b.index;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

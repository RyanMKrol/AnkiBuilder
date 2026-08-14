/**
 * Do two English glosses say the same thing?
 *
 * Shared by the cross-deck report (which uses it to keep wording differences out of a list a human
 * has to read) and by `extras-duplicate-check --apply` (which uses it to refuse a group whose
 * members are not obviously the same card).
 *
 * Deliberately shallow: a report-noise filter and a safety brake, not a synonym engine. It
 * lowercases, drops parenthetical asides and `___` blanks, splits on commas and slashes into
 * alternatives, unifies written and numeric ordinals, drops a leading article and strips a trailing
 * plural. Two glosses agree when their alternative sets intersect. "Big" and "Big, large" agree;
 * "Car park" and "Parking lot" do not, and should not — that is a real difference in what two decks
 * teach, whoever ends up judging it.
 */

const ORDINALS = {
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
  sixth: "6",
  seventh: "7",
  eighth: "8",
  ninth: "9",
  tenth: "10",
  eleventh: "11",
  twelfth: "12",
};

// A crude plural strip, with the endings that are never one carved out — otherwise "this" becomes
// "thi" and every demonstrative in the deck stops matching itself.
const isPlural = (word) => word.length > 3 && word.endsWith("s") && !/(ss|is|us|as)$/.test(word);

/** The set of answers a gloss offers, normalized. */
export function glossAlternatives(text) {
  const cleaned = String(text ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/_+/g, " ")
    .replace(/[.?!。]+/g, " ");
  // The WHOLE gloss counts as an alternative alongside its comma-separated parts, so "Once more,
  // please." and "Once more please" agree — one deck's comma is not a second answer.
  const parts = [cleaned, ...cleaned.split(/[,/;]|\bor\b/)];
  const out = new Set();
  for (const part of parts) {
    const words = part
      .trim()
      .split(/[\s,/;]+/)
      .filter(Boolean)
      .filter((word, index) => !(index === 0 && ["the", "a", "an"].includes(word)))
      .map((word) => ORDINALS[word] ?? word.replace(/^(\d+)(st|nd|rd|th)$/, "$1"))
      .map((word) => (isPlural(word) ? word.slice(0, -1) : word));
    const normalized = words.join(" ");
    if (normalized) out.add(normalized);
  }
  return out;
}

/** True when two glosses share at least one normalized alternative. */
export function glossesAgree(a, b) {
  const left = glossAlternatives(a);
  for (const alternative of glossAlternatives(b)) if (left.has(alternative)) return true;
  return false;
}

// A card's English as a list of senses joined with "; " ("Today; this day"), the form every reading
// card with two meanings uses (docs/card-rules-reading.md, rule 3). Shared by the chapter merge
// (readingPhase.js) and the sound deck (soundDeck.js), so a joined gloss reads the same in both.

/** The senses of one `english`, split on ";". */
export function splitGloss(english) {
  return String(english ?? "")
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Several glosses are joined with "; ", and a full stop inside that list reads as "Excuse me.; I'm
// sorry.", so a joined gloss loses its trailing full stops. A single gloss is kept as written. The
// stop of an abbreviation is part of the word and stays: さん is "Three; Mr./Ms.", not "Mr./Ms".
const ABBREVIATION_END = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|etc|vs|approx)\.$/i;
/** One `english` from a list of senses, in the order given, with repeats dropped. */
export function joinGlosses(glosses) {
  const seen = new Set();
  const out = [];
  for (const gloss of glosses) {
    // "Good-bye" and "Goodbye", "Good morning." and "Good morning" are one gloss.
    const dedupeKey = gloss.toLowerCase().replace(/[\s.,;:!?'"-]+/g, "");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(gloss);
  }
  if (out.length === 1) return out[0];
  return out
    .map((gloss) => (ABBREVIATION_END.test(gloss) ? gloss : gloss.replace(/\.+$/, "")))
    .join("; ");
}

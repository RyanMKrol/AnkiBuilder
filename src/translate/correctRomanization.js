// Re-run the romanization correction over a set of cards that already have pronunciations.
//
// The correction normally runs inside `translate`, and `translate` cannot be re-run to recover it:
// it short-circuits on an existing cards.json, and when it doesn't it rebuilds that file from the
// corpus — discarding the drill block, every audio reference and the cross-lesson notes. So the one
// pass that touches the romaji on every card had no recovery path at all, which is how a whole
// lesson once shipped raw, mis-split library romaji with the build looking clean.
//
// This is that path: the same module, driven against cards that already exist, returning the same
// `{ items, failed, reason }` shape the ledger records.
import { romanizeAndEvaluate } from "./romanizationEval.js";
import { ROMANIZATION_LIBRARIES } from "./romanizationLibraries.js";

export async function correctRomanization({ items, targetLanguage, languageCode, log = () => {} }) {
  const libraryEntry = ROMANIZATION_LIBRARIES[languageCode];
  if (!libraryEntry) {
    // Not a failure: a language with no configured library never ran this pass in the first place.
    log(`romanization: no library configured for ${targetLanguage} — nothing to correct`);
    return { items, failed: false, skipped: true };
  }

  return romanizeAndEvaluate(items, {
    targetLanguage,
    libraryEntry,
    log,
    // An item whose library adapter throws keeps whatever pronunciation it already has, rather than
    // dropping out of the result set and so out of the file.
    fallback: (rest) => ({ items: rest, errors: [] }),
  });
}

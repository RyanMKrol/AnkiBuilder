// The romaji on the back of a reading card (owner decision, 2026-09-23 evening: the back is the
// written form, the English, the romaji and the audio, so the learner can check they READ the word
// correctly, not only that they understood it).
//
// Produced exactly as the speaking decks produce theirs (src/translate/romanizationEval.js): the
// language's romanisation library, then one correction pass against the pinned house style
// (src/translate/romajiStyle.js), so the romaji on the two decks can never disagree in style. The
// library is given the card's kana READING, copied from the book, rather than its kanji, so it never
// has to guess how a kanji word is read.
//
// A silent card (a single kanji, which has no one pronunciation) gets no romaji, for the same reason
// it gets no audio.
//
// RESUMABLE. The results are cached per card id in the unit's candidates/romanization.json; a re-run
// or a --remerge only romanises cards that have none, so the paid correction is not repeated.

import { romanizeAndEvaluate } from "../translate/romanizationEval.js";
import { getRomanizationLibrary } from "../translate/romanizationLibraries.js";
import { resolveIso639Code } from "../model/iso639.js";

/**
 * Fills `pronunciation` on every voiced item, reusing `cached` (`{ [id]: romaji }`) where it has an
 * entry. Returns `{ items, romanized, reused, skipped, failed, reason }`: `romanized` is the new
 * `{ id, target, pronunciation }` rows to cache, `skipped` names what got none and why.
 */
export async function romanizeReadingItems(
  items,
  { targetLanguage, isSilent = () => false, cached = {}, runClaude, log = () => {} } = {},
) {
  const code = resolveIso639Code(targetLanguage) ?? targetLanguage;
  const libraryEntry = getRomanizationLibrary(code);
  const voiced = items.filter((item) => !isSilent(item));
  const todo = voiced.filter((item) => !cached[item.id]);
  const skipped = items
    .filter((item) => isSilent(item))
    .map((i) => ({ id: i.id, reason: "silent" }));

  let fresh = [];
  let failed = false;
  let reason = null;
  if (todo.length && libraryEntry) {
    const result = await romanizeAndEvaluate(todo, {
      targetLanguage,
      libraryEntry,
      ...(runClaude ? { runClaude } : {}),
      log,
      // A card the library could not romanise gets none, and is named, rather than a guess: the
      // reading preflight refuses a voiced card with no romaji, so it cannot ship that way.
      fallback: (rest) => ({
        items: rest.map((item) => ({ ...item, pronunciation: "" })),
        errors: [],
      }),
    });
    fresh = result.items;
    failed = result.failed;
    reason = result.reason;
  } else if (todo.length) {
    // No library for this language: the speaking pipeline's model-only path is not wired here yet,
    // so these are named rather than invented.
    for (const item of todo)
      skipped.push({ id: item.id, reason: `no romanisation library for ${code}` });
  }

  const byId = new Map([
    ...Object.entries(cached).map(([id, pronunciation]) => [id, pronunciation]),
    ...fresh.map((item) => [item.id, item.pronunciation]),
  ]);
  return {
    items: items.map((item) =>
      isSilent(item)
        ? { ...item, pronunciation: "" }
        : { ...item, pronunciation: byId.get(item.id) ?? "" },
    ),
    romanized: fresh.map((item) => ({
      id: item.id,
      target: item.target,
      pronunciation: item.pronunciation,
    })),
    reused: voiced.length - todo.length,
    skipped,
    failed,
    reason,
  };
}

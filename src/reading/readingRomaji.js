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
// A word the book prints with more than one reading (七人: しちにん／ななにん) arrives with its first
// reading in `ttsText` and the rest in `alternateReadings`. Each reading is romanised on its own, in
// the same call, and the card's romaji lists them in the book's order, "shichi-nin / nana-nin"
// (owner ruling, 2026-10-18). The audio stays the first reading: nothing here touches `ttsText`.
//
// RESUMABLE. The results are cached per card id in the unit's candidates/romanization.json; a re-run
// or a --remerge only romanises cards that have none, so the paid correction is not repeated.

import { romanizeAndEvaluate } from "../translate/romanizationEval.js";
import { getRomanizationLibrary } from "../translate/romanizationLibraries.js";
import { resolveIso639Code } from "../model/iso639.js";

/** Separates the readings in a joined romaji line. Spaced, so it never meets a romaji hyphen. */
export const READINGS_SEPARATOR = " / ";

const alternatesOf = (item) =>
  Array.isArray(item.alternateReadings) ? item.alternateReadings.filter(Boolean) : [];

// The id a second reading is romanised under, inside one call. Never cached, never written.
const alternateId = (id, index) => `${id}#reading-${index + 2}`;

/**
 * Fills `pronunciation` on every voiced item, reusing `cached` (`{ [id]: romaji }`) where it has an
 * entry. Returns `{ items, romanized, reused, skipped, failed, reason }`: `romanized` is the new
 * `{ id, target, pronunciation }` rows to cache, `skipped` names what got none and why.
 *
 * An item with `alternateReadings` gets every reading romanised and joined with
 * READINGS_SEPARATOR. A cached romaji that lists fewer readings than the item has (one cached before
 * the alternates were kept) is romanised again rather than reused.
 */
export async function romanizeReadingItems(
  items,
  {
    targetLanguage,
    isSilent = () => false,
    cached = {},
    runClaude,
    log = () => {},
    libraryEntry: injectedLibrary,
  } = {},
) {
  const code = resolveIso639Code(targetLanguage) ?? targetLanguage;
  const libraryEntry = injectedLibrary ?? getRomanizationLibrary(code);
  const voiced = items.filter((item) => !isSilent(item));
  const cachedFits = (item) =>
    Boolean(cached[item.id]) &&
    String(cached[item.id]).split(READINGS_SEPARATOR).length === 1 + alternatesOf(item).length;
  const todo = voiced.filter((item) => !cachedFits(item));
  const skipped = items
    .filter((item) => isSilent(item))
    .map((i) => ({ id: i.id, reason: "silent" }));

  let fresh = [];
  let failed = false;
  let reason = null;
  if (todo.length && libraryEntry) {
    // Each alternate reading rides along as its own row, spoken form = that reading, and is folded
    // back into its card below.
    const rows = todo.flatMap((item) => [
      item,
      ...alternatesOf(item).map((reading, index) => ({
        id: alternateId(item.id, index),
        target: item.target,
        ttsText: reading,
      })),
    ]);
    const result = await romanizeAndEvaluate(rows, {
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
    const romajiOf = new Map(result.items.map((row) => [row.id, row.pronunciation ?? ""]));
    fresh = todo.map((item) => {
      const all = [
        romajiOf.get(item.id) ?? "",
        ...alternatesOf(item).map((_, index) => romajiOf.get(alternateId(item.id, index)) ?? ""),
      ];
      // A reading the library could not romanise leaves the whole line empty, so the card is named
      // by the reading preflight instead of shipping with half its readings.
      return { ...item, pronunciation: all.every(Boolean) ? all.join(READINGS_SEPARATOR) : "" };
    });
    failed = result.failed;
    reason = result.reason;
  } else if (todo.length) {
    // No library for this language: the speaking pipeline's model-only path is not wired here yet,
    // so these are named rather than invented.
    for (const item of todo)
      skipped.push({ id: item.id, reason: `no romanisation library for ${code}` });
  }

  const byId = new Map([
    ...voiced.filter(cachedFits).map((item) => [item.id, cached[item.id]]),
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

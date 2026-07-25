import { getTtsTextTransform } from "../audio/ttsText.js";

// A digit anywhere in the text handed to TTS. Covers ASCII 0-9 and the fullwidth forms ０-９ that a
// Japanese textbook mixes in freely (the source prints both ４がつ and 4がつ).
const DIGIT = /[0-9０-９]/;

/**
 * Cards whose spoken text still contains a digit.
 *
 * The `reading` field exists precisely so it never does: a card shows `2025ねんに` on its face and
 * speaks `にせんにじゅうごねんに`, because a TTS voice handed a bare numeral reads it in whatever
 * language it feels like, and the romanizer renders it literally (`2025-nen ni`). But `reading` is
 * OPTIONAL, nothing generates it, and until this check nothing verified it either — the extraction
 * prompt asks for one and the model simply didn't, for seven cards of one lesson, and the first
 * anyone knew was hearing the clips.
 *
 * The check is deterministic and needs no model: a digit in the spoken text is always a bug, because
 * the whole point of `reading` is to have spelled it out.
 *
 * Scoped by language, via the same key as the TTS text transforms. For Japanese a numeral is
 * unspeakable; for Spanish `2000 euros` is exactly what the voice should receive, so a language with
 * no transform is left alone.
 */
export function findUnreadableNumbers(items, languageCode) {
  if (!getTtsTextTransform(languageCode)) return [];
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => !item.excluded)
    .filter((item) => {
      // What `speechText` would hand to TTS: the reading when set, else the target.
      const spoken = typeof item.reading === "string" && item.reading ? item.reading : item.target;
      return typeof spoken === "string" && DIGIT.test(spoken);
    })
    .map((item) => ({
      id: item.id,
      target: item.target,
      reading: item.reading ?? null,
      // Distinguishes "nobody wrote a reading" from "the reading itself still has a digit in it",
      // which is a different mistake with a different fix.
      cause: item.reading ? "reading still contains a digit" : "no reading",
    }));
}

/** A multi-line report naming each offending card, for a CLI error or a warning. */
export function describeUnreadableNumbers(offenders) {
  return offenders
    .map(
      (o) => `  - ${o.id}: ${o.target}${o.reading ? ` (reading: ${o.reading})` : ""} — ${o.cause}`,
    )
    .join("\n");
}

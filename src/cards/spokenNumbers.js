import { getTtsTextTransform } from "../audio/ttsText.js";

// A digit anywhere in the text handed to TTS. Covers ASCII 0-9 and the fullwidth forms ０-９ that a
// Japanese textbook mixes in freely (the source prints both ４がつ and 4がつ).
const DIGIT = /[0-9０-９]/;

/**
 * Cards where a digit has leaked into something a human or a voice will consume.
 *
 * The `ttsText` field exists precisely so it never does: a card shows `2025ねんに` on its face and
 * speaks `にせんにじゅうごねんに`, because a TTS voice handed a bare numeral reads it in whatever
 * language it feels like, and the romanizer renders it literally (`2025-nen ni`). But `ttsText` is
 * OPTIONAL, nothing generates it, and until this check nothing verified it either — the extraction
 * prompt asks for one and the model simply didn't, for seven cards of one lesson, and the first
 * anyone knew was hearing the clips.
 *
 * The check is deterministic and needs no model: a digit in either the spoken text or the romaji is
 * always a bug, because the whole point of `ttsText` is to have spelled it out. `target` keeps its
 * digits — `13,000えん` is the right thing to show on the card face.
 *
 * Scoped by language, via the same key as the TTS text transforms. For Japanese a numeral is
 * unspeakable; for Spanish `2000 euros` is exactly what the voice should receive, so a language with
 * no transform is left alone.
 */
export function findUnreadableNumbers(items, languageCode) {
  if (!getTtsTextTransform(languageCode)) return [];
  if (!Array.isArray(items)) return [];

  const offenders = [];
  for (const item of items) {
    if (item.excluded) continue;

    // Two arms, because the same missing `ttsText` produces two separate faults and fixing one does
    // not fix the other — as this repo found out by filling in seven readings, correcting the audio,
    // and leaving seven wrong romaji on screen.
    //
    // 1. The SPOKEN text (`ttsText` when set, else `target`) — what `speechText` hands to TTS.
    const spoken = typeof item.ttsText === "string" && item.ttsText ? item.ttsText : item.target;
    if (typeof spoken === "string" && DIGIT.test(spoken)) {
      offenders.push({
        id: item.id,
        target: item.target,
        ttsText: item.ttsText ?? null,
        field: "spoken",
        // Distinguishes "nobody wrote a ttsText" from "the ttsText itself still has a digit in it",
        // which is a different mistake with a different fix.
        cause: item.ttsText ? "ttsText still contains a digit" : "no ttsText — TTS gets the digits",
      });
      continue;
    }

    // 2. The ROMAJI. This is what the learner actually reads to know how to say the card, so a digit
    //    in it is wrong on its own terms, independently of what the voice received. It also catches
    //    the stale case: a ttsText added later without regenerating the romanization.
    if (typeof item.pronunciation === "string" && DIGIT.test(item.pronunciation)) {
      offenders.push({
        id: item.id,
        target: item.target,
        ttsText: item.ttsText ?? null,
        field: "pronunciation",
        cause: `romaji still contains a digit (${item.pronunciation})`,
      });
    }
  }
  return offenders;
}

/** A multi-line report naming each offending card, for a CLI error or a warning. */
export function describeUnreadableNumbers(offenders) {
  return offenders
    .map(
      (o) => `  - ${o.id}: ${o.target}${o.ttsText ? ` (ttsText: ${o.ttsText})` : ""} — ${o.cause}`,
    )
    .join("\n");
}

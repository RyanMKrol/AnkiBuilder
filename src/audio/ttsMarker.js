// A throwaway syllable appended to Japanese TTS text, purely to be sacrificed.
//
// ElevenLabs frequently clips the end of an utterance. It usually gets the last mora out, but the
// release is cut short, so the clip ends abruptly rather than decaying — audible, and worse on longer
// phrases. Measured on this project's decks, a substantial share of Japanese clips come back with the
// speech running to the final sample and no trailing silence at all.
//
// The fix is to give the model something it is ALLOWED to truncate. `ででで` after the real text means
// whatever gets clipped is the marker, not the content, and the real phrase gets its natural ending.
// The marker is then cut back off (see `markerCandidates` in ./trimSilence.js) before the clip ships.
//
// Japanese only. It leans on ja being written without spaces and on で being a clean, repeated
// open syllable that no real card ends with three of; neither assumption transfers automatically to
// another language, and a wrong guess would put audible nonsense on the end of every card.

// The `。` is part of the MARKER, not of the card's text. It is what makes the model treat the marker
// as a separate little utterance and leave a gap in front of it — and that gap is what makes the
// marker findable and removable. Measured: `はちじ。ででで` leaves a 1.12s gap and strips cleanly, while
// `はちじででで` leaves 0.24s and is not recognised at all (so the clip ships the marker AND its
// silence). Dropping the dot does not simplify anything; it breaks the mechanism.
//
// This absorbs what used to be a per-language "alt audio" transform that appended `。` to the text and
// offered a with-/without-dot pair of takes. That existed to work around clipping and mis-rendered
// short clips; the marker covers both, and the dot now has exactly one job, here.
export const TTS_END_MARKER = "。ででで";

/**
 * Languages whose TTS text gets the marker.
 *
 * One entry, and every other language therefore ships whatever ElevenLabs clips off the end. That is
 * a known unhandled condition rather than an oversight — see the LIMITATIONS entry "End-marker
 * protection is Japanese-only". It is also INVISIBLE: `audioMarkerStuck` can only be set on a marked
 * take, so an unmarked language's clipped ending reaches no badge, no preflight check and no audit
 * script. Adding a language means choosing a throwaway syllable no card in it ends with, generating
 * a sample, and re-deriving the position and pulse-shape thresholds against that sample — not adding
 * a string here.
 */
const MARKED_LANGUAGES = new Set(["ja"]);

export function usesEndMarker(languageCode, env = process.env) {
  if (env.ANKI_BUILDER_TTS_END_MARKER === "0" || env.ANKI_BUILDER_TTS_END_MARKER === "false") {
    return false;
  }
  return MARKED_LANGUAGES.has(languageCode);
}

/**
 * The text to actually send to TTS: `text` with the marker appended, for languages that use one.
 *
 * Applied AFTER the alt-audio transform (ja's trailing `。`), so the model sees a finished sentence and
 * then the marker — which is what makes the marker read as a separate little utterance with a clear
 * gap in front of it, and therefore removable.
 */
export function withEndMarker(text, languageCode, env = process.env) {
  if (!text || !usesEndMarker(languageCode, env)) return text;
  return `${text}${TTS_END_MARKER}`;
}

// A throwaway syllable appended to Japanese TTS text, purely to be sacrificed.
//
// ElevenLabs frequently clips the end of an utterance. It usually gets the last mora out, but the
// release is cut short, so the clip ends abruptly rather than decaying — audible, and worse on longer
// phrases. Measured on this project's decks, a substantial share of Japanese clips come back with the
// speech running to the final sample and no trailing silence at all.
//
// The fix is to give the model something it is ALLOWED to truncate. `ででで` after the real text means
// whatever gets clipped is the marker, not the content, and the real phrase gets its natural ending.
// The marker is then cut back off (see `markerSegment` in ./trimSilence.js) before the clip ships.
//
// Japanese only. It leans on ja being written without spaces and on で being a clean, repeated
// open syllable that no real card ends with three of; neither assumption transfers automatically to
// another language, and a wrong guess would put audible nonsense on the end of every card.

export const TTS_END_MARKER = "ででで";

/** Languages whose TTS text gets the marker. */
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

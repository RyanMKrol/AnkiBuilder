import test from "node:test";
import assert from "node:assert/strict";
import { withEndMarker, usesEndMarker, TTS_END_MARKER } from "../../src/audio/ttsMarker.js";

// ElevenLabs frequently clips the end of an utterance. The marker gives it something disposable to
// clip instead of the card's actual words; the trim cuts the marker back off before the clip ships.
test("Japanese text gets the marker; other languages are untouched", () => {
  assert.equal(withEndMarker("こんにちは。", "ja", {}), "こんにちは。" + TTS_END_MARKER);
  for (const lang of ["es", "fr", "ko", "zh", null, undefined]) {
    assert.equal(withEndMarker("hola", lang, {}), "hola", String(lang));
  }
});

// The assumptions behind it — no word spaces, and a clean repeated open syllable no card ends with —
// are specific to Japanese. Guessing wrong would put audible nonsense on the end of every card.
test("usesEndMarker is Japanese-only, and switchable off", () => {
  assert.equal(usesEndMarker("ja", {}), true);
  assert.equal(usesEndMarker("es", {}), false);
  for (const off of ["0", "false"]) {
    assert.equal(usesEndMarker("ja", { ANKI_BUILDER_TTS_END_MARKER: off }), false, off);
  }
});

test("empty text is left alone rather than becoming a bare marker", () => {
  assert.equal(withEndMarker("", "ja", {}), "");
  assert.equal(withEndMarker(null, "ja", {}), null);
});

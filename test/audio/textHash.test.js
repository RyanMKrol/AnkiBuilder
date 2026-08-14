import test from "node:test";
import assert from "node:assert/strict";
import {
  parseClipTextHash,
  deriveAudioTextHash,
  expectedAudioTextHashes,
  audioTextState,
  currentAudioTextHash,
} from "../../src/audio/textHash.js";
import { hashTerm, defaultClipText } from "../../src/audio/index.js";

// A card and the filename the audio stage would have given its clip. Japanese, so the text carries
// the throwaway end marker (src/audio/ttsMarker.js) and the hashes include it.
const card = (over = {}) => ({
  id: "a",
  english: "Hello",
  category: "Other",
  target: "こんにちは",
  pronunciation: "konnichiwa",
  ...over,
});
const stageHash = (item) => hashTerm(defaultClipText(item, "ja"));

test("a text hash is read off every filename shape a generator produces", () => {
  assert.deepEqual(parseClipTextHash("0123456789abcdef.mp3"), {
    shape: "stage",
    hash: "0123456789abcdef",
  });
  assert.deepEqual(parseClipTextHash("0123456789abcdef.orig.mp3"), {
    shape: "stage",
    hash: "0123456789abcdef",
  });
  assert.deepEqual(parseClipTextHash("0123456789abcdef-gen-aabbccdd.orig.mp3"), {
    shape: "gen",
    hash: "0123456789abcdef",
  });
  assert.deepEqual(parseClipTextHash("0123456789abcdef-genkanji-aabbccdd.orig.mp3"), {
    shape: "genkanji",
    hash: "0123456789abcdef",
  });
});

// 63 live cards carry a variant take stored WITHOUT the `.orig.` infix — picked before
// selectCardAudio was passed the original, so the shipping name became audioOriginal. The hash is
// sitting in the name either way, and insisting on the infix would have thrown it away.
test("the .orig. infix is optional on a variant take", () => {
  assert.deepEqual(parseClipTextHash("0123456789abcdef-gen-aabbccdd.mp3"), {
    shape: "gen",
    hash: "0123456789abcdef",
  });
});

test("a human-named take carries no text hash and is never guessed at", () => {
  for (const name of [
    "is-this-a-pen-user-82c4768e.orig.mp3", // Replace upload
    "hontouni-samui-ne-manual-40d6d328.mp3", // hand cut — hashes the BYTES, not any text
    "osara_fulldot.mp3", // hand-named legacy take
    "apple-custom.mp3",
    "grey-genkanji-366835ad.orig.mp3", // card-id stem, not a text hash
    "",
    null,
    undefined,
  ]) {
    assert.equal(parseClipTextHash(name), null, String(name));
  }
});

test("the hash is read off the original, and off the clip only when there is no original", () => {
  const hash = "0123456789abcdef";
  assert.equal(
    deriveAudioTextHash({ audio: "a-manual-1.mp3", audioOriginal: `${hash}.orig.mp3` })?.hash,
    hash,
  );
  // Seven live cards predate originals being kept; a bare <hash>.mp3 is unambiguously the stage's.
  assert.equal(deriveAudioTextHash({ audio: `${hash}.mp3` })?.hash, hash);
  // An unparseable ORIGINAL is unverifiable — it must not fall through to the shipping clip, whose
  // name describes the processing applied rather than the text spoken.
  assert.equal(
    deriveAudioTextHash({ audio: `${hash}.mp3`, audioOriginal: "x-user-1.orig.mp3" }),
    null,
  );
  assert.equal(deriveAudioTextHash({}), null);
});

test("a clip generated from the card's current text reads as current", () => {
  const item = card();
  const state = audioTextState({ ...item, audio: "a.mp3", audioTextHash: stageHash(item) }, "ja");
  assert.equal(state.state, "current");
});

test("editing the text after the clip was made is what the badge is for", () => {
  const before = card();
  const stale = {
    ...card({ target: "こんばんは" }),
    audio: "a.mp3",
    audioTextHash: stageHash(before),
  };
  assert.equal(audioTextState(stale, "ja").state, "stale");
});

// The whole population this exists for: a hand-picked variant is exempt from the audio stage's own
// staleness check forever, so its hash has to be compared against every form the card can produce.
test("a picked comma-less variant of the card's own text is current, not stale", () => {
  const item = card({ target: "はい、そうです" });
  const variantHash = hashTerm("はいそうです");
  const picked = { ...item, audio: "v.mp3", audioTextHash: variantHash };
  assert.ok(expectedAudioTextHashes(item, "ja").has(variantHash));
  assert.equal(audioTextState(picked, "ja").state, "current");
});

test("a clip with no recorded hash is unverifiable, never stale", () => {
  const item = { ...card(), audio: "is-this-a-pen-user-82c4768e.mp3" };
  assert.equal(audioTextState(item, "ja").state, "unverifiable");
});

// A kanji orthography comes from a model, so it cannot be recomputed here. "Cannot tell" is the only
// honest answer; calling it stale would badge 83 live cards for a comparison nobody made.
test("a kanji take whose source text was not recorded is unverifiable, not stale", () => {
  const item = {
    ...card(),
    audio: "x.mp3",
    audioOriginal: "0123456789abcdef-genkanji-aabbccdd.orig.mp3",
    audioTextHash: "0123456789abcdef",
  };
  assert.equal(audioTextState(item, "ja").state, "unverifiable");

  // With the orthography stored on the card it becomes checkable like anything else.
  const withKanji = { ...item, ttsKanji: "今日は", audioTextHash: hashTerm("今日は") };
  assert.equal(audioTextState(withKanji, "ja").state, "current");
});

// Flipping the per-unit kanji-TTS flag changes what the DEFAULT clip's text is. If the comparison
// only knew one setting, turning the flag on would badge every card in the unit at once.
test("both kanji-TTS settings are accepted, so flipping the flag badges nothing", () => {
  const item = card({ ttsKanji: "今日は" });
  const kana = { ...item, audio: "a.mp3", audioTextHash: hashTerm(defaultClipText(item, "ja")) };
  assert.equal(audioTextState(kana, "ja", { kanjiTts: false }).state, "current");
  assert.equal(audioTextState(kana, "ja", { kanjiTts: true }).state, "current");
});

test("a card with no audio has nothing to say", () => {
  assert.equal(audioTextState(card(), "ja").state, "none");
  assert.equal(audioTextState(null, "ja").state, "none");
});

// The exit from a stale badge: the reviewer keeps the clip, and the hash moves to the current text.
test("accepting a clip re-stamps it from the card's text as it stands now", () => {
  const edited = card({ target: "こんばんは" });
  const accepted = {
    ...edited,
    audio: "a.mp3",
    audioTextHash: currentAudioTextHash(edited, "ja"),
    audioTextHashAcceptedBy: "human",
  };
  const state = audioTextState(accepted, "ja");
  assert.equal(state.state, "current");
  assert.equal(state.acceptedBy, "human");
});

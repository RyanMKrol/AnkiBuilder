import { hashTerm, defaultClipText } from "./index.js";
import { cardAudioVariants } from "./variants.js";
import { normalizeTtsText } from "./ttsText.js";

/**
 * `audioTextHash`: what text a card's clip was actually generated from.
 *
 * ── The hole this closes ─────────────────────────────────────────────────────────────────────────
 *
 * The audio stage's staleness check (`clipIsCurrent`, src/cli/commands/audio.js) short-circuits to
 * "current" whenever `isStageOwnedCard` is false — which it is for every hand-picked variant, every
 * Replace upload and every hand-trimmed card. Roughly 200 cards in the live book are therefore
 * exempt from the text-changed check forever, while the dashboard's inline edit rewrites `target`
 * and `ttsText` freely. A clip of the old words keeps shipping, and nothing anywhere says so.
 *
 * The fix is to stop inferring "what does this clip say" from whether the stage owns the card, and
 * record it. Clip names are content-addressed, so the answer is already sitting in the filename;
 * this module reads it off, and compares it against every hash the card's CURRENT text can produce.
 *
 * ── Why it is read off the FILENAME and never stamped from current text ──────────────────────────
 *
 * Deriving a text hash from a name infers provenance from a string, which is the mistake
 * `isStageOwnedCard` already made once (it judged stage-ownership from `audio` until cleanup renamed
 * everything). It is still the right trade here, because the alternative — stamping every existing
 * card from its current text — would permanently certify exactly the drift this exists to detect. A
 * name that cannot be parsed yields "unverifiable" rather than a guess.
 *
 * The one exception is a HUMAN saying "this clip is right for the text as it stands now", which is
 * the accept action in the audio review. That re-stamps from current text and records who and when
 * (`audioTextHashAcceptedBy` / `audioTextHashAcceptedAt`), so a one-click certification of drift is
 * at least auditable, which today's silence is not.
 *
 * ── Badge, not gate ──────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here blocks. `handleLessonDone` has no gate of any kind today, and a hash mismatch has no
 * exit that does not destroy a human's trim or pick, so a block would teach an override habit on the
 * owner's daily path. It reports.
 */

/**
 * The clip-filename shapes that carry a text hash, and what the hash is OVER.
 *
 * Each producer names its take after the text it sent to TTS:
 *   - the audio stage      `<hash(defaultClipText)>.mp3` / `.orig.mp3`   (src/audio/index.js)
 *   - Generate             `<hash(variant.ttsText)>-gen-<bytes>.mp3`     (generateVariants.js:68)
 *   - Generate (kanji)     `<hash(kanjiText)>-genkanji-<bytes>.mp3`      (generateKanjiVariants.js:65)
 *
 * The `.orig.` infix is optional on every one of them. It is absent on the older takes — a variant
 * picked before `selectCardAudio` was passed its original stored the SHIPPING name as
 * `audioOriginal`, and 63 live cards still carry one. Requiring `.orig.` there would have thrown
 * away a hash that is sitting right there in the name.
 */
const CLIP_SHAPES = [
  ["stage", /^([0-9a-f]{16})\.(?:orig\.)?mp3$/],
  ["gen", /^([0-9a-f]{16})-gen-[0-9a-f]{8}\.(?:orig\.)?mp3$/],
  ["genkanji", /^([0-9a-f]{16})-genkanji-[0-9a-f]{8}\.(?:orig\.)?mp3$/],
];

/**
 * The text hash encoded in a clip filename, as `{ shape, hash }`, or null.
 *
 * Null for everything a human named: a Replace upload (`<cardId>-user-<bytes>.orig.mp3`), the
 * hand-named legacy takes (`osara_fulldot.mp3`, `apple-custom.mp3`), and a `-manual-` cut (whose
 * name hashes the cut BYTES, not any text). Those cards are unverifiable, on purpose.
 */
export function parseClipTextHash(filename) {
  if (typeof filename !== "string") return null;
  for (const [shape, pattern] of CLIP_SHAPES) {
    const match = pattern.exec(filename);
    if (match) return { shape, hash: match[1] };
  }
  return null;
}

/**
 * The text hash to BACKFILL onto a card, read off the take it already points at.
 *
 * `audioOriginal` first: it names the untouched take, which is the one whose name still describes
 * the text. `audio` is only consulted when there is no original at all (seven live cards generated
 * before originals were kept), and then only because a bare `<hash>.mp3` is unambiguously the
 * stage's own default clip.
 */
export function deriveAudioTextHash(item) {
  if (!item || !item.audio) return null;
  if (item.audioOriginal) return parseClipTextHash(item.audioOriginal);
  return parseClipTextHash(item.audio);
}

/**
 * Every text hash this card's CURRENT text could legitimately have produced.
 *
 * A card is "current" if its recorded hash is any one of them — not just the stage default — because
 * a reviewer who auditioned a comma-less or bracket-less variant and picked it chose a clip of this
 * card's text, and re-badging that as drift the moment they pick it would make the badge useless.
 *
 * The kanji orthography is included only when the card carries one (`ttsKanji`). It is produced by a
 * model, so it cannot be recomputed here; a `-genkanji-` clip on a card with no stored `ttsKanji` is
 * reported unverifiable rather than guessed at.
 */
export function expectedAudioTextHashes(item, languageCode, { kanjiTts = false } = {}) {
  const hashes = new Set();
  if (!item) return hashes;

  hashes.add(hashTerm(defaultClipText(item, languageCode, { kanjiTts })));
  // Both flag states, so turning the per-unit kanji-TTS flag on (or off) does not badge every card
  // in the unit at once — the clip on disk was correct under the setting it was made with.
  hashes.add(hashTerm(defaultClipText(item, languageCode, { kanjiTts: !kanjiTts })));

  for (const variant of cardAudioVariants(item, languageCode))
    hashes.add(hashTerm(variant.ttsText));

  if (typeof item.ttsKanji === "string" && item.ttsKanji.length > 0) {
    hashes.add(hashTerm(normalizeTtsText(item.ttsKanji, languageCode)));
  }
  return hashes;
}

/**
 * Does this card's clip still speak this card's text?
 *
 *   `none`          the card ships no audio — nothing to say.
 *   `current`       the recorded hash is one the card's text produces (or a human accepted it).
 *   `unverifiable`  no hash could be read off the take, or the take is a kanji one whose source text
 *                   is not on the card. Reported, never blocking, never guessed at.
 *   `stale`         a hash was recorded, it is recomputable, and it does not match. The card is
 *                   shipping a clip of words it no longer has.
 */
export function audioTextState(item, languageCode, { kanjiTts = false } = {}) {
  if (!item || !item.audio) return { state: "none" };

  const stored = typeof item.audioTextHash === "string" ? item.audioTextHash : null;
  if (!stored) return { state: "unverifiable", reason: "no text hash recorded for this clip" };

  if (expectedAudioTextHashes(item, languageCode, { kanjiTts }).has(stored)) {
    return {
      state: "current",
      ...(item.audioTextHashAcceptedBy ? { acceptedBy: item.audioTextHashAcceptedBy } : {}),
    };
  }

  // A kanji take's text came from a model and is not on the card, so "does not match" is not a
  // conclusion this can draw — only "cannot tell".
  const shape = deriveAudioTextHash(item)?.shape ?? null;
  if (shape === "genkanji" && !item.ttsKanji) {
    return { state: "unverifiable", reason: "kanji orthography behind this clip was not recorded" };
  }

  return { state: "stale" };
}

/** The hash to stamp when a human accepts a clip for the card's text as it stands now. */
export function currentAudioTextHash(item, languageCode, { kanjiTts = false } = {}) {
  return hashTerm(defaultClipText(item, languageCode, { kanjiTts }));
}

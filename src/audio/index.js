import { createHash } from "crypto";
import { join, resolve } from "path";
import { promises as fs } from "fs";
import { writeFileAtomicAsync } from "../util/atomicWrite.js";
import { libraryHome } from "../model/index.js";
import { resolveIso639Code } from "../model/iso639.js";
import { normalizeTtsText } from "./ttsText.js";
import { TTS_MODEL } from "./ttsModel.js";
import { autoTrim } from "./trimSilence.js";
import { withEndMarker, usesEndMarker } from "./ttsMarker.js";

export function hashTerm(term) {
  return createHash("sha256").update(term).digest("hex").slice(0, 16);
}

/**
 * Every audio field a card can carry. Listed once so "clear this card's audio" can never drift out of
 * step with the schema by forgetting one — an orphaned `audioManual` would keep pointing `audio` at a
 * clip of text the card no longer has.
 */
export const AUDIO_FIELDS = [
  "audio",
  "audioOriginal",
  "audioAuto",
  "audioManual",
  "audioTrim",
  "audioFilter",
  "audioMarked",
  "audioMarkerStuck",
];

/**
 * The clip a card actually ships, given its stored takes: a hand-cut range wins over the automatic
 * trim, which wins over the untouched original.
 *
 * `audio` stays the single field the deck build, the `.apkg` rebuild and AnkiConnect delivery read —
 * they never learn about the others. This is the one place that decides what it points at, so a
 * reviewer's manual cut and a fallback to the original follow the same rule everywhere.
 */
export function deriveCardAudio(item) {
  return item.audioManual || item.audioAuto || item.audioOriginal || undefined;
}

// The text actually handed to TTS (and used as the audio cache key) for a card:
// the card's `reading` when it's a non-empty string, otherwise its `target`. This
// is what lets a Japanese deck show kanji on the face (`target`) while speaking an
// unambiguous kana `reading` — for languages whose target is already phonetic, no
// `reading` is set and `target` is spoken exactly as before.
export function speechText(item) {
  return typeof item.reading === "string" && item.reading.length > 0 ? item.reading : item.target;
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// Fetches every term in `terms` into `audioDir`, keyed by its `hashTerm` filename, skipping any
// already cached. Returns a Map of term -> `{ audio, original }`, where `audio` is the auto-trimmed
// clip that ships and `original` the untouched take beside it (null when the entry predates
// originals). Shared by the default and alt passes so both reuse the exact same hash/cache/fetch
// behaviour.
//
// `<hash>.mp3` keeps its long-standing meaning — the trimmed clip the deck embeds — so every existing
// cache entry, and `isDefaultClipFilename`'s staleness rule, are untouched. The raw take is a new
// `<hash>.orig.mp3` sibling, which makes its ABSENCE mean exactly one thing: that entry was written
// before originals were kept. Nothing already on disk is silently reinterpreted.
// How many uncached terms fetch at once. A 50-card lesson used to be 50 strictly sequential round
// trips; a small pool cuts the wall time severalfold without hammering the API. Cache writes are
// per-file atomic, and terms are distinct, so concurrent workers never touch the same files.
const CONCURRENT_TTS_FETCHES = 4;

async function fetchTermsToCache(
  terms,
  audioDir,
  { fetchTts, voiceId, apiKey, languageCode, trim, marker = false },
) {
  const fetched = new Map();
  const queue = [...terms];
  let failure = null;

  const worker = async () => {
    while (queue.length > 0 && !failure) {
      const term = queue.shift();
      try {
        const base = hashTerm(term);
        const filename = `${base}.mp3`;
        const original = `${base}.orig.mp3`;
        const filepath = resolve(join(audioDir, filename));
        const origPath = resolve(join(audioDir, original));

        if (await fileExists(filepath)) {
          // Cached. A pre-originals entry has no sibling — report it absent rather than refetching,
          // which would spend credits re-rolling a take (ElevenLabs is non-deterministic) purely to
          // recover an original we had already chosen to discard.
          fetched.set(term, {
            audio: filename,
            original: (await fileExists(origPath)) ? original : null,
          });
          continue;
        }

        const raw = await fetchTts(term, voiceId, apiKey, languageCode);
        const { auto, markerStuck } = await autoTrim(raw, { trim, marker });
        // Original FIRST. Crashing between the two writes must leave the SHIPPING clip missing (so
        // the next run refetches and self-heals), never an orphaned shipping clip whose absent
        // sibling would permanently read as "this entry predates originals".
        await writeFileAtomicAsync(origPath, raw);
        await writeFileAtomicAsync(filepath, auto);
        fetched.set(term, { audio: filename, original, markerStuck });
      } catch (error) {
        // First failure wins; the flag stops every worker pulling new terms, and what already
        // landed in the cache stays valid for the retry run.
        failure ??= error;
      }
    }
  };

  // `terms` may be any iterable (a Set in practice) — size the pool off the materialized queue.
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_TTS_FETCHES, queue.length) }, worker));
  if (failure) throw failure;
  return fetched;
}

/**
 * The exact text of a card's DEFAULT clip, and the filename that text hashes to.
 *
 * Exported so the audio stage's "already generated?" check can ask whether a card's stored clip still
 * matches its CURRENT text, rather than only whether some file exists. Clip names are content
 * addressed, so editing a `reading` after audio has run leaves the card pointing at a stale clip that
 * is still on disk — which read as "already generated — reusing" and silently kept the old audio.
 */
export function defaultClipText(item, languageCode) {
  const text = normalizeTtsText(speechText(item), languageCode);
  // The throwaway end marker is part of the text SENT, so it is part of the cache key too — a clip
  // generated with it is a different recording from one generated without, and must not be reused
  // across the change.
  return withEndMarker(text, languageCode);
}

/**
 * Does this filename look like a clip the audio STAGE generated — a bare content hash?
 *
 * Everything else a card can point at is a deliberate human choice and must never be regenerated over:
 * a `-gen-` / `-genkanji-` variant auditioned and picked in the dashboard, or a Replace upload under
 * its own name. Only a plain default take is ever a candidate for being stale.
 */
export function isDefaultClipFilename(filename) {
  return typeof filename === "string" && /^[0-9a-f]{16}\.mp3$/.test(filename);
}

/**
 * Does this filename look like the audio stage's untouched ORIGINAL — `<hash(text)>.orig.mp3`?
 *
 * Provenance now lives on the original, not on the shipping clip. `audio` is a derived artifact whose
 * name encodes the processing applied (`<hash>.standard.mp3`, `<cardId>-manual-<...>.mp3`), so asking
 * "did the stage make this?" of `audio` stopped working the moment cleanup renamed everything.
 */
export function isStageOriginalFilename(filename) {
  return typeof filename === "string" && /^[0-9a-f]{16}\.orig\.mp3$/.test(filename);
}

export function defaultOriginalFilename(item, languageCode) {
  return `${hashTerm(defaultClipText(item, languageCode))}.orig.mp3`;
}

/**
 * Does this filename name a take a GENERATION path produced (the audio stage's content-addressed
 * clips, or a dashboard Generate / Generate (kanji) preview)? Those are the takes that carried the
 * TTS end marker when the language uses one — which is how the server derives a card's
 * `audioMarked` from provenance instead of trusting the client to report it.
 */
export function isGeneratedTakeFilename(filename) {
  return (
    typeof filename === "string" &&
    (isDefaultClipFilename(filename) ||
      isStageOriginalFilename(filename) ||
      /-gen(kanji)?-[0-9a-f]{8}\.(orig\.)?mp3$/.test(filename))
  );
}

/**
 * Is this card's audio the audio stage's to regenerate?
 *
 * No if a human chose it: a `-gen-` variant they auditioned and picked, a Replace upload, or a hand
 * trim they placed. Those are deliberate work and regenerating over them would silently discard it.
 * Judged on the ORIGINAL's name plus the absence of a manual cut — see `isStageOriginalFilename` for
 * why the shipping clip's name can no longer answer this.
 */
export function isStageOwnedCard(item) {
  if (!item || item.audioManual) return false;
  if (item.audioOriginal) return isStageOriginalFilename(item.audioOriginal);
  return !item.audio || isDefaultClipFilename(item.audio);
}

export function defaultClipFilename(item, languageCode) {
  return `${hashTerm(defaultClipText(item, languageCode))}.mp3`;
}

export async function generateAudio(
  cards,
  { voiceId, fetchTts = null, libraryHomeDir = null, model = TTS_MODEL, trim = undefined } = {},
) {
  if (!voiceId) {
    throw new Error("voiceId is required");
  }

  if (!fetchTts) {
    throw new Error("fetchTts function is required");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const basePath = libraryHomeDir || libraryHome();
  // Segment the cache by model so an eleven_v3 clip never collides with an eleven_multilingual_v2
  // clip of the same text (same hash, different model dir). See ttsModel.js.
  const audioDir = resolve(join(basePath, "audio", voiceId, model));

  await ensureDir(audioDir);

  // Only a real ISO 639-1 code (e.g. "ja") is passed through to fetchTts — a full
  // language name (e.g. "Japanese") or an unrecognized value resolves to null, and
  // ElevenLabs falls back to auto-detecting the language from the text itself, same as
  // it always has. Resolved once per call, not per term, since it's the same corpus-wide
  // targetLanguage for every item.
  const languageCode = resolveIso639Code(cards.meta?.targetLanguage);
  const fetchCtx = {
    fetchTts,
    voiceId,
    apiKey,
    languageCode,
    trim,
    marker: usesEndMarker(languageCode),
  };

  // The DEFAULT (and only up-front) take. Comma/bracket forms and kana+kanji are generated ON DEMAND
  // in the dashboard, not here. Japanese text gets the end marker appended (./ttsMarker.js), which the
  // trim cuts back off; the displayed target/reading never carries it.
  const defaultTextFor = (item) => defaultClipText(item, languageCode);

  // Excluded cards are dropped from the deck at build time (src/deck/index.js), so don't spend TTS on
  // them here — and clear any `audio` they carry so the review shows no player and nothing lingers.
  // The flag is reversible: un-excluding a card and re-running `audio` regenerates its clip.
  //
  // Hand-picked cards (a `-gen-` variant the reviewer auditioned, a Replace upload, a manual trim
  // with its shipping clip) are not this stage's to touch AT ALL: no fetch (the take would only be
  // discarded), no annotation. This makes a full re-run of `audio` safe by construction — the
  // CLI's write-back guard is the belt, this is the braces. Same rule as that guard: a card with
  // NO shipping clip is regenerated whatever stale fields it carries.
  const handPicked = (item) => item.audio && !isStageOwnedCard(item);
  const uniqueTerms = new Set();
  for (const item of cards.items) {
    if (item.excluded || handPicked(item)) continue;
    uniqueTerms.add(defaultTextFor(item));
  }
  const fetchedFiles = await fetchTermsToCache(uniqueTerms, audioDir, fetchCtx);

  const annotatedCards = {
    ...cards,
    items: cards.items.map((item) => {
      if (item.excluded) {
        const rest = { ...item };
        for (const field of AUDIO_FIELDS) delete rest[field];
        return rest;
      }
      if (handPicked(item)) {
        return item;
      }
      const clip = fetchedFiles.get(defaultTextFor(item));
      const next = { ...item, audio: clip.audio, audioAuto: clip.audio };
      // Recorded so anything that later re-derives this card's takes from its original — a cleanup
      // switch, a re-trim — knows the original still has the marker on the end and strips it too.
      if (usesEndMarker(languageCode)) next.audioMarked = true;
      else delete next.audioMarked;
      // The trim could not find/cut the end marker, so it survives into the shipping clip — a
      // failure only ears would otherwise catch. Badged in the audio review; cleared whenever the
      // reviewer installs different audio (all setters spread the full AUDIO_FIELDS).
      if (clip.markerStuck) next.audioMarkerStuck = true;
      else delete next.audioMarkerStuck;
      if (clip.original) next.audioOriginal = clip.original;
      else delete next.audioOriginal;
      // A regenerated card is speaking NEW text, so any hand-cut range the reviewer applied describes
      // a clip that no longer exists. Carrying it forward would point `audio` at a stale `-manual-`
      // file — the old words, kept because a start/end pair happened to survive the regeneration.
      delete next.audioManual;
      delete next.audioTrim;
      return next;
    }),
  };

  return annotatedCards;
}

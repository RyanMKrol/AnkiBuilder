// The `audio` command: generate each reviewed card's default TTS clip and copy it
// (plus the untrimmed original) into the run's audio/ directory.
// Moved verbatim from src/cli/index.js when the CLI was split per command.
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { withClaim } from "../runClaim.js";
import { resolveIso639Code } from "../../model/iso639.js";
import {
  defaultClipFilename,
  defaultOriginalFilename,
  isStageOwnedCard,
  AUDIO_FIELDS,
} from "../../audio/index.js";
import { TTS_MODEL } from "../../audio/ttsModel.js";
import { findUnreadableNumbers, describeUnreadableNumbers } from "../../cards/spokenNumbers.js";
import { readJson, writeJson } from "./shared.js";

export async function runAudio(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "audio" }, () => runAudioInner(flags, ctx));
}

async function runAudioInner(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (!existsSync(paths.cards)) {
    throw new Error(`cards.json not found at ${paths.cards} — run "translate" first`);
  }

  const cards = readJson(paths.cards);

  if (cards.meta.reviewed !== true) {
    throw new Error(
      `cards.json at ${paths.cards} has not been reviewed yet — open the dashboard ("npm run serve"), review this lesson's corpus (English + target + pronunciation), and click "Mark reviewed" before generating audio`,
    );
  }

  // Backstop. The review gate is where this is normally caught — early, with the cards on screen and
  // the fields inline-editable. But that gate exempts an already-reviewed lesson (so tightening a rule
  // never retroactively unreviews finished work), which leaves any lesson signed off BEFORE the check
  // existed unprotected. This is the line that covers it. Placed before the voice lookup, so it costs
  // nothing and fires before a single credit is spent.
  const unreadable = findUnreadableNumbers(
    cards.items,
    resolveIso639Code(cards.meta.targetLanguage),
  );
  if (unreadable.length > 0) {
    throw new Error(
      `${unreadable.length} card(s) would send a raw numeral to the TTS voice, which reads digits ` +
        `unpredictably. Give each one a "ttsText" with the number spelled out in the target script ` +
        `(e.g. 2025ねんに -> にせんにじゅうごねんに), then re-run:\n` +
        describeUnreadableNumbers(unreadable),
    );
  }

  // Only the DEFAULT (kana+。 for Japanese) clip is generated up front — every other variant is an
  // on-demand dashboard action. A run counts as "already done" once every card's default clip is on
  // disk (regeneration stays cheap: generateAudio only fetches cache misses).
  // Excluded cards get no audio (generateAudio skips them), so only the ACTIVE cards gate "done".
  // "Already done" means every active card's clip is on disk AND still matches the card's CURRENT
  // text. Clip names are a hash of the spoken text, so checking only that the file exists let an edited
  // `ttsText` keep its old clip forever: the stale file was still there, so the stage reported
  // "already generated — reusing" and never refetched. Comparing the name makes a text edit
  // self-healing — re-run `audio` and only the changed cards are refetched.
  const audioLanguageCode = resolveIso639Code(cards.meta.targetLanguage);
  // Only a clip this stage generated can be stale. A `-gen-` variant the reviewer auditioned and
  // picked, or a Replace upload, is a deliberate choice — regenerating over it would silently throw
  // away their work, which is a far worse bug than the one this check exists to fix.
  // A clip is "current" if this stage doesn't own it (a human chose it) or if it was generated from
  // the card's CURRENT text. Compared on the original's name rather than the shipping clip's, because
  // the shipping name also encodes the cleanup applied and so changes without the text changing.
  // The per-unit kanji-TTS opt-in changes what the default clip's text IS, so it changes what that
  // clip's name hashes to. Reading it here is what stops flipping the flag from reporting every card
  // in the unit as stale (and, worse, regenerating them).
  const kanjiTts = cards.meta?.kanjiTts === true;
  const clipIsCurrent = (item) =>
    !isStageOwnedCard(item) ||
    (item.audioOriginal
      ? item.audioOriginal === defaultOriginalFilename(item, audioLanguageCode, { kanjiTts })
      : item.audio === defaultClipFilename(item, audioLanguageCode, { kanjiTts }));
  const active = cards.items.filter((item) => !item.excluded);
  const stale = active.filter((item) => item.audio && !clipIsCurrent(item));
  const alreadyDone =
    active.length > 0 &&
    active.every(
      (item) => item.audio && existsSync(join(paths.audio, item.audio)) && clipIsCurrent(item),
    );

  if (stale.length > 0) {
    ctx.log(
      `audio: ${stale.length} card(s) have a clip that no longer matches their text — regenerating those`,
    );
  }

  if (alreadyDone) {
    ctx.log(`audio already generated in ${paths.audio} — reusing`);
    return;
  }

  let voiceId = flags.voice;
  if (!voiceId) {
    const languageCode = resolveIso639Code(cards.meta.targetLanguage);
    voiceId = languageCode ? ctx.getDefaultVoice(languageCode) : undefined;
    if (voiceId) {
      ctx.log(
        `no --voice given — using the configured default for ${cards.meta.targetLanguage}: ${voiceId}`,
      );
    } else {
      throw new Error("--voice <voiceId> is required for the audio stage");
    }
  }

  const annotated = await ctx.generateAudio(cards, {
    voiceId,
    fetchTts: ctx.fetchTts,
    libraryHomeDir: ctx.libraryHome(),
  });

  mkdirSync(paths.audio, { recursive: true });
  // Must match generateAudio's model-segmented cache path (audio/<voiceId>/<model>/).
  const cacheDir = join(ctx.libraryHome(), "audio", voiceId, TTS_MODEL);
  // Copy each card's default clip from the cache into the run's audio/ dir; the deck build reads
  // files from there. The untouched original comes too — the dashboard's trim editor re-cuts from it,
  // and it's what the review shows beside the trimmed take. Other variants are generated on demand in
  // the dashboard, not copied here.
  for (const item of annotated.items) {
    for (const name of [item.audio, item.audioOriginal]) {
      if (!name) continue;
      const dest = join(paths.audio, name);
      if (existsSync(dest)) continue;
      // A hand-picked card comes back from generateAudio untouched; its clips live in the run's
      // audio/ dir already (a Replace upload, a picked variant), never in the cache — only copy
      // what the cache actually holds.
      const src = join(cacheDir, name);
      if (existsSync(src)) {
        copyFileSync(src, dest);
      }
    }
  }

  // Merge, don't overwrite. `cards` was read minutes ago, before the ElevenLabs pass; the
  // dashboard is editable during exactly that window (a lesson at the translate stage), so
  // writing the stale in-memory object back would silently discard any exclude, inline edit
  // or Replace-audio the reviewer did while this ran. Re-read and apply only what this stage
  // owns: each item's `audio` filename.
  //
  // DELETE rather than null out. generateAudio removes `audio` from an excluded card, and writing
  // `audio: null` back in its place produced a file the cards schema rejects (`audio` must be a
  // string) — which then failed validation on the NEXT write, blocking Mark done, exclude and every
  // inline edit on that lesson. "Has no audio" is an absent key, the same shape generateAudio emits.
  const fresh = readJson(paths.cards);
  const generated = new Map(annotated.items.map((item) => [item.id, item]));
  for (const item of fresh.items) {
    const next = generated.get(item.id);
    if (!next) continue;
    // An excluded card ships nothing, whatever its clip's provenance — drop the lot.
    if (item.excluded) {
      for (const field of AUDIO_FIELDS) delete item[field];
      continue;
    }
    // Only overwrite a clip THIS stage owns. A `-gen-` variant the reviewer auditioned and picked, a
    // Replace upload, or a `-manual-` hand cut is a deliberate choice; regenerating over it would
    // silently throw their work away — the same rule `clipIsCurrent` applies on the read side, which
    // until now was enforced when DECIDING to run but not when writing the results back.
    if (item.audio && !isStageOwnedCard(item)) continue;
    for (const field of AUDIO_FIELDS) {
      const value = next[field];
      if (value == null || value === "") delete item[field];
      else item[field] = value;
    }
  }
  writeJson(paths.cards, fresh);
  // Report what was VOICED, not how many items the file holds. Those differ by every excluded card,
  // and the stage skips those on purpose so no TTS credit is spent on a card that will never ship.
  // Printing the file's length made a complete run look like it had missed five cards, and would
  // equally have hidden a run that really did miss some.
  const voiced = fresh.items.filter((item) => item.audio).length;
  const skipped = fresh.items.length - voiced;
  ctx.log(
    `voiced ${voiced} of ${fresh.items.length} item(s) into ${paths.audio}` +
      (skipped > 0 ? ` (${skipped} skipped: excluded, or no spoken text)` : ""),
  );
}

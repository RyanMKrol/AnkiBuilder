import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { INCOMPLETE, readCardsJson, readCorpusJson, renderCardForStage } from "./runDir.js";
import { claimLiveness, readClaim } from "../../cli/runClaim.js";
import { lessonReadiness } from "../../cards/readiness.js";

// A lesson has exactly TWO stages, and both are human review gates:
//
//   `corpus` — the combined first review: English + target + pronunciation, signed off with "Mark
//              reviewed" (the gate the `audio` CLI stage checks). Any unit that has NOT passed it is
//              here, including one that already has clips — see loadStageData.
//   `audio`  — passed gate 1 AND at least one card has a clip. The second review, "Mark done".
//
// A run dir carrying corpus.json but NO cards.json is `INCOMPLETE`: its build stopped partway through
// `prepare` (translate → drill enrichment → de-dup → notes), all of which change what a reviewer would
// be signing off. That is a half-built lesson, not a stage — it is deliberately NOT in STAGE_ORDER, it
// is never offered for review, and the dashboard files it under "Not finished" with the command that
// completes it. Re-running `assemble` (which chains into `prepare`) is what clears it.

export { INCOMPLETE };
export const STAGE_ORDER = ["corpus", "audio"];
// INCOMPLETE ranks below every real stage, so a deck containing one reports as the least-advanced
// thing it holds rather than claiming the review it hasn't reached.
export const stageRank = (stage) => (stage === INCOMPLETE ? -1 : STAGE_ORDER.indexOf(stage));

// Loads a run dir's stage + items in one pass: `{ stage, meta, items, sourceFile }`, or null when the
// dir isn't a run at all (no corpus.json and no cards.json). cards.json presence decides
// corpus-vs-audio; corpus.json alone is INCOMPLETE. `sourceFile` tells the write-back layer which
// json to mutate. Robust to a run that has cards.json but never wrote corpus.json (test fixtures).
export function loadStageData(runDir) {
  const cards = readCardsJson(runDir);
  if (cards) {
    const anyAudio = cards.items.some((i) => typeof i.audio === "string" && i.audio.length > 0);
    // Audio alone does NOT put a unit at gate 2 — it has to have passed gate 1 as well. The two used
    // to be treated as the same fact, because the audio CLI stage refuses an unreviewed unit, so
    // clips could only exist after a sign-off. `Unreview` breaks that: a unit that already has audio
    // goes back to reviewed:false, the stage stayed "audio", and the reviewer was parked at gate 2
    // forever — where Mark done correctly refuses ("has not passed the corpus review") and the page
    // offers no way to do the corpus review. A dead end reachable from the dashboard's own button.
    const reviewed = (cards.meta || {}).reviewed === true;
    return {
      stage: anyAudio && reviewed ? "audio" : "corpus",
      meta: cards.meta || {},
      items: cards.items,
      sourceFile: "cards.json",
    };
  }
  const corpus = readCorpusJson(runDir);
  if (corpus) {
    return {
      stage: INCOMPLETE,
      meta: corpus.meta || {},
      items: corpus.items,
      sourceFile: "corpus.json",
    };
  }
  return null;
}

// A run dir's pipeline stage, or null if it isn't a run.
export function detectStage(runDir) {
  return loadStageData(runDir)?.stage ?? null;
}

// The least-advanced stage across a deck's units (its overall "how far along" badge), or null when the
// deck has no units yet.
export function deckStage(units) {
  if (!units.length) return null;
  return units.reduce(
    (min, u) => (stageRank(u.stage) < stageRank(min) ? u.stage : min),
    units[0].stage,
  );
}

// Scans a book/course dir for its numbered unit folders (`<prefix>-<seq>`), detects each unit's stage,
// and returns the units ordered by `meta.chapterNumber` (tie-break: folder seq). Dirs that aren't runs
// (no corpus.json/cards.json) are skipped. Each unit carries `seq` (its folder index — the stable media
// key), a display `number`/`label`, its `stage`, and stage-appropriate render `cards`.
/**
 * "is a CLI stage running on this unit right now?" — read straight off the unit's claim.json,
 * which the stages write and clear. A claim whose process is gone reads as `stale`: the lesson
 * goes back to being editable and the UI says the build was interrupted, so a crash can never
 * leave a lesson permanently read-only.
 */
export function unitBuildState(runDir) {
  const claim = readClaim(runDir);
  if (!claim) return { claim: null, building: false, interrupted: false };
  const liveness = claimLiveness(claim);
  return { claim, building: liveness !== "stale", interrupted: liveness === "stale" };
}

/**
 * The stage-derived decoration EVERY adapter's units share: stage, review/done flags, readiness,
 * live build state, and stage-appropriate render cards. Extracted because the template adapter
 * once built its single unit by hand and missed the build-state fields — so a template being
 * built rendered edit controls that bounced off 409s, and an interrupted template build could
 * never be cleared from the UI.
 */
export function decorateUnit(runDir, data, { includeCards = true } = {}) {
  const meta = data.meta || {};
  const build = unitBuildState(runDir);
  return {
    stage: data.stage,
    reviewed: !!meta.reviewed,
    done: !!meta.done,
    // The per-unit kanji-TTS opt-in. It decides what a card's DEFAULT clip text is, so the review
    // needs it to say whether a clip still matches its card (src/audio/textHash.js) and to label
    // which orthography this unit is voiced in.
    kanjiTts: meta.kanjiTts === true,
    // Whether the pre-review passes have all run. Surfaced per unit so the home page can keep an
    // unfinished lesson out of "In review" and the review view can say what's still to run.
    ...lessonReadiness(meta, data.items),
    building: build.building,
    interrupted: build.interrupted,
    claim: build.claim,
    // The home page and listDecks only need per-unit STATE; materializing a render card for every
    // item of every lesson just to show a status row was most of the home page's IO.
    ...(includeCards ? { cards: data.items.map(renderCardForStage(data.stage)) } : { cards: [] }),
  };
}

export function scanNumberedUnits(deckDir, prefix, { includeCards = true } = {}) {
  if (!existsSync(deckDir)) return [];
  const label = `${prefix[0].toUpperCase()}${prefix.slice(1)}`;
  const units = [];
  for (const entry of readdirSync(deckDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(new RegExp(`^${prefix}-(\\d+)(-extras)?$`));
    if (!m) continue;
    const extras = Boolean(m[2]);
    // `seq` is the unit's key everywhere — the review URL, the media URL, the write-back's target
    // dir — so an extras unit needs one distinct from its base lesson's. It is the folder suffix
    // verbatim ("5-extras"), which keeps `unitDir` a straight `${prefix}-${seq}` join.
    const seq = extras ? `${m[1]}-extras` : Number(m[1]);
    const runDir = join(deckDir, entry.name);
    const data = loadStageData(runDir);
    if (!data) continue;
    const meta = data.meta || {};
    const number = typeof meta.chapterNumber === "number" ? meta.chapterNumber : Number(m[1]);
    units.push({
      seq,
      extras,
      number,
      label: meta.chapterLabel || `${label} ${number}`,
      ...decorateUnit(runDir, data, { includeCards }),
    });
  }
  // Same order the package uses: by chapter number, then a lesson before its own extras. `seq` is a
  // string for extras units, so the folder index is compared numerically via `number` first and the
  // extras flag breaks the tie — never `a.seq - b.seq`, which would be NaN.
  units.sort(
    (a, b) =>
      a.number - b.number ||
      Number(a.extras) - Number(b.extras) ||
      String(a.seq).localeCompare(String(b.seq)),
  );
  return units;
}

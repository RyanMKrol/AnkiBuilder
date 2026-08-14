import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Shared helpers for the build-folder deck adapters: reading a run directory's corpus.json/cards.json
// and mapping their items into stage-appropriate render shapes for the dashboard. (Stage detection and
// the numbered-unit scan live in ./stage.js, which builds on these low-level readers.)

// The non-stage a run dir sits in when its build stopped before cards.json — see ./stage.js, which
// re-exports this. It lives here, the lower-level module, so the render-shape mapper below can name it
// without importing its own importer.
export const INCOMPLETE = "incomplete";

function readJsonItems(runDir, file) {
  const path = join(runDir, file);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (!data || !Array.isArray(data.items)) {
      console.error(`[dashboard] ${path} has no items array — unit hidden until it is fixed`);
      return null;
    }
    return data;
  } catch (e) {
    // Never silent: a null here makes the unit VANISH from the dashboard, and for a torn or
    // corrupt file "my lesson disappeared" with no trace is far worse than a log line.
    console.error(`[dashboard] skipping unreadable ${path}: ${e.message}`);
    return null;
  }
}

export function readCardsJson(runDir) {
  return readJsonItems(runDir, "cards.json");
}

export function readCorpusJson(runDir) {
  return readJsonItems(runDir, "corpus.json");
}

// An audio-stage cards.json item -> the render-card shape used by deckViewChrome. The deck embeds the
// chosen take in `audio`; the legacy `altAudio` field is dropped (nothing writes it any more).
export function toRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    pronunciation: item.pronunciation || "",
    category: item.category || "",
    hint: item.hint || "",
    scene: item.scene || "",
    note: item.note || item.cardNote || "",
    reviewNote: item.reviewNote || "",
    audio: item.audio || null,
    // The untouched take, and the hand cut applied to it. The review shows the original beside the
    // shipping clip and pre-fills the trim editor's handles from the saved range.
    audioOriginal: item.audioOriginal || null,
    audioManual: item.audioManual || null,
    audioTrim: item.audioTrim || null,
    audioFilter: item.audioFilter || null,
    excluded: !!item.excluded,
    // Who excluded it. "" means a human decision or a file written before provenance
    // existed; a script name means a sweep, which is the case a reviewer should re-check.
    excludedBy: item.excludedBy || "",
    excludedReason: item.excludedReason || "",
    uncertain: !!item.uncertain,
    aiSuggested: !!item.aiSuggested,
  };
}

// A corpus.json item -> render shape for an INCOMPLETE lesson's read-only listing (no pronunciation
// or audio yet; carries the review flags so the page can badge them).
export function toIncompleteRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    ttsText: item.ttsText || "",
    category: item.category || "",
    hint: item.hint || "",
    scene: item.scene || "",
    note: item.note || item.cardNote || "",
    reviewNote: item.reviewNote || "",
    uncertain: !!item.uncertain,
    aiSuggested: !!item.aiSuggested,
    excluded: !!item.excluded,
    // Who excluded it. "" means a human decision or a file written before provenance
    // existed; a script name means a sweep, which is the case a reviewer should re-check.
    excludedBy: item.excludedBy || "",
    excludedReason: item.excludedReason || "",
  };
}

// A post-translate cards.json item (pre-audio) -> render shape for the Corpus review.
export function toCorpusRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    pronunciation: item.pronunciation || "",
    ttsText: item.ttsText || "",
    category: item.category || "",
    hint: item.hint || "",
    scene: item.scene || "",
    note: item.note || item.cardNote || "",
    reviewNote: item.reviewNote || "",
    excluded: !!item.excluded,
    // Who excluded it. "" means a human decision or a file written before provenance
    // existed; a script name means a sweep, which is the case a reviewer should re-check.
    excludedBy: item.excludedBy || "",
    excludedReason: item.excludedReason || "",
    uncertain: !!item.uncertain,
    aiSuggested: !!item.aiSuggested,
  };
}

// The item -> render-card mapper for a given stage (or the INCOMPLETE non-stage).
export function renderCardForStage(stage) {
  if (stage === INCOMPLETE) return toIncompleteRenderCard;
  if (stage === "corpus") return toCorpusRenderCard;
  return toRenderCard;
}

// A media filename is only ever a flat file in a run dir's audio/ folder — reject anything with path
// separators or traversal before it's ever joined to a path.
export function isSafeMediaFile(file) {
  return (
    typeof file === "string" && /^[A-Za-z0-9._-]+$/.test(file) && file !== "." && file !== ".."
  );
}

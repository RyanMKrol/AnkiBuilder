import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Shared helpers for the build-folder deck adapters: reading a run directory's corpus.json/cards.json
// and mapping their items into stage-appropriate render shapes for the dashboard. (Stage detection and
// the numbered-unit scan live in ./stage.js, which builds on these low-level readers.)

function readJsonItems(runDir, file) {
  const path = join(runDir, file);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data && Array.isArray(data.items) ? data : null;
  } catch {
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
// chosen take in `audio`; `altAudio` is a review-only concept and is dropped (the dashboard shows one).
export function toRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    pronunciation: item.pronunciation || "",
    category: item.category || "",
    note: item.notes || "",
    audio: item.audio || null,
    excluded: !!item.excluded,
    uncertain: !!item.uncertain,
    aiSuggested: !!item.aiSuggested,
  };
}

// A corpus.json item -> render shape for the corpus review (no pronunciation/audio yet; carries the
// review flags so the page can badge them).
export function toCorpusRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    reading: item.reading || "",
    category: item.category || "",
    note: item.notes || "",
    uncertain: !!item.uncertain,
    aiSuggested: !!item.aiSuggested,
    excluded: !!item.excluded,
  };
}

// A post-translate cards.json item (pre-audio) -> render shape for the translate review.
export function toTranslateRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    pronunciation: item.pronunciation || "",
    reading: item.reading || "",
    category: item.category || "",
    note: item.notes || "",
    excluded: !!item.excluded,
    uncertain: !!item.uncertain,
    aiSuggested: !!item.aiSuggested,
  };
}

// The item -> render-card mapper for a given pipeline stage.
export function renderCardForStage(stage) {
  if (stage === "corpus") return toCorpusRenderCard;
  if (stage === "translate") return toTranslateRenderCard;
  return toRenderCard;
}

// A media filename is only ever a flat file in a run dir's audio/ folder — reject anything with path
// separators or traversal before it's ever joined to a path.
export function isSafeMediaFile(file) {
  return (
    typeof file === "string" && /^[A-Za-z0-9._-]+$/.test(file) && file !== "." && file !== ".."
  );
}

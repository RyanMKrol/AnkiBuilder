import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { readCardsJson, readCorpusJson, renderCardForStage } from "./runDir.js";

// A run directory advances through three pipeline stages, detected purely from which json files it
// carries: `corpus` (assemble → corpus.json only), `translate` (translate → cards.json, no audio yet),
// `audio` (audio stage → at least one card has an audio clip). The dashboard surfaces a run at
// whatever stage it's in and renders the stage-appropriate review; the CLI still advances it.

export const STAGE_ORDER = ["corpus", "translate", "audio"];
export const stageRank = (stage) => STAGE_ORDER.indexOf(stage);

// Loads a run dir's stage + items in one pass: `{ stage, meta, items, sourceFile }`, or null when the
// dir isn't a run at all (no corpus.json and no cards.json). cards.json presence decides
// translate-vs-audio; corpus.json alone is `corpus`. `sourceFile` tells the write-back layer which
// json to mutate. Robust to a run that has cards.json but never wrote corpus.json (test fixtures).
export function loadStageData(runDir) {
  const cards = readCardsJson(runDir);
  if (cards) {
    const anyAudio = cards.items.some((i) => typeof i.audio === "string" && i.audio.length > 0);
    return {
      stage: anyAudio ? "audio" : "translate",
      meta: cards.meta || {},
      items: cards.items,
      sourceFile: "cards.json",
    };
  }
  const corpus = readCorpusJson(runDir);
  if (corpus) {
    return {
      stage: "corpus",
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
export function scanNumberedUnits(deckDir, prefix) {
  if (!existsSync(deckDir)) return [];
  const label = `${prefix[0].toUpperCase()}${prefix.slice(1)}`;
  const units = [];
  for (const entry of readdirSync(deckDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!m) continue;
    const seq = Number(m[1]);
    const data = loadStageData(join(deckDir, entry.name));
    if (!data) continue;
    const meta = data.meta || {};
    const number = typeof meta.chapterNumber === "number" ? meta.chapterNumber : seq;
    units.push({
      seq,
      number,
      label: meta.chapterLabel || `${label} ${number}`,
      stage: data.stage,
      reviewed: !!meta.reviewed,
      done: !!meta.done,
      cards: data.items.map(renderCardForStage(data.stage)),
    });
  }
  units.sort((a, b) => a.number - b.number || a.seq - b.seq);
  return units;
}

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

// Shared helpers for the build-folder deck adapters: reading a run directory's cards.json and
// mapping its items into the deck-view render shape, plus scanning a book/course dir's numbered unit
// folders (chapter-N / lesson-N) in pedagogical order.

export function readCardsJson(runDir) {
  const path = join(runDir, "cards.json");
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data && Array.isArray(data.items) ? data : null;
  } catch {
    return null;
  }
}

// A cards.json item -> the render-card shape used by deckViewChrome. The deck embeds the chosen take
// in `audio`; `altAudio` is a review-only concept and is dropped (the dashboard shows one take).
export function toRenderCard(item) {
  return {
    id: item.id,
    english: item.english || "",
    target: item.target || "",
    pronunciation: item.pronunciation || "",
    category: item.category || "",
    note: item.notes || "",
    audio: item.audio || null,
  };
}

// Scans a book/course dir for its numbered unit folders (`<prefix>-<seq>`), reads each cards.json, and
// returns the built units ordered by `meta.chapterNumber` (tie-break: folder seq). Unbuilt units (no
// cards.json) are skipped. Each unit carries `seq` (its folder index — the stable media key) and a
// display `number`/`label`.
export function scanNumberedUnits(deckDir, prefix) {
  if (!existsSync(deckDir)) return [];
  const label = `${prefix[0].toUpperCase()}${prefix.slice(1)}`;
  const units = [];
  for (const entry of readdirSync(deckDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (!m) continue;
    const seq = Number(m[1]);
    const data = readCardsJson(join(deckDir, entry.name));
    if (!data) continue;
    const meta = data.meta || {};
    const number = typeof meta.chapterNumber === "number" ? meta.chapterNumber : seq;
    units.push({
      seq,
      number,
      label: meta.chapterLabel || `${label} ${number}`,
      cards: data.items.map(toRenderCard),
    });
  }
  units.sort((a, b) => a.number - b.number || a.seq - b.seq);
  return units;
}

// A media filename is only ever a flat file in a run dir's audio/ folder — reject anything with path
// separators or traversal before it's ever joined to a path.
export function isSafeMediaFile(file) {
  return (
    typeof file === "string" && /^[A-Za-z0-9._-]+$/.test(file) && file !== "." && file !== ".."
  );
}

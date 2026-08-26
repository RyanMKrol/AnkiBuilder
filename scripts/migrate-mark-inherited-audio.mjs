#!/usr/bin/env node
//
// SPENT: 2026-08-26. A one-off MIGRATION, not a standing tool.
// It marked the clips the 2026-08-24 absorption carried across, once, so the audio review could
// separate them from the ones synthesized afterwards. Kept for the record.
// Do not run it as part of any procedure: a future retrofit records the fact as it copies the clip.
//
// WHY IT IS A MIGRATION AND NOT A DERIVATION. A future retrofit stamps `additionAudioInherited` as
// it copies a clip, so the fact is recorded at the moment it is true. This batch predates the field,
// so the set has to be reconstructed, and the only sound source is the routing table's own record of
// which cards MOVED from another deck.
//
// The obvious shortcut, "its audio field changed during the audio run", does not work: the audio
// stage re-resolves a cached clip under a canonical name, so 126 cards show a changed filename where
// only 78 were actually synthesized. Reconstructing from that would mark 48 cards as new audio that
// nobody generated.
//
// One moved card is deliberately NOT marked: irl-l1-39 had its [number] placeholder rewritten into a
// real phone number during the merge, so its stored clip no longer matched its text and the audio
// stage regenerated it. Its audio is new, and it needs hearing.
//
// Usage: node scripts/migrate-mark-inherited-audio.mjs [--dry]
import { readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mergeIntoCardsFile } from "../src/cards/mergeIntoCardsFile.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");
const ROUTING = join(REPO, "docs/designs/nihongo-absorption-2026-08.routing.json");
const REGENERATED = new Set(["irl-l1-39"]);
const dry = process.argv.includes("--dry");

const rows = JSON.parse(readFileSync(ROUTING, "utf-8")).rows;
const moved = new Map();
for (const r of rows) {
  if (r.disposition !== "move" || REGENERATED.has(r.cardId)) continue;
  if (!moved.has(r.destination)) moved.set(r.destination, []);
  moved.get(r.destination).push(r.cardId);
}

let marked = 0;
for (const [unit, ids] of [...moved].sort()) {
  const path = join(BOOK, unit, "cards.json");
  if (!existsSync(path)) continue;
  const items = JSON.parse(readFileSync(path, "utf-8")).items;
  // Only a card that actually HAS a clip: a moved card whose audio never came across would be
  // marked as "already heard" while being silent, which is the opposite of the truth.
  const hit = ids.filter((id) => {
    const c = items.find((i) => i.id === id);
    return c && c.audio && !c.additionAudioInherited;
  });
  if (!hit.length) continue;
  console.log(`${unit.padEnd(20)} ${String(hit.length).padStart(3)} card(s)`);
  marked += hit.length;
  if (dry) continue;
  mergeIntoCardsFile(path, {
    byId: new Map(hit.map((id) => [id, { additionAudioInherited: true }])),
    ownedFields: ["additionAudioInherited"],
    reason: "mark-inherited-audio",
  });
}
console.log(
  `\n${dry ? "WOULD mark" : "marked"} ${marked} card(s) as carrying a clip from their old deck.` +
    `\nirl-l1-39 is deliberately NOT marked: its clip was regenerated after its text changed.`,
);

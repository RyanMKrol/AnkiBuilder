#!/usr/bin/env node
// Deck-wide collision audit for the extras pass (extras-pass.md, "The gate that catches what the
// agents cannot"). Groups every card in the book by normalized English gloss and by target; any
// group with more than one distinct answer is unstudiable without a hint on each member (two
// Production cards both reading "How many people?" are one question with two right answers).
//
// Report-only by design: fix the collisions the extras pass introduced, and report pre-existing
// ones on signed-off cards to the human rather than inventing wording for them.
//
// Usage: node scripts/extras-collision-audit.mjs <book-dir>
// Exit 0 when every collision member has a hint; exit 2 when any is missing one.
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { findCollisions } from "../src/cards/extrasTools.js";

const bookDir = resolve(process.argv[2] || "");
if (!bookDir || !existsSync(bookDir)) {
  console.error("usage: extras-collision-audit.mjs <book-dir>");
  process.exit(1);
}

const units = readdirSync(bookDir)
  .map((name) => name.match(/^(chapter|lesson)-(\d+)(-extras)?$/))
  .filter(Boolean)
  .map((m) => ({ name: m[0], number: Number(m[2]), extras: Boolean(m[3]) }))
  .sort((a, b) => a.number - b.number || Number(a.extras) - Number(b.extras))
  .map(({ name }) => {
    const path = join(bookDir, name, "cards.json");
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return { unit: name, items: data.items || [] };
  })
  .filter(Boolean);

const { byEnglish, byTarget } = findCollisions(units);
let missingHints = 0;

const report = (label, collisions) => {
  if (collisions.length === 0) return;
  console.log(`\n== collisions by ${label} ==`);
  for (const group of collisions) {
    console.log(`"${group.key}"`);
    for (const m of group.members) {
      const flag = m.hasHint ? "hint ok" : "MISSING HINT";
      if (!m.hasHint) missingHints++;
      console.log(`  ${m.unit}/${m.id}: "${m.english}" / ${m.target} — ${flag}`);
    }
  }
};

report("English gloss (Production face)", byEnglish);
report("target (Recognition face)", byTarget);

if (byEnglish.length === 0 && byTarget.length === 0) {
  console.log("no collisions found");
} else if (missingHints === 0) {
  console.log("\nevery collision member carries a hint — nothing to fix");
} else {
  console.log(`\n${missingHints} card(s) in collision groups have no hint — add one to each`);
}
process.exit(missingHints > 0 ? 2 : 0);

#!/usr/bin/env node
// Deck-wide collision audit for the extras pass (extras-pass.md, "The gate that catches what the
// agents cannot"). Groups every card in the book by normalized English gloss and by target; any
// group with more than one distinct answer is unstudiable without a front cue on each member (two
// Production cards both reading "How many people?" are one question with two right answers).
//
// Report-only by design: fix the collisions the extras pass introduced, and report pre-existing
// ones on signed-off cards to the human rather than inventing wording for them.
//
// Usage: node scripts/extras-collision-audit.mjs <book-dir>
// Exit 0 when every collision member carries a cue that renders on the face it collides on
// (hint or scene for an English-gloss group; scene ONLY for a target group, since a hint shows
// on the back of a Recognition card); exit 2 when any is missing one.
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
let missingCues = 0;

const report = (label, collisions, missingLabel) => {
  if (collisions.length === 0) return;
  console.log(`\n== collisions by ${label} ==`);
  for (const group of collisions) {
    console.log(`"${group.key}"`);
    for (const m of group.members) {
      const flag = m.hasCue ? "cue ok" : missingLabel;
      if (!m.hasCue) missingCues++;
      console.log(`  ${m.unit}/${m.id}: "${m.english}" / ${m.target} — ${flag}`);
    }
  }
};

report("English gloss (Production face)", byEnglish, "MISSING HINT (or scene)");
// A hint is not offered as an option here: it renders on the back of a Recognition card, after
// the learner has already had to answer.
report("target (Recognition face)", byTarget, "MISSING SCENE");

if (byEnglish.length === 0 && byTarget.length === 0) {
  console.log("no collisions found");
} else if (missingCues === 0) {
  console.log("\nevery collision member carries a cue that renders on the colliding face");
} else {
  console.log(
    `\n${missingCues} card(s) in collision groups have no cue on the face they collide on — ` +
      `add a hint (English-gloss groups) or a scene (target groups) to each`,
  );
}
process.exit(missingCues > 0 ? 2 : 0);

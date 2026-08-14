#!/usr/bin/env node
// Every deterministic check that should pass BEFORE a unit is handed to a human reviewer, in one
// command. Run it at the end of a build, before you post the review link.
//
// Why this exists: each of these checks already existed, but they were run ad hoc and one of them
// (duplicate card ids) only ever ran inside the DECK BUILD — which happens at Mark done, after the
// corpus review and the audio review have both been signed off. A card id becomes the Anki note
// guid, so a clash makes the build refuse to package the deck at all, and the refusal therefore
// surfaced at the latest, most expensive possible moment. Checking it up front turns a
// re-open-and-re-review into an edit before anyone has looked at the unit.
//
// Usage:
//   node scripts/preflight.mjs <book-or-course-dir>     one collection
//   node scripts/preflight.mjs --all [output-root]      every collection under the root
//
// Exit 0 when every check passes, 1 when any fails.
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, basename } from "path";
import { validateCards, validateCorpus } from "../src/model/index.js";
import { findCollisions, findCrossChapterDuplicates } from "../src/cards/extrasTools.js";
import { assertUniqueCardIds } from "../src/deck/shippableCards.js";
import { normalizeDisplayText, isSpaceFreeLanguage } from "../src/model/scriptSpacing.js";

const args = process.argv.slice(2);
const all = args.includes("--all");
const positional = args.filter((a) => !a.startsWith("--"));

function collectionDirs() {
  if (!all) return [resolve(positional[0] || "")];
  const root = resolve(positional[0] || "output");
  const dirs = [];
  for (const group of ["epubs", "courses"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const name of readdirSync(groupDir)) {
      const dir = join(groupDir, name);
      if (statSync(dir).isDirectory()) dirs.push(dir);
    }
  }
  return dirs;
}

// Units in study order: a lesson before its extras, so "the earliest occurrence is the keeper"
// means what a reader expects.
function loadUnits(dir) {
  return readdirSync(dir)
    .map((name) => name.match(/^(chapter|lesson)-(\d+)(-extras)?$/))
    .filter(Boolean)
    .map((m) => ({ name: m[0], number: Number(m[2]), extras: Boolean(m[3]) }))
    .sort((a, b) => a.number - b.number || Number(a.extras) - Number(b.extras))
    .map(({ name }) => {
      const path = join(dir, name, "cards.json");
      if (!existsSync(path)) return null;
      const data = JSON.parse(readFileSync(path, "utf-8"));
      return {
        unit: name,
        label: data.meta?.chapterLabel ?? name,
        items: data.items ?? [],
        meta: data.meta ?? {},
      };
    })
    .filter(Boolean);
}

let failed = 0;
const fail = (msg) => {
  failed++;
  console.log(`  ✗ ${msg}`);
};

for (const dir of collectionDirs()) {
  if (!existsSync(dir)) {
    console.error(`no such directory: ${dir}`);
    process.exit(1);
  }
  console.log(`\n── ${basename(dir)} ${"─".repeat(Math.max(0, 56 - basename(dir).length))}`);
  const units = loadUnits(dir);
  if (!units.length) {
    console.log("  (no units)");
    continue;
  }

  // 1. Schema — a hand-authored unit skips the stages that would otherwise shape its fields.
  let bad = 0;
  for (const unit of units) {
    for (const [file, validate] of [
      ["cards.json", validateCards],
      ["corpus.json", validateCorpus],
    ]) {
      const path = join(dir, unit.unit, file);
      if (!existsSync(path)) continue;
      try {
        validate(JSON.parse(readFileSync(path, "utf-8")));
      } catch (error) {
        fail(`schema  ${unit.unit}/${file}: ${error.message}`);
        bad++;
      }
    }
  }
  if (!bad) console.log(`  ✓ schema        ${units.length} unit(s) valid`);

  // 2. Duplicate card ids — the one that used to surface only at Mark done. Checked across
  //    EVERY unit, not just done ones, so a clash is caught while the new unit is still editable.
  try {
    assertUniqueCardIds(
      units.map((u) => ({ label: u.unit, items: u.items.filter((i) => !i.excluded) })),
      basename(dir),
    );
    console.log("  ✓ card ids      unique across all units");
  } catch (error) {
    fail(`card ids  ${error.message}`);
  }

  // 3. Collisions — a shared face with two different answers is unstudiable without a cue.
  //    An English-gloss group accepts a hint OR a scene; a target group needs a SCENE, because a
  //    hint renders on the back of a Recognition card, after the learner has already answered.
  //    `hasCue` already encodes that per group, so just trust it.
  const { byEnglish, byTarget } = findCollisions(units);
  const uncued = [...byEnglish, ...byTarget].flatMap((group) =>
    group.members.filter((m) => !m.hasCue).map((m) => ({ ...m, key: group.key })),
  );
  if (uncued.length) {
    fail(`collisions  ${uncued.length} card(s) with no cue on the colliding face:`);
    for (const m of uncued) console.log(`      ${m.unit}/${m.id}  "${m.english}" / ${m.target}`);
  } else {
    console.log("  ✓ collisions    every member cued on the colliding face");
  }

  // 4. Duplicate targets — reported, never auto-applied: whether a pair is one word taught twice
  //    or two senses that share a spelling is a judgment about the source material.
  const dupes = findCrossChapterDuplicates(units);
  console.log(
    `  · duplicates    ${dupes.length} target group(s) spanning units (review, don't auto-exclude)`,
  );

  // 5. Display normalization — for a space-free script (Japanese) a stored target must carry no
  //    editorial spaces and no trailing 。. The pipeline normalizes during translate, so ONLY
  //    hand-authored units (extras) can drift; chapter-13-extras shipped 66 spaced cards this way
  //    and rendered 分かち書き word-separation the deck deliberately strips.
  const unnormalized = [];
  for (const unit of units) {
    const lang = unit.meta?.targetLanguage ?? "ja";
    if (!isSpaceFreeLanguage(lang)) continue;
    for (const item of unit.items) {
      if (item.excluded) continue;
      for (const field of ["target", "reading"]) {
        const value = item[field];
        if (typeof value !== "string") continue;
        if (normalizeDisplayText(value, lang) !== value)
          unnormalized.push(`${unit.unit}/${item.id}.${field}`);
      }
    }
  }
  if (unnormalized.length) {
    fail(
      `spacing  ${unnormalized.length} field(s) carry editorial spaces or a trailing 。: ` +
        unnormalized.slice(0, 8).join(", ") +
        (unnormalized.length > 8 ? ` … +${unnormalized.length - 8} more` : ""),
    );
  } else {
    console.log("  ✓ spacing       display text normalized for the script");
  }

  // 6. Audio markers — heuristic, so a note rather than a failure.
  const stuck = units.flatMap((u) =>
    u.items.filter((i) => i.audioMarkerStuck && !i.excluded).map((i) => `${u.unit}/${i.id}`),
  );
  if (stuck.length)
    console.log(
      `  · audio         ${stuck.length} clip(s) flagged marker-audible: ${stuck.join(", ")}`,
    );
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\npreflight clean");
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
// Cross-chapter duplicate check for the extras pass (extras-pass.md, "The gate that catches what
// the agents cannot"). Each extras agent sees earlier chapters but not later ones, so a card added
// to Lesson 3 can duplicate one already in Lesson 8. This groups every card in the whole book by
// target and reports groups spanning two or more units.
//
// Usage:
//   node scripts/extras-duplicate-check.mjs <book-dir>            report only
//   node scripts/extras-duplicate-check.mjs <book-dir> --apply    exclude later occurrences
//                                                                 (unreviewed units only)
//   ... --apply --force                                           also touch reviewed/done units
//
// --apply keeps the EARLIEST occurrence and excludes later ones with a reviewNote naming the
// keeper. A later occurrence that looks like a QUESTION is skipped even under --apply (excluding a
// question can strand an elliptical answer whose hint names it — resolve those by hand); excluding
// an answer is always safe.
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { findCrossChapterDuplicates } from "../src/cards/extrasTools.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const bookDir = resolve(args.find((a) => !a.startsWith("--")) || "");
if (!bookDir || !existsSync(bookDir)) {
  console.error("usage: extras-duplicate-check.mjs <book-dir> [--apply] [--force]");
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
    return {
      unit: name,
      path,
      data,
      label: data.meta?.chapterLabel || name,
      reviewed: !!data.meta?.reviewed,
      done: !!data.meta?.done,
      items: data.items || [],
    };
  })
  .filter(Boolean);

const groups = findCrossChapterDuplicates(units);
if (groups.length === 0) {
  console.log("no cross-unit duplicates found");
  process.exit(0);
}

let excluded = 0;
let skipped = 0;
for (const group of groups) {
  console.log(`\n"${group.target}" — keeper: ${group.keeper.unit}/${group.keeper.id}`);
  for (const dup of group.duplicates) {
    const guarded = (dup.reviewed || dup.done) && !force;
    const question = dup.isQuestion;
    const verdict = !apply
      ? "would exclude"
      : question
        ? "SKIPPED (question — check its answer cards' hints, then exclude by hand)"
        : guarded
          ? "SKIPPED (unit is reviewed/done — re-run with --force to touch it)"
          : "excluded";
    console.log(`  ${dup.unit}/${dup.id} ("${dup.english}") → ${verdict}`);
    if (!apply || question || guarded) {
      if (apply) skipped++;
      continue;
    }
    const unit = units.find((u) => u.unit === dup.unit);
    const item = unit.items.find((i) => i.id === dup.id);
    item.excluded = true;
    const note = `Duplicate — same target already taught as ${group.keeper.unit}/${group.keeper.id} (excluded by extras-duplicate-check)`;
    item.reviewNote = item.reviewNote ? `${item.reviewNote} | ${note}` : note;
    unit.dirty = true;
    excluded++;
  }
}

if (apply) {
  for (const unit of units) {
    if (unit.dirty) {
      const { backup } = writeUnitJson(unit.path, unit.data, { reason: "extras-dupes" });
      console.log(`  wrote ${unit.path}${backup ? ` (backup: ${backup})` : ""}`);
    }
  }
  console.log(`\nexcluded ${excluded} duplicate(s); skipped ${skipped} (see above)`);
} else {
  console.log(
    `\n${groups.length} duplicate group(s) — re-run with --apply to exclude the later occurrences`,
  );
}
process.exit(groups.length > 0 && !apply ? 2 : 0);

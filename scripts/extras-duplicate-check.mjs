#!/usr/bin/env node
// Cross-chapter duplicate check for the extras pass (extras-pass.md, "The gate that catches what
// the agents cannot"). Each extras agent sees earlier chapters but not later ones, so a card added
// to Lesson 3 can duplicate one already in Lesson 8. This groups every card in the whole book by
// target and reports groups spanning two or more units.
//
// Usage:
//   node scripts/extras-duplicate-check.mjs <book-dir>            report only (the documented step)
//   node scripts/extras-duplicate-check.mjs <book-dir> --apply    exclude, narrowly (see below)
//   ... --apply --force                                           also touch reviewed/done units
//
// REPORT-ONLY IS THE DOCUMENTED PATH. The grouping is mechanical and correct; the judgement is not.
// A shared target is as often two senses of one word as it is a duplicate: on the live book the
// particle group for the smallest particles collapses onto a NUMBER card that happens to share the
// spelling, and keeping the earliest occurrence keeps the number and drops every particle sense.
// See references/extras-pass.md for the worked cases.
//
// What --apply may exclude is decided by planDuplicateExclusions in src/cards/duplicatePlan.js, not
// here: the duplicate has to be glossed the same as the keeper, must not look like a question
// (excluding one can strand an elliptical answer whose hint names it), and must not live in a
// reviewed/done unit without --force. Everything else is printed for a human to judge.
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { findCrossChapterDuplicates } from "../src/cards/extrasTools.js";
import { planDuplicateExclusions } from "../src/cards/duplicatePlan.js";
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

const { exclude, refuse } = planDuplicateExclusions(groups, { force });
const refusedFor = new Map(refuse.map((r) => [`${r.duplicate.unit}/${r.duplicate.id}`, r.reason]));

for (const group of groups) {
  console.log(
    `\n"${group.target}" — keeper: ${group.keeper.unit}/${group.keeper.id} ("${group.keeper.english}")`,
  );
  for (const dup of group.duplicates) {
    const reason = refusedFor.get(`${dup.unit}/${dup.id}`);
    const verdict = reason ? `KEPT (${reason})` : apply ? "excluded" : "would exclude";
    console.log(`  ${dup.unit}/${dup.id} ("${dup.english}") → ${verdict}`);
  }
}

let excluded = 0;
if (apply) {
  for (const { group, duplicate } of exclude) {
    const unit = units.find((u) => u.unit === duplicate.unit);
    const item = unit.items.find((i) => i.id === duplicate.id);
    item.excluded = true;
    // Provenance: this tool false-positives on roughly a third of the groups it reports, so its
    // exclusions must stay tellable apart from a human's reviewed ones long after the run.
    item.excludedBy = "extras-duplicate-check";
    item.excludedReason = `duplicate of ${group.keeper.unit}/${group.keeper.id} ("${group.target}")`;
    const note = `Duplicate — same target already taught as ${group.keeper.unit}/${group.keeper.id} (excluded by extras-duplicate-check)`;
    item.reviewNote = item.reviewNote ? `${item.reviewNote} | ${note}` : note;
    unit.dirty = true;
    excluded++;
  }
}
const skipped = refuse.length;

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
    `\n${groups.length} duplicate group(s); ${exclude.length} of ${exclude.length + refuse.length} ` +
      `later occurrence(s) are safe to auto-exclude. Read the report and decide: a shared target ` +
      `is as often two senses of one word as it is a duplicate.`,
  );
}
process.exit(groups.length > 0 && !apply ? 2 : 0);

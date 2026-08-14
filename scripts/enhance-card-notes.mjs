#!/usr/bin/env node
//
// SPENT: 2026-08-14 — a one-off MIGRATION, not a standing tool.
// the whole-book note backfill ran once; new lessons get notes from prepare. It is kept for the record, and because re-reading
// what a migration actually did is the only way to understand the shape of the data it left
// behind. Do not run it as part of any procedure: it is not in SKILL.md's per-chapter flow, and
// it will re-apply a decision that has already been made and reviewed.
//
// Whole-book backfill of back-of-card `note`s: one backward pass PER LESSON, each fed only that
// lesson + all EARLIER lessons as context. The per-lesson logic lives in src/cards/crossLessonNotes.js
// and is the same code the `prepare` CLI stage runs for a single new lesson — this script is just the
// batch driver for re-running it across a whole book.
//
// Usage: node scripts/enhance-card-notes.mjs [--dry] [--only <unit>] <bookOrCourseDir> [<dir> ...]
//
// NOTE: for a NEW lesson you do NOT need this script — `anki-builder prepare --run <runDir>` (and
// `assemble`, which chains into it) already runs the pass for that lesson. Reach for this only to
// backfill or re-run a book. The bare form REWRITES EVERY LESSON, including finished ones; prefer
// --only <unit> unless you really mean the whole book.
import { existsSync } from "fs";
import { lessonUnits, enhanceLessonNotes } from "../src/cards/crossLessonNotes.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyAt = args.indexOf("--only");
const only = onlyAt === -1 ? null : args[onlyAt + 1];
if (onlyAt !== -1 && !only) {
  console.error("--only needs a unit folder name (e.g. --only chapter-6)");
  process.exit(1);
}
const dirs = args.filter(
  (a, i) => a !== "--dry" && a !== "--only" && !(onlyAt !== -1 && i === onlyAt + 1),
);
if (dirs.length === 0) {
  console.error("give one or more book/course directories (e.g. output/epubs/<slug>)");
  process.exit(1);
}

for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error("skip (missing):", dir);
    continue;
  }
  const units = lessonUnits(dir);
  if (only && !units.some((u) => u.name === only)) {
    console.error(
      `skip (no unit "${only}" in ${dir}) — have: ${units.map((u) => u.name).join(", ")}`,
    );
    continue;
  }
  console.error(
    only
      ? `${dir}: writing "${only}" only, with ${units.findIndex((u) => u.name === only)} earlier lesson(s) as context…`
      : `${dir}: ${units.length} lesson(s) — one backward pass per lesson…`,
  );

  for (const unit of units) {
    if (only && unit.name !== only) continue;
    const { changed, skipped } = enhanceLessonNotes({
      deckDir: dir,
      unitName: unit.name,
      dry,
      log: (line) => console.error(line),
    });
    if (skipped) {
      console.error(`  ${unit.name} (${unit.label}): skipped — ${skipped}`);
    } else {
      console.error(
        `  ${unit.name} (${unit.label}): ${changed ? `updated ${changed} note(s)` : "no change"}`,
      );
    }
  }
}

#!/usr/bin/env node
// Audit a grammar paradigm cell by cell against every card in a collection.
//
// extras-pass.md: when a chapter teaches a paradigm (a form varying over a closed set of slots),
// enumerate the grid and check every cell against EVERY card in the book, "as a script over all
// chapter-*/cards.json targets rather than reading tables by eye". Earlier lessons routinely fill
// part of a grid, so a gap is invisible from inside one unit.
//
// WHICH grid a chapter teaches is judgement, so you author the spec. Everything after that is not,
// and the matching rules (predicate position, longer-form exclusion) live in src/cards/paradigmGrid.js
// behind tests, because a check whose rules change per chapter is not a check.
//
// Grid spec, JSON:
//   {
//     "name": "あります / います",
//     "cells": [
//       { "label": "inanimate, present affirmative", "form": "あります" },
//       { "label": "inanimate, present negative",    "form": "ありません" },
//       { "label": "animate, present affirmative",   "form": "います",
//         "notForms": ["ちがいます"] }
//     ]
//   }
//
// `notForms` records the confusables you have already found (います matches inside ちがいます, which
// no string matcher can rule out without a tokenizer). Writing one down means the next person does
// not rediscover it.
//
// Read-only. Every hit is printed with the card that produced it: read them before believing the
// result, exactly as extras-pass.md says.
//
// Usage:
//   node scripts/paradigm-grid.mjs <bookDir> --grid <spec.json>
//   node scripts/paradigm-grid.mjs <bookDir> --grid <spec.json> --hits    show every matching card
//
// Exit 0 when every cell has at least one hit, 1 when a cell is empty.
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { auditParadigmGrid } from "../src/cards/paradigmGrid.js";
import { isUnitDir } from "../src/model/unitDir.js";

const args = process.argv.slice(2);
const gridAt = args.indexOf("--grid");
const gridPath = gridAt === -1 ? null : args[gridAt + 1];
const showHits = args.includes("--hits");
const bookDir = args.filter((a, i) => !a.startsWith("--") && i !== gridAt + 1)[0];

if (!bookDir || !gridPath) {
  console.error("usage: node scripts/paradigm-grid.mjs <bookDir> --grid <spec.json> [--hits]");
  process.exit(1);
}
for (const path of [resolve(bookDir), resolve(gridPath)]) {
  if (!existsSync(path)) {
    console.error(`no such path: ${path}`);
    process.exit(1);
  }
}

// Every unit of the collection, extras included: the grid is a claim about the whole book.
function collectionCards(dir) {
  const cards = [];
  for (const name of readdirSync(dir)) {
    if (!isUnitDir(name)) continue;
    const path = join(dir, name, "cards.json");
    if (!existsSync(path)) continue;
    for (const item of JSON.parse(readFileSync(path, "utf-8")).items ?? []) {
      cards.push({ ...item, __unit: name });
    }
  }
  return cards;
}

const grid = JSON.parse(readFileSync(resolve(gridPath), "utf-8"));
const cards = collectionCards(resolve(bookDir));
const result = auditParadigmGrid({ grid, cards });

console.log(`${result.name} — ${cards.length} card(s) across the collection\n`);
for (const cell of result.cells) {
  const mark = cell.covered ? "✓" : "✗";
  console.log(`  ${mark} ${cell.label}  (${cell.form})  ${cell.hits.length} hit(s)`);
  if (cell.excludeForms.length) {
    console.log(`      excluding: ${cell.excludeForms.join(", ")}`);
  }
  if (showHits) {
    for (const hit of cell.hits) console.log(`      ${hit.unit}/${hit.id}: ${hit.target}`);
  }
}

console.log(
  result.missing.length
    ? `\n${result.missing.length} empty cell(s): ${result.missing.join("; ")}\n` +
        `Read the hits above before trusting the ✓s — a cell whose only hit is a word you did not ` +
        `expect is a false positive, and belongs in that cell's notForms.`
    : "\nevery cell has at least one card — read the hits before believing it",
);
process.exit(result.missing.length ? 1 : 0);

#!/usr/bin/env node
// Print what the learner has already been taught when they reach a unit: every shipping card of
// every unit EARLIER in study order, one line each, for the QA learner pass (qa/README.md).
//
//   node scripts/qa-ledger.mjs <unitDir> [--notes]
//
// Study order is the book's order (see qa-units.mjs). The extras unit of a chapter comes after its
// base unit, so the extras ledger includes the base. By default each line is `target | english`;
// `--notes` appends the card's note, which is where grammar gets explained, at roughly three times
// the length. The learner simulation is told it may open an earlier unit's cards.json when it needs
// to check whether a note explained something.
//
// Read-only: nothing is written.

import { basename } from "node:path";
import { collectionDirOf, listUnitsInStudyOrder, readUnit } from "./qa-units.mjs";

const args = process.argv.slice(2);
const withNotes = args.includes("--notes");
const [unitDir] = args.filter((a) => !a.startsWith("--"));
if (!unitDir) {
  console.error("usage: node scripts/qa-ledger.mjs <unitDir> [--notes]");
  process.exit(2);
}

const target = readUnit(unitDir);
if (!target) {
  console.error(`no cards.json in ${unitDir}`);
  process.exit(2);
}

const units = listUnitsInStudyOrder(collectionDirOf(target.dir));
const position = units.findIndex((u) => u.dir === target.dir);
if (position < 0) {
  console.error(`${unitDir} is not a unit of ${collectionDirOf(target.dir)}`);
  process.exit(2);
}

const earlier = units.slice(0, position).filter((u) => u.shipping.length > 0);
const total = earlier.reduce((n, u) => n + u.shipping.length, 0);

console.log(`# Taught before ${target.label}`);
console.log(
  `${earlier.length} earlier unit(s), ${total} card(s), in the order the learner studied them. ` +
    `One line per card: target | english${withNotes ? " | note" : ""}.`,
);
console.log("");

for (const unit of earlier) {
  console.log(`## ${unit.label}  (${basename(unit.dir)}, ${unit.shipping.length} cards)`);
  for (const card of unit.shipping) {
    const line = [card.target, card.english];
    if (withNotes && card.note) line.push(card.note);
    console.log(line.join(" | "));
  }
  console.log("");
}

console.log(`END OF LEDGER: ${total} card(s) taught before this unit.`);

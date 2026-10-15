#!/usr/bin/env node
// Print every shipping card of a unit as the faces Anki shows, rendered from the deck's real
// templates, for the QA learner pass (qa/README.md).
//
//   node scripts/qa-render-unit.mjs <unitDir>
//
// A speaking unit prints both directions of each card (Recognition front and back, Production front
// and back); a reading unit prints its one face. Excluded cards and pending additions are not
// printed, because the learner never sees them. The rendering goes through src/deck/cardFaces.js,
// which reads the templates themselves, so what this prints cannot drift from what Anki renders.
//
// Read-only: nothing is written.

import { basename } from "node:path";
import { collectionDeckKind } from "../src/model/deckKind.js";
import { templatesForDeckKind } from "../src/deck/cardTemplates.js";
import { noteFields } from "../src/deck/noteFields.js";
import { renderFacesWith } from "../src/deck/cardFaces.js";
import { collectionDirOf, readUnit } from "./qa-units.mjs";

const [unitDir] = process.argv.slice(2);
if (!unitDir) {
  console.error("usage: node scripts/qa-render-unit.mjs <unitDir>");
  process.exit(2);
}

const unit = readUnit(unitDir);
if (!unit) {
  console.error(`no cards.json in ${unitDir}`);
  process.exit(2);
}

const templates = templatesForDeckKind(collectionDeckKind(collectionDirOf(unit.dir)));
const hidden = unit.items.length - unit.shipping.length;

console.log(`# ${unit.label}`);
console.log(`unit: ${basename(unit.dir)}`);
console.log(
  `${unit.shipping.length} card(s) ship; ${hidden} excluded or pending card(s) are not shown. ` +
    `Each card is rendered from the real templates below.`,
);
console.log("");

// Field text is HTML-escaped once on the way into Anki (noteFields), and Anki renders it back. The
// learner sees "&", so the text here does too.
const unescape = (line) => line.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

unit.shipping.forEach((card, index) => {
  console.log(`### ${index + 1}. [${card.id}]`);
  const faces = renderFacesWith(noteFields(card), templates);
  for (const face of faces) {
    console.log(`${face.name} FRONT:`);
    for (const line of face.front) console.log(`  ${unescape(line)}`);
    console.log(`${face.name} BACK:`);
    for (const line of face.back) console.log(`  ${unescape(line)}`);
  }
  if (card.aiSuggested) console.log("(authored for the deck, not printed in the book)");
  console.log("");
});

console.log(`END OF UNIT: ${unit.shipping.length} card(s) rendered.`);

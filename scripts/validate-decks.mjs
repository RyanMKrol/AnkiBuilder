#!/usr/bin/env node
// Validates every corpus.json / cards.json under an output root against the schemas in
// src/model/index.js, and exits non-zero if any file fails.
//
// Why this isn't part of `npm run ci`: /output is gitignored, so CI has no deck data to check.
// This is a local command to run at the end of a chapter, or after hand-editing any unit.
// Hand-authored units (extras) are the ones that need it — they never pass through the
// assemble/translate stages that would otherwise shape their fields, so a wrong field TYPE
// (a null where the schema wants a string, an extra property on meta) reaches the dashboard
// intact and only surfaces as "invalid card data after edit" when a review gate is clicked.
//
// Usage:
//   node scripts/validate-decks.mjs [output-root]     default: output
import { readdirSync, existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { validateCards, validateCorpus } from "../src/model/index.js";

const root = resolve(process.argv[2] || "output");
if (!existsSync(root)) {
  console.error(`no such output root: ${root}`);
  process.exit(1);
}

const CHECKS = [
  ["corpus.json", validateCorpus],
  ["cards.json", validateCards],
];

// Unit dirs sit at varying depths (epubs/<book>/<unit>, courses/<course>/<unit>,
// templates/<name>/<lang>), so walk rather than assume a shape.
function* unitDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name);
    if (CHECKS.some(([file]) => existsSync(join(path, file)))) yield path;
    yield* unitDirs(path);
  }
}

let checked = 0;
const failures = [];
for (const unit of unitDirs(root)) {
  for (const [file, validate] of CHECKS) {
    const path = join(unit, file);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    checked++;
    try {
      validate(JSON.parse(readFileSync(path, "utf-8")));
    } catch (error) {
      failures.push(`${path.slice(root.length + 1)}: ${error.message}`);
    }
  }
}

for (const failure of failures) console.error(`INVALID  ${failure}`);
console.log(
  `\n${checked} file(s) checked, ${failures.length} invalid` +
    (failures.length ? "" : " — all decks valid"),
);
process.exit(failures.length ? 1 : 0);

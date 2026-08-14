#!/usr/bin/env node
// Validates every corpus.json / cards.json under an output root against the schemas in
// src/model/index.js, and exits non-zero if any file fails.
//
// Why this isn't part of `npm run ci`: /output holds deck state, so CI and a fresh clone have
// nothing to check. This is a local command to run at the end of a chapter, or after hand-editing
// any unit. Hand-authored units (extras) are the ones that need it — they never pass through the
// assemble/translate stages that would otherwise shape their fields, so a wrong field TYPE (a null
// where the schema wants a string, an extra property on meta) reaches the dashboard intact and only
// surfaces as "invalid card data after edit" when a review gate is clicked.
//
// It is now a thin alias for `preflight --schema-only`, which is the same schema check run through
// the shared unit loader. That fold is the point: this script used to walk the tree with its OWN
// recursive directory scan, so the two commands could — and did — disagree about which directories
// were units. One loader, one answer.
//
// Usage:
//   node scripts/validate-decks.mjs [output-root]     default: output
import { SCHEMA_ONLY_CHECKS, audit, formatReport } from "../src/audit/index.js";

const outputRoot = process.argv[2] || "output";
const result = audit({ outputRoot, checks: SCHEMA_ONLY_CHECKS });

if (result.workspace.missing || result.workspace.collections.length === 0) {
  console.log(`(no collections found under ${result.workspace.root})`);
  process.exit(0);
}

for (const line of formatReport(result, { verbose: false })) console.log(line);
process.exit(result.exitCode);

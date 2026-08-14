#!/usr/bin/env node
// One-shot version of `await-review.mjs --gate 2`: is this unit done, AND did the rebuild its
// Mark done triggers actually produce a package?
//
// Usage:
//   node scripts/check-done.mjs <run-dir>
//
// Exit codes:
//   0  done, and the collection package is newer than cards.json
//   1  not done yet
//   2  the unit could not be read
//   3  done, but the package is missing or older than cards.json — the rebuild FAILED
//
// The distinction between 0 and 3 is the whole point: `meta.done` flips even when the package build
// refuses (a duplicate card id will do it), so the flag alone has already been mistaken for a
// shipped unit.
import { resolve } from "path";
import { gateState, GATE_EXIT } from "../src/review/gateState.js";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (positional.length === 0) {
  console.error("usage: check-done.mjs <run-dir>");
  process.exit(GATE_EXIT.unreadable);
}

const runDir = resolve(positional[0]);
const state = gateState(runDir, 2);
const mark = { "signed-off": "✅", waiting: "⏳", "stale-package": "⚠️", unreadable: "🛑" }[
  state.status
];

console.log(`${mark} ${runDir}: ${state.message}`);
process.exit(state.exitCode ?? GATE_EXIT.timedOut);

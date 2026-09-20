#!/usr/bin/env node
// What the coverage adversary found, and whether it points at a fixable weakness in the passes it checks.
//
// The adversary is a SAFETY NET, and a safety net that keeps catching the same thing is telling you
// about the thing above it. Every chapter it recovers items the specialists missed; that is the
// design working. What the design does not do by itself is notice when the misses have ONE cause,
// because each chapter's gap list is read once and thrown away.
//
// Measured on Lesson 17: the adversary reported 84 gaps, the gap filler carded 25 of them, and 19 of
// those 25 were cells of a single conjugation table the chapter tells the learner to memorize. Not
// nineteen oversights -- one missing rule, recovered nineteen times, at two extra model calls per
// chapter for as long as nobody looked at the shape of the list.
//
// So this script does the counting and the clustering, which is mechanism, and stops there. Whether
// a cluster is a prompt to fix or just what this chapter looks like is judgement, and the operator
// makes it. Script proposes, agent disposes.
//
// Read-only. Usage:
//   node scripts/adversary-learnings.mjs <unitDir>
//
// Exit 0 always: this reports, it never gates. A finding here is a conversation, not a blocker.
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const unitDir = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("usage: node scripts/adversary-learnings.mjs <unitDir>");
  process.exit(2);
}

const covPath = join(unitDir, "candidates", "coverage.json");
const fillPath = join(unitDir, "candidates", "coverage-fills.json");
if (!existsSync(covPath)) {
  // A unit built before the phase, or one whose adversary step never ran, has nothing to say here.
  // Say THAT, rather than printing a clean report over an absence.
  console.log(`no adversary output at ${covPath}`);
  console.log(
    "this unit was not built by phase 1, or its coverage step did not run — nothing to read",
  );
  process.exit(0);
}

const cov = JSON.parse(readFileSync(covPath, "utf-8"));
const fills = existsSync(fillPath) ? JSON.parse(readFileSync(fillPath, "utf-8")) : null;
const gaps = cov.gaps ?? [];
const filled = fills?.filled ?? [];
const declined = fills?.declined ?? [];

console.log(
  `adversary gaps: ${gaps.length}   filled: ${filled.length}   declined: ${declined.length}`,
);
console.log(
  `items the adversary did NOT find but the corpus has: ${(cov.onlyInCorpus ?? []).length}`,
);
console.log();

// --- why the filler said no. A decline reason repeated across chapters is the adversary's own
// calibration, not a miss: "already taught in an earlier chapter" is it working without a dedup
// library, by design.
if (declined.length) {
  console.log("DECLINED, by reason:");
  const byReason = new Map();
  for (const d of declined) {
    const r = (d.reason ?? d.why ?? "no reason given").trim();
    byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  for (const [r, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${r}`);
  }
  console.log();
}

// --- the half that matters. A cluster among the FILLED items is a rule the upstream passes do not
// have, because these are the items a second reader found and the first ones did not.
if (!filled.length) {
  console.log("nothing was filled — the specialists covered everything the adversary enumerated.");
  process.exit(0);
}

const section = (t) => gaps.find((g) => g.target === t)?.foundIn ?? "(unknown)";
const clusters = new Map();
for (const f of filled) {
  const key = section(f.target ?? "");
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push(f.target ?? "");
}

console.log("FILLED, grouped by where the adversary saw them:");
const ranked = [...clusters].sort((a, b) => b[1].length - a[1].length);
for (const [where, targets] of ranked) {
  console.log(`  ${String(targets.length).padStart(3)}  ${where}`);
  console.log(`       ${targets.slice(0, 6).join("  ")}${targets.length > 6 ? "  …" : ""}`);
}
console.log();

// One number decides whether this is worth a conversation: how concentrated the recoveries are.
// Scattered misses are what a safety net is for. A single dominant cluster is a missing rule.
const [topWhere, topTargets] = ranked[0];
const share = Math.round((topTargets.length / filled.length) * 100);
if (share >= 50 && topTargets.length >= 4) {
  console.log(`⚠  ${share}% of the recoveries come from ONE place: ${topWhere}.`);
  console.log(
    "   That shape is usually a rule the upstream passes are missing rather than a run of",
  );
  console.log(
    "   bad luck. Read those items, decide whether a prompt should have caught them, and",
  );
  console.log("   say so when you hand over the review link.");
} else {
  console.log(`recoveries are spread across ${ranked.length} place(s), the largest ${share}%.`);
  console.log("No single dominant cause — this is the safety net doing ordinary work.");
}

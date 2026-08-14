#!/usr/bin/env node
// Waits for a human to sign a unit off at one of the two review gates, then exits — so the agent
// that handed over the review link can carry straight on without costing the reviewer a message.
//
// Usage:
//   node scripts/await-review.mjs <run-dir> --gate 1        wait for Mark reviewed
//   node scripts/await-review.mjs <run-dir> --gate 2        wait for Mark done AND its rebuild
//   ... --timeout 30m                                       give up after this long (default 30m)
//   ... --interval 15s                                      how often to poll (default 15s)
//
// Exit codes:
//   0  signed off (gate 2: and the collection package really did rebuild)
//   1  timed out with no sign-off
//   2  the unit could not be read — this watch could never have fired (a bug, not patience)
//   3  gate 2 only: marked done, but the package is missing or older than cards.json
//
// It only ever READS. Setting a review flag to unblock a stage defeats the gate that keeps unseen
// cards out of the deck, so this never writes one.
import { resolve } from "path";
import { gateState, parseDuration, formatDuration, GATE_EXIT } from "../src/review/gateState.js";

const args = process.argv.slice(2);

function flagValue(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const flagNames = new Set(["gate", "timeout", "interval"]);
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    if (flagNames.has(args[i].slice(2))) i++; // skip the flag's value
    continue;
  }
  positional.push(args[i]);
}

// ABSOLUTE, resolved here rather than trusted from the caller: the shell's working directory
// persists between calls and drifts the moment anything does a `cd`, and a relative path that stops
// resolving is exactly how a watcher polls forever against a file that can never be read.
const runDir = resolve(positional[0] || "");
const gate = Number(flagValue("gate", "1"));

if (!positional[0] || (gate !== 1 && gate !== 2)) {
  console.error("usage: await-review.mjs <run-dir> --gate 1|2 [--timeout 30m] [--interval 15s]");
  process.exit(2);
}

let timeoutMs;
let intervalMs;
try {
  timeoutMs = parseDuration(flagValue("timeout", "30m"));
  intervalMs = parseDuration(flagValue("interval", "15s"));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const label = gate === 2 ? "Mark done (gate 2)" : "Mark reviewed (gate 1)";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// Sparse on purpose: a monitor that prints every poll floods the thread and gets stopped
// automatically, which is the one failure this tool cannot report.
const HEARTBEAT_MS = 4 * 60_000;

console.log(
  `⏳ watching ${runDir} for ${label}: checking every ${formatDuration(intervalMs)}, giving up after ${formatDuration(timeoutMs)}`,
);

const startedAt = Date.now();
let lastHeartbeat = startedAt;

while (Date.now() - startedAt < timeoutMs) {
  const state = gateState(runDir, gate);

  if (state.status === "unreadable") {
    console.log(`🛑 BUG: ${state.message} — this watcher can never fire. Stopping.`);
    process.exit(GATE_EXIT.unreadable);
  }
  if (state.status === "signed-off") {
    console.log(`✅ ${state.message} — picking it up now`);
    process.exit(GATE_EXIT.signedOff);
  }
  if (state.status === "stale-package") {
    console.log(`⚠️ ${state.message}`);
    process.exit(GATE_EXIT.stalePackage);
  }

  if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = Date.now();
    console.log(`⏳ still waiting (${formatDuration(Date.now() - startedAt)} elapsed)`);
  }
  await sleep(intervalMs);
}

console.log(`⚠️ gave up after ${formatDuration(timeoutMs)} with no sign-off`);
process.exit(GATE_EXIT.timedOut);

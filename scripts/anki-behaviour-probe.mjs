#!/usr/bin/env node
/**
 * Answer three questions about what AnkiConnect really does to a live collection — against a
 * THROWAWAY Anki profile, never yours.
 *
 * ⚠️ READ references/deliver.md ("Live-AnkiConnect behaviour probes") BEFORE RUNNING THIS. It is the
 * runbook: which profile to create, what to build inside it by hand, and how to switch back.
 *
 * ── WHY THIS IS DANGEROUS, AND WHAT MAKES IT SAFE ────────────────────────────────────────────────
 *
 * AnkiConnect listens on 127.0.0.1:8765 and talks to whichever Anki profile is OPEN. The add-on is
 * installed per INSTALLATION, so it is live in every profile, including the one with years of
 * scheduling in it. These probes suspend cards, move cards between decks and rewrite note-type
 * templates. Against the wrong profile that is the exact damage the delivery layer is built to
 * avoid.
 *
 * So the guard is not the instructions. It is a fail-closed INTERLOCK, checked at startup and
 * re-checked immediately before every write:
 *
 *   (a) no "AnkiBuilder …" note type present        (b) zero notes tagged abid:*
 *   (c) the ANKIBUILDER-PROBE-ONLY deck exists,      (d) no deck matches a delivered
 *       and the collection is under 200 CARDS            marker's ankiParent
 *
 * All four must hold. Any one failing stops the run with the reason. Do not relax them.
 *
 * ── WHAT YOU DO BY HAND (never scripted) ─────────────────────────────────────────────────────────
 *
 *   1. In Anki: File > Switch Profile > Add, name it exactly ANKIBUILDER-PROBE, and open it.
 *   2. In that profile, create a deck named exactly ANKIBUILDER-PROBE-ONLY.
 *   3. Add two or three trivial notes to it, then Tools > Create Filtered Deck from
 *      "deck:ANKIBUILDER-PROBE-ONLY", named exactly ANKIBUILDER-PROBE-FILTERED.
 *   4. Run this script.
 *   5. Switch back: File > Switch Profile > your own profile.
 *
 * Resetting between sessions is step 1 again (delete the profile, recreate it). That deletion stays
 * a human step forever: a script that can delete a profile is a script that can delete the wrong
 * one, and no interlock makes that safe.
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────────────────────────
 *   node scripts/anki-behaviour-probe.mjs --check      run ONLY the interlock; writes nothing
 *   node scripts/anki-behaviour-probe.mjs --run        run the probes (writes to the probe profile)
 *   node scripts/anki-behaviour-probe.mjs --run --json print the raw result objects too
 *
 * `--check` is the safe first command every time. There is no default action: a bare invocation
 * prints this usage and exits non-zero, so a mistyped flag can never turn into a write.
 *
 * Record the results in references/deliver.md before any item that depends on them ships.
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";
import {
  PROBE_PROFILE,
  assertInterlock,
  checkInterlock,
  ensureProbeModel,
  runProbes,
} from "../src/anki/behaviourProbe.js";

/**
 * Every `ankiParent` recorded in a delivered marker on disk — interlock condition (d)'s input.
 *
 * THROWS rather than returning `[]` when the output root is missing or unreadable. An empty list
 * makes condition (d) vacuously true, so "I could not read the markers" must never be allowed to
 * look like "nothing has been delivered".
 */
function readDeliveredParents(outputRoot) {
  const root = resolve(outputRoot);
  if (!existsSync(root)) {
    throw new Error(
      `cannot read the delivered markers: ${root} does not exist. The interlock's "no delivered ` +
        `deck is present" condition needs them, and an unreadable output tree must not read as an ` +
        `undelivered one. Run from the repo root, or set ANKI_BUILDER_OUTPUT_ROOT.`,
    );
  }
  const parents = [];
  for (const group of ["epubs", "courses"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const name of readdirSync(groupDir)) {
      const marker = join(groupDir, name, "anki-delivered.json");
      if (!existsSync(marker)) continue;
      const parent = JSON.parse(readFileSync(marker, "utf-8")).ankiParent;
      if (parent) parents.push(parent);
    }
  }
  return parents;
}

const args = process.argv.slice(2);
const wantCheck = args.includes("--check");
const wantRun = args.includes("--run");

if (!wantCheck && !wantRun) {
  console.error(
    [
      "usage: anki-behaviour-probe.mjs --check | --run [--json]",
      "",
      `  --check  run only the fail-closed interlock against whatever profile is open. Writes nothing.`,
      `  --run    run the probes. Only ever against the ${PROBE_PROFILE} profile.`,
      "",
      "There is no default action on purpose. Read references/deliver.md first.",
    ].join("\n"),
  );
  process.exit(1);
}

const outputRoot = process.env.ANKI_BUILDER_OUTPUT_ROOT || "output";
const deliveredParents = readDeliveredParents(outputRoot);
console.error(`delivered parent deck(s) the interlock will refuse: ${deliveredParents.length}`);

const client = createAnkiConnect();

const { ok, checks } = await checkInterlock(client, { deliveredParents });
console.log("\n=== interlock ===");
for (const check of checks) console.log(`  ${check.ok ? "✓" : "✗"} ${check.id}: ${check.detail}`);

if (!ok) {
  console.error(
    `\nthe reachable collection is NOT the throwaway ${PROBE_PROFILE} profile. Nothing was written.`,
  );
  process.exit(1);
}
if (wantCheck && !wantRun) {
  console.log(`\ninterlock clear — this looks like the ${PROBE_PROFILE} profile. Nothing written.`);
  process.exit(0);
}

// The test note type is created only now, after the interlock has passed.
const { created } = await ensureProbeModel(client);
console.error(created ? "created the probe note type" : "probe note type already present");

// Re-asserted before EVERY write. A profile switch mid-run is precisely the accident this catches.
const guard = (stage) => assertInterlock(client, { deliveredParents, stage });

let results;
try {
  results = await runProbes(client, { guard });
} catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}

console.log("\n=== results ===");
for (const result of results) {
  console.log(`\n${result.probe}`);
  if (result.skipped) {
    console.log(`  skipped: ${result.skipped}`);
    continue;
  }
  for (const [question, answer] of Object.entries(result.answers)) {
    console.log(`  ${question}: ${answer}`);
  }
}
if (args.includes("--json")) console.log(`\n${JSON.stringify(results, null, 2)}`);

console.log(
  "\nWrite these answers into references/deliver.md before anything that depends on them ships, " +
    `then switch Anki back to your own profile.`,
);

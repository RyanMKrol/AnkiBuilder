#!/usr/bin/env node
/**
 * Per-pass eval fixtures: run one model pass against a checked-in input whose human-approved output
 * is already in the repo, and print what differs.
 *
 * WHY THIS EXISTS. Every prompt in docs/ is edited by hand, and until now nothing in the repo could
 * tell an improvement from a regression. Chapter extraction is the worst case: an item the prompt
 * stops picking up is never seen by anyone again, so a narrowed rule or a reworded precedence line
 * can silently cost a class of cards and leave no trace. Run this before a prompt edit and again
 * after, and the difference is on screen.
 *
 * IT NEVER PASSES OR FAILS. Extraction is generative — two good runs disagree about a handful of
 * borderline items — so an exact-match assertion would either sit permanently red or force the
 * prompt to be tuned toward one historical sample. The output is EVIDENCE for a person to judge.
 * The exit code says whether the fixture RAN, never whether the result was good.
 *
 * USAGE
 *
 *   # Offline (default). Replays a recorded model response through the real pass. Spends nothing.
 *   node scripts/eval-pass.mjs extraction
 *
 *   # Against the live model, at whatever pinning the pass itself resolves (see PIPELINE.md).
 *   node scripts/eval-pass.mjs extraction --live
 *
 *   # Same, and store the response as the new offline recording.
 *   node scripts/eval-pass.mjs extraction --live --save
 *
 *   # What fixtures exist, and what each one reads.
 *   node scripts/eval-pass.mjs --list
 *
 * The before/after workflow for a prompt edit:
 *
 *   node scripts/eval-pass.mjs extraction --live > /tmp/before.txt
 *   $EDITOR docs/epub-extraction-prompt.md
 *   node scripts/eval-pass.mjs extraction --live > /tmp/after.txt
 *   diff /tmp/before.txt /tmp/after.txt
 *
 * --live spends real money and is blocked outright under `node --test` (src/util/testEnv.js), which
 * is what keeps CI free: the suite only ever runs the recorded mode.
 */
import { existsSync } from "fs";
import { FIXTURES, findFixture, recordedPathFor } from "../src/evals/fixtures.js";
import { readRecording, runFixture, writeRecording } from "../src/evals/runner.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const [name] = args.filter((arg) => !arg.startsWith("--"));

if (flags.has("--list") || !name) {
  console.log("Eval fixtures (node scripts/eval-pass.mjs <name> [--live] [--save]):\n");
  for (const fixture of FIXTURES) {
    const availability = fixture.available();
    console.log(`  ${fixture.name}  —  ${fixture.pass}`);
    console.log(`      module: ${fixture.module}`);
    console.log(`      prompt: ${fixture.prompt}`);
    for (const line of fixture.describe().split("\n")) console.log(`      ${line}`);
    console.log(
      `      recording: ${existsSync(recordedPathFor(fixture.name)) ? "present" : "NONE"}`,
    );
    if (!availability.ok) console.log(`      UNAVAILABLE: ${availability.reason}`);
    console.log("");
  }
  process.exit(flags.has("--list") ? 0 : 1);
}

const fixture = findFixture(name);
if (!fixture) {
  console.error(`unknown fixture "${name}" — try --list`);
  process.exit(2);
}

const live = flags.has("--live");
const recordedPath = recordedPathFor(fixture.name);
const recording = !live && existsSync(recordedPath) ? readRecording(recordedPath) : null;

if (!live && !recording) {
  console.error(
    `no recording at ${recordedPath}. Run once with --live --save to make one, or pass --live.`,
  );
  process.exit(2);
}

const result = runFixture(fixture, {
  mode: live ? "live" : "recorded",
  recording,
  // The pass's OWN default runner, so a live eval resolves exactly the model, effort and timeout
  // that a real pipeline run of this pass would (see the per-pass env scopes in PIPELINE.md). An
  // eval that quietly ran a different pinning than the pipeline would measure nothing useful.
  liveRunClaude: fixture.liveRunClaude,
});

console.log(`# eval: ${fixture.name} (${fixture.pass})`);
console.log(`# mode: ${result.mode}${live ? "" : ` — replayed from ${recordedPath}`}`);
console.log(`# ${fixture.module} · ${fixture.prompt}`);
console.log(fixture.describe());
console.log(`# elapsed: ${(result.elapsedMs / 1000).toFixed(1)}s`);
console.log("");
console.log(result.report);
console.log("");
console.log(
  "# This is a diff, not a verdict. Read it and decide — nothing here passes or fails on its own.",
);

if (live && flags.has("--save")) {
  writeRecording(recordedPath, { fixture, responses: result.responses });
  console.log(`# saved recording to ${recordedPath}`);
}

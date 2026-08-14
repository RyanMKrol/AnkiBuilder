#!/usr/bin/env node
// Re-ask every `audioMarkerStuck` card whether the clip it SHIPS still carries the TTS end marker.
//
// The flag is written by the audio stage when the automatic trim cannot find and cut the `。ででで`
// marker (src/audio/ttsMarker.js). It described the take the stage produced — and nothing but a
// whole new recording ever cleared it, so a reviewer who fixed the clip by hand (which is exactly
// what the badge asks them to do) left a card asserting a fault it no longer had. All seven live
// instances were that: every one had already been hand-cut clear.
//
// ── Why "the detector finds no marker" is NOT the test ────────────────────────────────────────────
//
// These are precisely the clips the detector failed on — that failure is what set the flag. Running
// it again on the hand cut and getting "none found" is the same non-answer, and clearing a flag on
// it would be reasoning from a known-blind instrument. (Measured: of the seven live originals, all
// of which certainly carry the marker, `findEndMarker` locates it in one.)
//
// So the clearing test is POSITIONAL, and it is about where the reviewer put the end of the clip:
//
//   - an appended marker can only be the clip's TRAILING run of separated speech, by construction —
//     it is added after the words and voiced as its own little utterance (see `markerCandidates`);
//   - so if the hand cut ends at or before the start of that run in the original, every sample the
//     marker could occupy is outside the clip that ships.
//
// Both have to agree before a flag is cleared: the cut lands before the trailing run, AND the
// detector finds nothing in the shipping clip. Anything else is reported as unproven and left alone.
//
// It reads audio, so it only reports on clips present on this machine; a card whose file is missing
// is listed as unchecked rather than silently passed.
//
// Usage:
//   node scripts/audit-marker-stuck.mjs                  # report (default)
//   node scripts/audit-marker-stuck.mjs --apply          # clear the flags that are demonstrably gone
//   node scripts/audit-marker-stuck.mjs --all            # check EVERY clip, not just the flagged
import { existsSync } from "fs";
import { join } from "path";
import { scanWorkspace, listUnitDirs, loadUnit } from "../src/audit/units.js";
import { findEndMarker, detectSegments } from "../src/audio/trimSilence.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const checkAll = args.includes("--all");
const outputRoot = args.find((a) => !a.startsWith("--")) || "output";

if (args.includes("--help")) {
  console.log(
    [
      "usage: audit-marker-stuck.mjs [--apply] [--all] [output-root]",
      "  Re-checks each flagged card's SHIPPING clip for an unstripped TTS end marker.",
      "  --apply clears the flag where the marker is demonstrably gone. --all checks every clip.",
    ].join("\n"),
  );
  process.exit(0);
}

/**
 * Where the clip's trailing run of separated speech begins — the only place an appended marker can
 * be. Null when the clip is one continuous run (nothing was appended, or nothing is separable).
 */
function trailingRunStart(path) {
  const parsed = detectSegments(path);
  if (!parsed || parsed.speech.length < 2) return null;
  return parsed.speech[parsed.speech.length - 1][0];
}

const scan = scanWorkspace(outputRoot);
if (scan.missing || scan.collections.length === 0) {
  console.log(`(no collections found under ${scan.root})`);
  process.exit(0);
}

const totals = { checked: 0, stillStuck: 0, cleared: 0, unproven: 0, unchecked: 0, newlyFound: 0 };

for (const collection of scan.collections) {
  for (const unitDir of listUnitDirs(collection)) {
    const unit = loadUnit(unitDir);
    const entry = unit.files["cards.json"];
    if (!entry?.present || entry.error) continue;
    const audioDir = join(unitDir.dir ?? unitDir, "audio");

    let touched = 0;
    for (const item of entry.data.items || []) {
      const flagged = item.audioMarkerStuck === true;
      if (!flagged && !checkAll) continue;
      // Only a take generated WITH the marker can be carrying one.
      if (!item.audioMarked && !flagged) continue;
      if (!item.audio) continue;

      const shipping = join(audioDir, item.audio);
      if (!existsSync(shipping)) {
        totals.unchecked++;
        console.log(`?  ${unit.name}/${item.id} — ${item.audio} is not on this machine`);
        continue;
      }

      totals.checked++;
      const label = `${unit.name}/${item.id}  "${item.target}"`;
      const found = findEndMarker(shipping);

      if (found) {
        if (flagged) {
          totals.stillStuck++;
          console.log(`✗  ${label} — marker still audible at ${found[0].toFixed(2)}s`);
        } else {
          totals.newlyFound++;
          console.log(`✗  ${label} — marker audible but NOT flagged, at ${found[0].toFixed(2)}s`);
          item.audioMarkerStuck = true;
          touched++;
        }
        continue;
      }
      if (!flagged) continue;

      // The detector found nothing — which on exactly these clips proves nothing. Ask where the
      // reviewer put the end of the clip instead.
      const original = item.audioOriginal ? join(audioDir, item.audioOriginal) : null;
      const cutEnd = item.audioTrim?.end;
      const runStart = original && existsSync(original) ? trailingRunStart(original) : null;

      if (Number.isFinite(cutEnd) && runStart != null && cutEnd <= runStart + 1e-6) {
        totals.cleared++;
        console.log(
          `✓  ${label} — hand cut ends at ${cutEnd.toFixed(2)}s, before the original's trailing run at ${runStart.toFixed(2)}s`,
        );
        delete item.audioMarkerStuck;
        touched++;
      } else {
        totals.unproven++;
        console.log(
          `·  ${label} — detector finds no marker, but nothing proves it was cut` +
            (Number.isFinite(cutEnd) ? ` (cut ends ${cutEnd.toFixed(2)}s` : " (no hand cut") +
            (runStart == null
              ? ", no trailing run in the original)"
              : `, run starts ${runStart.toFixed(2)}s)`) +
            " — left flagged",
        );
      }
    }

    if (touched && apply) {
      writeUnitJson(entry.path, entry.data, { reason: "audit-marker-stuck" });
    }
  }
}

console.log(
  [
    "",
    `${totals.checked} clip(s) checked`,
    `  ${totals.stillStuck} still carry the marker`,
    `  ${totals.cleared} flagged clip(s) ${apply ? "cleared" : "would be cleared"} — cut away, and the detector agrees`,
    ...(totals.unproven
      ? [`  ${totals.unproven} left flagged — no positive evidence either way`]
      : []),
    ...(totals.newlyFound
      ? [`  ${totals.newlyFound} unflagged clip(s) ${apply ? "flagged" : "would be flagged"}`]
      : []),
    ...(totals.unchecked
      ? [`  ${totals.unchecked} not checked — audio absent on this machine`]
      : []),
  ].join("\n"),
);
if (!apply && (totals.cleared || totals.newlyFound)) {
  console.log("\n(nothing written — re-run with --apply)");
}

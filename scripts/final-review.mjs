#!/usr/bin/env node
// The last look at a chapter before its audio is paid for.
//
//   node scripts/final-review.mjs <collectionDir> <chapterNumber> --lang ja --dry
//   node scripts/final-review.mjs <collectionDir> <chapterNumber> --lang ja
//
// ⚠️ SPENDS. One Opus call per run. Always `--dry` first: it assembles everything, prints what would
// be sent and what the deterministic side already knows, and calls no model.
//
// WHAT IT TIES TOGETHER, AND WHY THAT IS THE POINT. This repo computes a great deal and then leaves
// it in a report. `preflight` emits INFO findings nobody is obliged to read; the phases now record
// every agent's raw response; the drill-shape module measures a unit's concentration and refuses to
// judge it. Each is correct in isolation and none of them closes the loop. This script is the loop:
// it runs the deterministic checks, gathers the transcripts, and hands BOTH to a role pinned above
// everything that produced the chapter, together with the chapter itself.
//
// The division of labour is deliberate and is the finding that shaped it. Code computes the facts,
// because arithmetic over cards is exact and free. The agent supplies the one thing code cannot —
// what the chapter actually teaches — and the comparison becomes mechanical again. See the
// calibration note in src/cards/drillShape.js for why the reverse (a threshold on concentration)
// was measured, found to flag the units that are correct, and abandoned.

import { existsSync, readFileSync } from "fs";
import { join, resolve, basename } from "path";
import { audit } from "../src/audit/index.js";
import { readRunLogs, hasRunLogs } from "../src/agents/runLog.js";
import { reviewChapter, summarizeTranscripts } from "../src/agents/finalReview.js";
import {
  dominantFrame,
  frameDistribution,
  itemsOnlyInFrame,
  drillCoverage,
} from "../src/cards/drillShape.js";
import { chapterCachePath } from "../src/corpus/epubLibrary.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const langAt = argv.indexOf("--lang");
const targetLanguage = langAt === -1 ? null : argv[langAt + 1];

if (positional.length < 2) {
  console.error(
    "usage: node scripts/final-review.mjs <collectionDir> <chapterNumber> --lang <code> [--dry]",
  );
  process.exit(2);
}

const collectionDir = resolve(positional[0]);
const chapterNumber = String(positional[1]);
const baseDir = join(collectionDir, `chapter-${chapterNumber}`);
const extrasDir = join(collectionDir, `chapter-${chapterNumber}-extras`);

for (const dir of [baseDir, extrasDir]) {
  if (!existsSync(join(dir, "cards.json"))) {
    console.error(`no cards.json in ${dir}`);
    process.exit(2);
  }
}

const readCards = (dir) => JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
const baseCards = readCards(baseDir);
const extrasCards = readCards(extrasDir);
const shipped = (cards) => cards.items.filter((i) => !i.excluded);

// ── the chapter, from the same cache the extraction model read ───────────────────────────────────
const { epubHash, chapterNumber: spine } = baseCards.meta ?? {};
const chapterFilePath = epubHash && spine != null ? chapterCachePath(epubHash, spine) : null;
if (!chapterFilePath || !existsSync(chapterFilePath)) {
  console.error(
    `chapter not cached for this unit (epubHash=${epubHash}, spine=${spine}) — ` +
      `the review must read the chapter, so this cannot run without it`,
  );
  process.exit(2);
}

// ── the deterministic half ───────────────────────────────────────────────────────────────────────
const units = new Set([basename(baseDir), basename(extrasDir)]);
const result = audit({ collectionDir });
const relevant = result.results.filter((r) => {
  if (!r.findings?.length) return false;
  const unit = r.target?.split("/").slice(1).join("/");
  return r.scope === "collection" || units.has(unit ?? "");
});

const checkFindings = relevant.map((r) => ({
  check: r.id,
  tier: r.tier,
  target: r.target,
  summary: r.summary,
  findings: r.findings.map((f) => (typeof f === "string" ? f : f.message)),
}));

const frame = dominantFrame(extrasCards.items);
const deterministic = {
  drillShape: {
    dominantFrame: frame,
    topFrames: frameDistribution(extrasCards.items).slice(0, 5),
    taughtItemsDrilledOnlyInDominantFrame: itemsOnlyInFrame(
      baseCards.items,
      extrasCards.items,
      frame?.frame,
    ).map(({ item, count }) => ({ id: item.id, target: item.target, sentences: count })),
    leastDrilled: drillCoverage(baseCards.items, extrasCards.items)
      .slice(0, 15)
      .map(({ item, count }) => ({ id: item.id, target: item.target, sentences: count })),
  },
  checks: checkFindings,
};

// ── the transcripts ──────────────────────────────────────────────────────────────────────────────
const logs = [...readRunLogs(baseDir), ...readRunLogs(extrasDir)];
const transcripts = summarizeTranscripts(logs);
const transcriptsPresent = hasRunLogs(baseDir) || hasRunLogs(extrasDir);

console.log(`chapter:  ${chapterFilePath}`);
console.log(`base:     ${baseDir}  (${shipped(baseCards).length} shipping)`);
console.log(`extras:   ${extrasDir}  (${shipped(extrasCards).length} shipping)`);
console.log(
  `checks:   ${checkFindings.length} check(s) with findings ` +
    `(${checkFindings.filter((c) => c.tier === "FAIL").length} FAIL, ` +
    `${checkFindings.filter((c) => c.tier === "ACK").length} ACK, ` +
    `${checkFindings.filter((c) => c.tier === "INFO").length} INFO)`,
);
console.log(
  `frame:    ${frame ? `"${frame.frame}" in ${frame.count}/${frame.total} (${Math.round(frame.share * 100)}%)` : "no dominant frame"}`,
);
console.log(
  `logs:     ${transcriptsPresent ? `${logs.length} transcript(s)` : "NONE — this chapter predates transcript recording, so the review runs with less evidence"}`,
);

if (dry) {
  console.log(`\n--dry: nothing sent. Re-run without --dry to spend one Opus call.`);
  process.exit(0);
}

const review = reviewChapter({
  chapterFilePath,
  baseItems: baseCards.items,
  extrasItems: extrasCards.items,
  deterministic,
  transcripts,
  targetLanguage: targetLanguage ?? baseCards.meta?.targetLanguage ?? "ja",
});

console.log(`\n${"═".repeat(78)}\nANSWERS\n${"═".repeat(78)}`);
for (const [key, value] of Object.entries(review.answers)) {
  console.log(`\n▶ ${key}\n${value}`);
}

console.log(`\n${"═".repeat(78)}\nFINDINGS (${review.findings.length})\n${"═".repeat(78)}`);
if (!review.findings.length) console.log("none");
for (const f of review.findings) {
  console.log(`\n[${f.severity}] ${f.area}: ${f.summary}`);
  if (f.evidence) console.log(`   evidence:   ${f.evidence}`);
  if (f.suggestion) console.log(`   suggestion: ${f.suggestion}`);
}
if (review.notes) console.log(`\nnotes: ${review.notes}`);

// The verdict is recomputed from the findings, never taken from the response. A model that reports a
// blocker and then calls the chapter ready has contradicted itself, and the findings carry evidence.
console.log(
  `\nverdict: ${review.verdict}${review.blockers.length ? ` (${review.blockers.length} blocker(s))` : ""}`,
);
if (review.claimedVerdict && review.claimedVerdict !== review.verdict) {
  console.log(
    `  note: the model said "${review.claimedVerdict}"; the verdict above is derived from its own findings`,
  );
}
process.exit(review.blockers.length ? 1 : 0);

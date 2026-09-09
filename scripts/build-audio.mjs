#!/usr/bin/env node
// Phase 3: generate a chapter's audio, for BOTH its units, in one run.
//
// Usage:
//   node scripts/build-audio.mjs <collectionDir> <chapterNumber> --lang <code> [--dry]
//
// v2 gives a chapter's two units one shared audio review, so their clips are generated together
// rather than months apart. The gate is chapter-level: both corpus reviews must be signed off first
// (src/review/chapterGate.js), because generating between the two reviews splits one review into two
// and re-introduces the second visit the design removed.
//
// ⚠️ IT SPENDS REAL MONEY. Every uncached clip is a paid ElevenLabs fetch. --dry first, always: it
// runs the refetch audit and the readiness check and fetches nothing.
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { chapterUnits, chapterAudioReadiness } from "../src/review/chapterGate.js";
import { parseUnitDir } from "../src/model/unitDir.js";
import { auditChapterRefetch, describeRefetchAudit } from "../src/audio/refetchAudit.js";

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const dry = argv.includes("--dry");
const langAt = argv.indexOf("--lang");
const targetLanguage = langAt === -1 ? "ja" : argv[langAt + 1];

if (positional.length < 2) {
  console.error("usage: build-audio.mjs <collectionDir> <chapterNumber> --lang <code> [--dry]");
  process.exit(1);
}

const collectionDir = resolve(positional[0]);
const chapterNumber = Number(positional[1]);
if (!existsSync(collectionDir)) {
  console.error(`no collection at ${collectionDir}`);
  process.exit(1);
}

const units = chapterUnits(collectionDir, chapterNumber);
const readiness = chapterAudioReadiness(units);

console.log(`chapter ${chapterNumber}: ${units.map((u) => u.name).join(", ") || "(no units)"}`);

if (!readiness.ok) {
  // THE TWO NUMBERS A CHAPTER HAS, AND WHY THIS MESSAGE EXISTS.
  //
  // A unit is `chapter-16` and its `meta.chapterNumber` is spine file 38. This script takes the UNIT
  // number, because that is what names the directory; `assemble --lesson` resolves and reports the
  // SPINE number. Pass the wrong one and the readiness check honestly reports "no units found for
  // this chapter", which reads like a missing chapter rather than a wrong argument.
  //
  // So before giving up, look for a unit whose spine number is what was typed, and name the unit
  // number to use instead.
  if (units.length === 0) {
    const bySpine = readdirSync(collectionDir)
      .map((name) => ({ name, unit: parseUnitDir(name) }))
      .filter(({ unit }) => unit && !unit.extras)
      .map(({ name, unit }) => {
        const cards = join(collectionDir, name, "cards.json");
        if (!existsSync(cards)) return null;
        try {
          const meta = JSON.parse(readFileSync(cards, "utf-8")).meta ?? {};
          return meta.chapterNumber === chapterNumber ? { name, number: unit.number } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (bySpine.length) {
      const hit = bySpine[0];
      console.error(
        `\nno unit is numbered ${chapterNumber}, but ${hit.name} has chapterNumber ${chapterNumber} ` +
          `(that is its SPINE file, not its unit number).\n` +
          `This script takes the unit number, so you want:  ${hit.number}`,
      );
      process.exit(2);
    }
  }
  console.error(`\nnot ready: ${readiness.reason}`);
  process.exit(2);
}

// Read the cards so the audit sees what actually ships.
const withCards = units.map((unit) => {
  const cards = JSON.parse(readFileSync(`${unit.dir}/cards.json`, "utf-8"));
  return { name: unit.name, dir: unit.dir, items: cards.items ?? [], meta: cards.meta ?? {} };
});

const audit = auditChapterRefetch(withCards, targetLanguage);
console.log(describeRefetchAudit(audit));

if (audit.refetch.length) {
  console.error(
    `\n⚠️ ${audit.refetch.length} card(s) ship a clip their current text no longer asks for. That is ` +
      `the derivation drifting, and running now re-buys them. Investigate before spending:`,
  );
  for (const r of audit.refetch.slice(0, 5)) {
    console.error(`   ${r.unit}/${r.id}: ships ${r.ships}, wants ${r.wants}`);
  }
  if (!dry) process.exit(3);
}

if (dry) {
  console.log(
    `\n--dry: nothing fetched. Both units are signed off at the corpus gate and the audit is ` +
      `${audit.refetch.length === 0 ? "clean" : "NOT clean"}.`,
  );
  console.log(
    `Re-run without --dry to generate, then: one audio review at /chapter/<type>/<id>/${chapterNumber}`,
  );
  process.exit(0);
}

// The generation itself is v1's, unchanged and deliberately so: src/audio is the most portable code
// in the repo and the most expensive to get wrong, so v2 drives it rather than reimplementing it.
console.log(`\nrun the audio stage for each unit, then review both at once:`);
for (const unit of withCards) {
  console.log(`   node src/cli/bin.js audio --run ${unit.dir}`);
}
console.log(`   then: /chapter/<type>/<id>/${chapterNumber}`);

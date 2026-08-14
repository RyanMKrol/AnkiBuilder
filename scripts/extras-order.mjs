#!/usr/bin/env node
// Orders an extras unit for shipping (extras-pass.md, "Order the unit"): a SEEDED shuffle of the
// whole unit (built order groups siblings, and neighbours leak answers), then the unit's
// foundations hoisted to the front, shortest first. Keeps corpus.json in the same order.
//
// Usage:
//   node scripts/extras-order.mjs <run-dir>                 preview the resulting order (always
//                                                           allowed — a preview writes nothing)
//   node scripts/extras-order.mjs <run-dir> --apply         write cards.json + corpus.json
//   ... --seed <text>                                       override the seed (default: the
//                                                           unit folder name, so re-runs and
//                                                           re-imports keep one stable order)
//   ... --force                                             allow a reviewed/done unit
//   ... --force-delivered                                   allow a DELIVERED collection (needs
//                                                           --force too — see src/audit/state.js)
import { readFileSync, existsSync } from "fs";
import { join, resolve, basename } from "path";
import { orderExtrasUnit } from "../src/cards/extrasTools.js";
import { assertMutationAllowed, MutationRefused } from "../src/audit/state.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = args.includes("--force");
const forceDelivered = args.includes("--force-delivered");
const seedIndex = args.indexOf("--seed");
// Guard the -1: with no --seed, seedIndex + 1 is 0, which would drop argv[0] — the run dir itself —
// and the script could then only ever run WITH --seed, i.e. never in its documented default form.
const seedValueIndex = seedIndex >= 0 ? seedIndex + 1 : -1;
const positional = args.filter((a, i) => !a.startsWith("--") && i !== seedValueIndex);
const runDir = resolve(positional[0] || "");
const seed = seedIndex >= 0 ? args[seedIndex + 1] : basename(runDir);

const cardsPath = join(runDir, "cards.json");
if (!runDir || !existsSync(cardsPath)) {
  console.error("usage: extras-order.mjs <run-dir> [--seed <text>] [--apply] [--force]");
  process.exit(1);
}

const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
// Re-ordering a signed-off unit changes what was approved (--force); re-ordering a DELIVERED one
// also changes nothing the learner sees, because new-card position is not deliverable — which makes
// it a write against live cards with no upside, and its own flag.
if (apply) {
  try {
    assertMutationAllowed(runDir, { force, forceDelivered, action: "re-order" });
  } catch (e) {
    if (!(e instanceof MutationRefused)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

const { items, foundations } = orderExtrasUnit(cards.items || [], { seed });

console.log(`seed: ${JSON.stringify(seed)}`);
if (foundations.length > 0) {
  console.log(`hoisted ${foundations.length} foundation(s), shortest first:`);
  for (const f of foundations) console.log(`  ${f.id}: ${f.target}`);
} else {
  console.log("no shared atoms in this unit — nothing hoisted (that's fine)");
}
console.log("\nresulting order:");
items.forEach((item, i) => console.log(`  ${String(i + 1).padStart(3)}. ${item.id}`));

if (!apply) {
  console.log("\npreview only — re-run with --apply to write");
  process.exit(0);
}

cards.items = items;
const cardsWrite = writeUnitJson(cardsPath, cards, { reason: "extras-order" });
if (cardsWrite.backup) console.log(`\nbackup: ${cardsWrite.backup}`);

// corpus.json must follow, or the reviews and the deck disagree on order.
const corpusPath = join(runDir, "corpus.json");
if (existsSync(corpusPath)) {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
  const orderById = new Map(items.map((item, index) => [item.id, index]));
  (corpus.items || []).sort(
    (a, b) =>
      (orderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const corpusWrite = writeUnitJson(corpusPath, corpus, { reason: "extras-order" });
  if (corpusWrite.backup) console.log(`backup: ${corpusWrite.backup}`);
  console.log("\nwrote cards.json and corpus.json (same order)");
} else {
  console.log("\nwrote cards.json (no corpus.json present)");
}

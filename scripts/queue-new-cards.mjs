#!/usr/bin/env node
// Put the next new cards from chosen chapters straight into today's learning queue, so they show up
// when you study the top-level deck. Set that deck's new cards/day to 0 in Anki, then run this once a
// day. Running it again the same day only tops each chapter up to --per, it never adds a second batch.
//
// Usage:
//   node scripts/queue-new-cards.mjs --chapters 0,6,8,12 [--deck <name>] [--per 5] [--dry-run]
//     --chapters <list>   chapter numbers, as in the deck names ("Chapter 06: ..." is 6)
//     --deck <name>       the top-level deck (default: "Genki I (Reading)")
//     --per <n>           new cards per chapter per day (default: 5)
//     --dry-run           show what would be queued and change nothing
//
// The cards it picks are the next ones in each chapter by position, the same ones Anki would show.
// Every run that changes something appends what it did to anki-backups/queue-new-cards.jsonl,
// including each card's original position, so any card can be put back as new. Anki must be open
// with the AnkiConnect add-on.
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";
import { queueNewCards } from "../src/anki/queueNewCards.js";

const args = process.argv.slice(2);

// The usage is the comment block at the top of this file, so the two cannot drift.
const usage = () => {
  const lines = readFileSync(fileURLToPath(import.meta.url), "utf-8")
    .split("\n")
    .slice(1);
  const end = lines.findIndex((l) => !l.startsWith("//"));
  return lines
    .slice(0, end)
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n");
};
if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(usage());
  process.exit(0);
}

// An unknown flag is refused, never ignored (same rule as deliver-to-anki.mjs).
const VALUE_FLAGS = new Set(["--chapters", "--deck", "--per"]);
const values = {};
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    const v = args[i + 1];
    if (v == null || v.startsWith("--")) {
      console.error(`${a} needs a value. Nothing was done. See --help.`);
      process.exit(1);
    }
    values[a] = v;
    i++;
  } else if (a === "--dry-run") {
    dryRun = true;
  } else {
    console.error(`unknown argument "${a}". Nothing was done. See --help.`);
    process.exit(1);
  }
}

if (!values["--chapters"]) {
  console.error("--chapters is required, e.g. --chapters 0,6,8,12. Nothing was done.");
  process.exit(1);
}
const chapters = values["--chapters"].split(",").map((s) => s.trim());
if (chapters.some((c) => !/^\d+$/.test(c))) {
  console.error(`--chapters takes numbers separated by commas, got "${values["--chapters"]}".`);
  process.exit(1);
}
const perDeck = values["--per"] == null ? 5 : Number(values["--per"]);
if (!Number.isInteger(perDeck) || perDeck < 1) {
  console.error(`--per takes a whole number of 1 or more, got "${values["--per"]}".`);
  process.exit(1);
}
const parent = values["--deck"] ?? "Genki I (Reading)";

let results;
try {
  results = await queueNewCards({
    client: createAnkiConnect(),
    parent,
    chapters: chapters.map(Number),
    perDeck,
    dryRun,
  });
} catch (e) {
  console.error(`\nqueue-new-cards failed: ${e.message}`);
  process.exit(1);
}

const strip = (html) => html.replace(/<[^>]*>/g, "").trim();
let total = 0;
for (const r of results) {
  const before = r.introducedToday + r.queuedNotStudied;
  const head = `${r.deck.split("::").pop()}: ${before} already today`;
  if (r.queued.length === 0) {
    console.log(
      `${head}, ${r.newLeft === 0 ? "no new cards left in this chapter" : "nothing to add"}`,
    );
    continue;
  }
  total += r.queued.length;
  console.log(`${head}, ${dryRun ? "would queue" : "queued"} ${r.queued.length}:`);
  console.log(`  ${r.queued.map((c) => strip(c.front)).join("  ")}`);
  if (r.queued.length < perDeck - before) console.log(`  (that was the last of its new cards)`);
}
console.log(
  dryRun
    ? `\ndry run: ${total} card(s) would be queued. Nothing was changed.`
    : `\n${total} card(s) are now in learning. Study "${parent}" to see them.`,
);

if (!dryRun && total > 0) {
  const backupRoot = resolve(process.env.ANKI_BUILDER_BACKUP_ROOT || "anki-backups");
  mkdirSync(backupRoot, { recursive: true });
  appendFileSync(
    join(backupRoot, "queue-new-cards.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), parent, perDeck, results }) + "\n",
  );
}

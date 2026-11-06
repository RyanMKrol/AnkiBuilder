#!/usr/bin/env node
// Put the next new cards from chosen chapters straight into today's learning queue, so they show up
// when you study the top-level deck. Set that deck's new cards/day to 0 in Anki, then run this once a
// day (or use the "+5 new" button on the dashboard, which does the same thing for one chapter).
// Running it again the same day only tops each chapter up to --per, it never adds a second batch.
//
// Usage:
//   node scripts/queue-new-cards.mjs --chapters 0,6,8,12 [--deck <name>] [--per 5] [--dry-run]
//   node scripts/queue-new-cards.mjs --undo-last [--deck <name>]
//     --chapters <list>   chapter numbers, as in the deck names ("Chapter 06: ..." is 6)
//     --deck <name>       the top-level deck (default: "Genki I (Reading)")
//     --per <n>           new cards per chapter per day (default: 5)
//     --dry-run           show what would be queued and change nothing (no sync, no backup)
//     --undo-last         put the last batch queued for --deck back as new cards, at their old
//                         positions. A card you have already studied is left alone.
//
// Every real run syncs with AnkiWeb, backs up the deck with its scheduling to
// anki-backups/queue-new/, makes the change, then syncs again. If the first sync or the backup fails,
// nothing is changed. Each run is logged, with the cards it moved and their original positions, to
// anki-backups/queue-new-cards.jsonl. Anki must be open with the AnkiConnect add-on.
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { createAnkiConnect } from "../src/anki/ankiConnect.js";
import {
  QUEUE_LOG,
  queueNewCards,
  unqueueCards,
  withSafetyNet,
} from "../src/anki/queueNewCards.js";

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
const BOOL_FLAGS = new Set(["--dry-run", "--undo-last"]);
const values = {};
const flags = new Set();
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
  } else if (BOOL_FLAGS.has(a)) {
    flags.add(a);
  } else {
    console.error(`unknown argument "${a}". Nothing was done. See --help.`);
    process.exit(1);
  }
}

const parent = values["--deck"] ?? "Genki I (Reading)";
const backupRoot = resolve(process.env.ANKI_BUILDER_BACKUP_ROOT || "anki-backups");
const client = createAnkiConnect();
const strip = (html) => html.replace(/<[^>]*>/g, "").trim();
const fail = (e) => {
  console.error(`\nqueue-new-cards failed: ${e.message}`);
  process.exit(1);
};
const afterSync = (run) => {
  console.log(`backup: ${run.backupDir}`);
  if (!run.syncedAfter) console.log(`the sync afterwards FAILED (${run.syncError}): sync in Anki`);
};

if (flags.has("--undo-last")) {
  const logFile = join(backupRoot, QUEUE_LOG);
  const entries = existsSync(logFile)
    ? readFileSync(logFile, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((e) => e.parent === parent && !e.error)
    : [];
  const last = entries.at(-1);
  if (!last || last.action !== "queue") {
    console.error(
      last ? "the last run for this deck was already an undo." : "nothing has been queued yet.",
    );
    process.exit(1);
  }
  const cards = last.result.flatMap((r) => r.queued);
  let run;
  try {
    run = await withSafetyNet({
      client,
      parent,
      action: "undo",
      backupRoot,
      change: () => unqueueCards({ client, cards }),
    });
  } catch (e) {
    fail(e);
  }
  const { restored, kept } = run.result;
  console.log(`put ${restored.length} card(s) back as new, from the batch queued at ${last.at}`);
  for (const k of kept) console.log(`  left alone: ${strip(k.front)} (${k.reason})`);
  afterSync(run);
  process.exit(0);
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
const dryRun = flags.has("--dry-run");
const queue = () =>
  queueNewCards({ client, parent, chapters: chapters.map(Number), perDeck, dryRun });

let run;
try {
  // A dry run reads only, so it needs no sync and no backup.
  run = dryRun
    ? { result: await queue() }
    : await withSafetyNet({ client, parent, action: "queue", backupRoot, change: queue });
} catch (e) {
  fail(e);
}

let total = 0;
for (const r of run.result) {
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
if (!dryRun) afterSync(run);

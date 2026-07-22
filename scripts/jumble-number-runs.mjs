#!/usr/bin/env node
// One-off: de-sequence number runs in existing decks. For each unit, an LLM finds contiguous runs of
// cards teaching ascending numbers/counters (1,2,3…; minutes; o'clock; …) and returns the full id
// order with ONLY those runs shuffled — non-number cards keep their exact positions, and each run stays
// contiguous. cards.json is reordered to match; corpus.json (a subset) is reordered to follow the same
// relative order. Backs up each changed file to <file>.pre-jumble.bak. See docs/pedagogical-sort-prompt.md
// principle 6 / the SKILL "Jumble any run of sequential numbers" note.
//
// Usage: node scripts/jumble-number-runs.mjs [--dry] [file ...]   (no files → scans output/ cards.json)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { runClaude } from "../src/translate/runClaude.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const explicit = args.filter((a) => a !== "--dry");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "cards.json") out.push(p);
  }
  return out;
}
const files = explicit.length ? explicit : existsSync("output") ? walk("output") : [];

// Cheap pre-filter: only ask the model about a unit that plausibly has a number run (≥3 number-ish
// cards). Keeps the pass off decks with no numbers.
const NUMWORD =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|o'?clock|minute|floor|yen|first|second|third)\b/i;
const looksNumber = (c) => NUMWORD.test(c.english || "") || /[0-9０-９]/.test(c.target || "");

// The LLM only IDENTIFIES the runs (it's unreliable at producing a real random permutation — it tends
// to interleave sorted sub-lists). The actual shuffle is Fisher-Yates below.
const PROMPT = (rows) =>
  [
    "Below is one lesson's flashcards IN ORDER. Identify every CONTIGUOUS run of cards that teaches a",
    "sequence of numbers or counters in ASCENDING order — e.g. 1,2,3,4,5; one/two/three minutes;",
    "one/two/three o'clock; floors; climbing prices. A run is 2+ adjacent cards whose numeric values go",
    "up. Treat separate counters as separate runs (a minutes run and an o'clock run are independent).",
    "Do NOT include non-number cards, and do NOT include a lone number that isn't part of an ascending",
    "adjacent run.",
    "",
    'Return ONLY a JSON object: {"runs": [["id","id",…], …]} — each inner array lists the ids of ONE run',
    "in their current order. Return {\"runs\": []} if there are no ascending number runs.",
    "",
    "Cards:",
    JSON.stringify(
      rows.map((c) => ({ id: c.id, english: c.english, target: c.target })),
      null,
      2,
    ),
  ].join("\n");

function parseRuns(text, idSet) {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("no JSON object in output");
  const runs = JSON.parse(text.slice(a, b + 1)).runs;
  if (!Array.isArray(runs)) throw new Error("no `runs` array");
  for (const run of runs) {
    if (!Array.isArray(run) || run.some((id) => !idSet.has(id)))
      throw new Error("a run references an unknown id");
  }
  return runs.filter((r) => r.length >= 2);
}

// Fisher-Yates, guaranteed to differ from the input for length >= 2 (retry a few times).
function shuffledDistinct(arr) {
  const orig = arr.join("");
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.join("") !== orig) return a;
  }
  return arr.slice().reverse();
}

// Reorder `items` to `order` (an id list); ids not in `order` keep their relative order at the end.
const reorder = (items, order) => {
  const rank = new Map(order.map((id, i) => [id, i]));
  return items
    .map((it, i) => [it, rank.has(it.id) ? rank.get(it.id) : order.length + i])
    .sort((x, y) => x[1] - y[1])
    .map(([it]) => it);
};

// Apply the run shuffles positionally: each run's slots (its ids' indices) are refilled with the run's
// ids shuffled — so runs stay contiguous and non-number cards never move. Returns the new id order.
function jumbleOrder(items, runs) {
  const idOrder = items.map((i) => i.id);
  for (const run of runs) {
    const positions = run.map((id) => idOrder.indexOf(id)).sort((a, b) => a - b);
    const shuffled = shuffledDistinct(run);
    positions.forEach((pos, k) => {
      idOrder[pos] = shuffled[k];
    });
  }
  return idOrder;
}

let changed = 0,
  runsShuffled = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const cards = JSON.parse(readFileSync(file, "utf-8"));
  const items = cards.items || [];
  if (items.filter(looksNumber).length < 3) continue; // no plausible run

  let runs;
  try {
    runs = parseRuns(runClaude(PROMPT(items)), new Set(items.map((i) => i.id)));
  } catch (e) {
    console.error(`${file}: FAILED (${e.message}) — unchanged`);
    continue;
  }
  if (runs.length === 0) {
    console.error(`${file}: no number run to jumble`);
    continue;
  }
  const order = jumbleOrder(items, runs);
  runsShuffled++;
  console.error(`${file}: jumbled ${runs.length} number run(s) (${runs.map((r) => r.length).join(", ")} cards)`);
  if (dry) {
    const map = new Map(items.map((i) => [i.id, i.english]));
    console.log("  " + order.map((id) => map.get(id)).join("  |  "));
    continue;
  }

  cards.items = reorder(items, order);
  writeBackup(file);
  writeFileSync(file, JSON.stringify(cards, null, 2) + "\n");
  changed++;

  // Keep corpus.json (a subset — no fill-in-blank cards) in the same relative order.
  const corpusPath = join(dirname(file), "corpus.json");
  if (existsSync(corpusPath)) {
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    corpus.items = reorder(corpus.items || [], order);
    writeBackup(corpusPath);
    writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n");
  }
}

function writeBackup(f) {
  const bak = f + ".pre-jumble.bak";
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(f));
}

console.error(
  dry ? `dry run — ${runsShuffled} unit(s) have a number run.` : `done — reordered ${changed} cards.json file(s).`,
);

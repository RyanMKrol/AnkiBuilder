#!/usr/bin/env node
// One-off: de-sequence number runs in existing decks. For each unit, an LLM finds contiguous blocks of
// number/counter cards — both plain ascending runs (1,2,3…; minutes; o'clock; …) AND interleaved blocks
// where several counters climb in parallel (1-flat, 1-long, 1-general, 2-general, 3-flat…) — and returns
// the full id order with ONLY those blocks shuffled. Non-number cards keep their exact positions, and
// each block stays contiguous. cards.json is reordered to match; corpus.json (a subset) is reordered to follow the same
// relative order. Backs up each changed file to <file>.pre-jumble-<stamp>.bak. See docs/pedagogical-sort-prompt.md
// principle 6 / the SKILL "Jumble any run of sequential numbers" note.
//
// Usage: node scripts/jumble-number-runs.mjs [--dry] [file ...]   (no files → scans output/ cards.json)
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { runClaude } from "../src/translate/runClaude.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

// Tag in the stamped backup name: <file>.pre-jumble-<YYYYMMDDHHmm>.bak
const REASON = "jumble";

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
    "Below is one lesson's flashcards IN ORDER. Find every place where the card order lets a learner",
    "PREDICT the next number instead of recalling it — those are what we shuffle. Return each as a run.",
    "",
    "A run is a MAXIMAL CONTIGUOUS block of 2+ adjacent number/counter cards (each teaching a number, a",
    "count, a time, a floor, a price, etc.). Two shapes both count as ONE run:",
    "  (a) a plain ascending sequence: 1,2,3,4,5; one/two/three minutes; one/two/three o'clock; climbing",
    "      floors or prices.",
    "  (b) an INTERLEAVED block where several counters climb in parallel — e.g. 1-flat, 1-long, 1-general,",
    "      2-general, 3-flat, 3-long, 3-general, 4-flat, … — each counter's own values ascend even though",
    "      the cards alternate counter type. Return the WHOLE interleaved block as ONE run (do NOT split it",
    "      per counter), so the shuffle can break every counter's sequence at once.",
    "",
    "The cards in a run must be adjacent (contiguous) in the list. Do NOT include non-number cards, and do",
    "NOT include a lone number card with no number/counter card beside it.",
    "",
    'Return ONLY a JSON object: {"runs": [["id","id",…], …]} — each inner array lists the ids of ONE run',
    'in their current order. Return {"runs": []} if there is no such block.',
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
  console.error(
    `${file}: jumbled ${runs.length} number run(s) (${runs.map((r) => r.length).join(", ")} cards)`,
  );
  if (dry) {
    const map = new Map(items.map((i) => [i.id, i.english]));
    console.log("  " + order.map((id) => map.get(id)).join("  |  "));
    continue;
  }

  cards.items = reorder(items, order);
  writeUnitJson(file, cards, { reason: REASON });
  changed++;

  // Keep corpus.json (a subset — no fill-in-blank cards) in the same relative order.
  const corpusPath = join(dirname(file), "corpus.json");
  if (existsSync(corpusPath)) {
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    corpus.items = reorder(corpus.items || [], order);
    writeUnitJson(corpusPath, corpus, { reason: REASON });
  }
}

console.error(
  dry
    ? `dry run — ${runsShuffled} unit(s) have a number run.`
    : `done — reordered ${changed} cards.json file(s).`,
);

#!/usr/bin/env node
// One-off migration: split each card/corpus item's legacy blended `notes` (and legacy `hint`) into the
// new `cardNote` (user-facing, → Anki card) and `reviewNote` (internal review-only rationale) fields
// via an LLM pass. Backs up every file it touches to `<file>.pre-notes-split.bak` (reversible), then
// removes the legacy `notes` field. Idempotent-ish: a file with no legacy `notes`/`hint` is skipped.
//
// Usage:  node scripts/migrate-split-notes.mjs [--dry] [file ...]
//   no files  → scans output/ for every corpus.json + cards.json
//   --dry     → prints the proposed split without writing anything
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { runClaude } from "../src/translate/runClaude.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const explicit = args.filter((a) => a !== "--dry");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "corpus.json" || e.name === "cards.json") out.push(p);
  }
  return out;
}

const files = explicit.length ? explicit : existsSync("output") ? walk("output") : [];

const PROMPT = (rows) =>
  [
    "You are splitting flashcard notes into two distinct fields for a language-learning deck.",
    "",
    "Each note below currently BLENDS two different things:",
    "  - cardNote: information a LEARNER studying the card wants — when/how to use it, how it differs",
    "    from a similar card, the relationship between two related words, register/politeness. This is",
    "    SHOWN ON THE ANKI CARD.",
    "  - reviewNote: internal meta-commentary about whether the card should EXIST — why it is uncertain,",
    '    why it was AI-suggested/added, source provenance (e.g. "not literally in this chapter",',
    '    "inferred by combining X+Y", "placeholder filled with …"). The LEARNER NEVER SEES THIS.',
    "",
    "For each item, return BOTH fields. Put learner-useful context in cardNote and inclusion/uncertainty",
    "rationale in reviewNote. Either may be an empty string if that kind of content isn't present. Do NOT",
    "invent new information — only re-partition what's already in the note. Keep wording concise.",
    "",
    'Return ONLY a JSON array, no prose: [{"id":"…","cardNote":"…","reviewNote":"…"}, …]',
    "",
    "Items:",
    JSON.stringify(rows, null, 2),
  ].join("\n");

function parseJsonArray(text) {
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a === -1 || b === -1) throw new Error("no JSON array in model output");
  return JSON.parse(text.slice(a, b + 1));
}

let touched = 0,
  itemsSplit = 0;
for (const file of files) {
  if (!existsSync(file)) {
    console.error("skip (missing):", file);
    continue;
  }
  const data = JSON.parse(readFileSync(file, "utf-8"));
  const items = data.items || [];
  const legacy = items.filter(
    (i) =>
      (typeof i.notes === "string" && i.notes.trim()) ||
      (typeof i.hint === "string" && i.hint.trim()),
  );
  if (legacy.length === 0) continue;

  const rows = legacy.map((i) => ({
    id: i.id,
    english: i.english,
    note: [i.notes, i.hint].filter((x) => typeof x === "string" && x.trim()).join(" | "),
  }));
  console.error(`${file}: splitting ${rows.length} note(s)…`);
  let split;
  try {
    split = parseJsonArray(runClaude(PROMPT(rows)));
  } catch (e) {
    console.error(`  FAILED (${e.message}) — leaving ${file} unchanged`);
    continue;
  }
  const byId = new Map(split.map((s) => [s.id, s]));

  for (const i of legacy) {
    const s = byId.get(i.id);
    if (!s) {
      console.error(`  no split for ${i.id} — leaving its note as-is`);
      continue;
    }
    const cardNote = (s.cardNote || "").trim();
    const reviewNote = (s.reviewNote || "").trim();
    if (dry) {
      console.log(`  [${i.id}] ${i.english}`);
      console.log(`     card:   ${cardNote || "—"}`);
      console.log(`     review: ${reviewNote || "—"}`);
      continue;
    }
    if (cardNote) i.cardNote = cardNote;
    if (reviewNote) i.reviewNote = reviewNote;
    delete i.notes;
    delete i.hint;
    itemsSplit++;
  }

  if (!dry) {
    const bak = file + ".pre-notes-split.bak";
    if (!existsSync(bak)) writeFileSync(bak, readFileSync(file));
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    touched++;
  }
}
console.error(
  dry ? "dry run complete." : `done — updated ${touched} file(s), split ${itemsSplit} item(s).`,
);

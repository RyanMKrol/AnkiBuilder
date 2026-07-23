#!/usr/bin/env node
// Teachability pass over a deck's user-facing `cardNote`s. Feeds the LLM the WHOLE book/course at once
// (all lessons) so it can cross-reference related cards across lessons — e.g. おねがいします vs ください
// "when to use which". Rewrites weak notes and adds context/comparisons; leaves `reviewNote` (internal)
// untouched. Updates cards.json + corpus.json in lockstep; backs up each to <file>.pre-enhance.bak.
//
// Usage: node scripts/enhance-card-notes.mjs [--dry] <bookOrCourseDir> [<dir> ...]
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { runClaude } from "../src/translate/runClaude.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirs = args.filter((a) => a !== "--dry");
if (dirs.length === 0) {
  console.error("give one or more book/course directories (e.g. output/epubs/<slug>)");
  process.exit(1);
}

// Lesson cards.json files under a book/course dir, ordered by chapterNumber (tie-break: folder name).
function lessonFiles(dir) {
  const units = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = join(dir, e.name, "cards.json");
    if (!existsSync(f)) continue;
    const data = JSON.parse(readFileSync(f, "utf-8"));
    units.push({ file: f, name: e.name, num: data.meta?.chapterNumber ?? 0, data });
  }
  units.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
  return units;
}

const PROMPT = (cards) =>
  [
    "You improve the teachability of Anki flashcard notes for an English speaker learning Japanese.",
    "Below is ONE deck's COMPLETE ordered card list. For cards where a note genuinely helps a learner,",
    "produce an improved `cardNote` (the note shown on the card). Return notes ONLY for cards you add or",
    "improve; omit cards you'd leave unchanged.",
    "",
    "What makes a good cardNote:",
    "1. CROSS-REFERENCE closely-related cards that appear in THIS deck. When two cards are easily confused",
    "   or closely related — near-synonyms with a nuance difference, similar forms, different politeness —",
    "   put a note on EACH explaining when to use which, naming the other card by its meaning + Japanese",
    "   with romaji. e.g. for おねがいします: \"A polite request ('I request of you'); softer/more formal than",
    "   ください (kudasai), which is more of a direct 'please give me'.\"",
    "2. USAGE & register: when/how to use it, casual vs polite, what a particle/suffix attaches to, how it",
    "   differs from a look-alike card.",
    "3. Rewrite weak or thin existing notes to be clearer and genuinely useful.",
    "4. Atomic cards (single words, particles, set expressions) benefit most. A full sentence rarely needs",
    "   a note — add one only for a specific, non-obvious point.",
    "",
    "Rules:",
    "- ALWAYS follow any Japanese script in the note with its romaji in parentheses: はじめまして (hajimemashite).",
    "- Keep each note concise (1–2 sentences), concrete, and about USING the card — not restating its meaning.",
    "- Natural sentence-case English. Only compare cards that actually appear in the list below.",
    "- Do not invent facts; if unsure, leave the card out.",
    "",
    'Return ONLY JSON: {"notes":[{"id":"…","cardNote":"…"}, …]}',
    "",
    "Cards:",
    JSON.stringify(
      cards.map((c) => ({
        id: c.id,
        english: c.english,
        target: c.target,
        romaji: c.pronunciation || c.reading || "",
        category: c.category,
        currentNote: c.cardNote || "",
      })),
      null,
      2,
    ),
  ].join("\n");

function parseNotes(text, idSet) {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("no JSON object in output");
  const notes = JSON.parse(text.slice(a, b + 1)).notes;
  if (!Array.isArray(notes)) throw new Error("no `notes` array");
  const out = new Map();
  for (const n of notes) {
    if (n && typeof n.id === "string" && typeof n.cardNote === "string" && idSet.has(n.id))
      out.set(n.id, n.cardNote.trim());
  }
  return out;
}

for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error("skip (missing):", dir);
    continue;
  }
  const units = lessonFiles(dir);
  const allCards = units.flatMap((u) => u.data.items);
  const idSet = new Set(allCards.map((c) => c.id));
  console.error(
    `${dir}: ${allCards.length} cards across ${units.length} lesson(s) → asking the model…`,
  );

  let notes;
  try {
    notes = parseNotes(runClaude(PROMPT(allCards)), idSet);
  } catch (e) {
    console.error(`  FAILED (${e.message}) — unchanged`);
    continue;
  }
  console.error(`  model returned ${notes.size} note(s)`);

  if (dry) {
    let shown = 0;
    for (const u of units)
      for (const it of u.data.items) {
        if (!notes.has(it.id) || notes.get(it.id) === (it.cardNote || "")) continue;
        console.log(`  [${it.english} / ${it.target}]`);
        console.log(`     ${it.cardNote ? "was: " + it.cardNote : "(no note)"}`);
        console.log(`     now: ${notes.get(it.id)}`);
        if (++shown >= 30) {
          console.log("  …(dry preview capped at 30)");
          break;
        }
      }
    continue;
  }

  // Apply to each lesson's cards.json, and to corpus.json (subset) in the same dir.
  for (const u of units) {
    let changed = 0;
    for (const it of u.data.items) {
      if (notes.has(it.id) && notes.get(it.id) !== (it.cardNote || "")) {
        it.cardNote = notes.get(it.id);
        changed++;
      }
    }
    if (!changed) continue;
    backup(u.file);
    writeFileSync(u.file, JSON.stringify(u.data, null, 2) + "\n");
    const corpusPath = join(dir, u.name, "corpus.json");
    if (existsSync(corpusPath)) {
      const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
      let cc = 0;
      for (const it of corpus.items || []) {
        if (notes.has(it.id) && notes.get(it.id) !== (it.cardNote ?? "")) {
          it.cardNote = notes.get(it.id);
          cc++;
        }
      }
      if (cc) {
        backup(corpusPath);
        writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n");
      }
    }
    console.error(`  ${u.name}: updated ${changed} note(s)`);
  }
}

function backup(f) {
  const bak = f + ".pre-enhance.bak";
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(f));
}

#!/usr/bin/env node
// Teachability pass over a deck's back-of-card `note`s. Feeds the LLM the WHOLE book/course at once
// (all lessons, each tagged with its lesson index) so it can cross-reference related cards — BACKWARD
// only (a card references earlier/same lessons, never later ones the learner hasn't met). Rewrites weak
// notes and adds context/comparisons; leaves `reviewNote` (internal)
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
    "Below is ONE deck's COMPLETE card list, each tagged with the `lesson` it appears in (the learner",
    "studies lessons in order). For cards where a note genuinely helps a learner, produce an improved",
    "back-of-card `note`. Return notes ONLY for cards you add or improve; omit cards you'd leave unchanged.",
    "",
    "What makes a good note:",
    "1. CROSS-REFERENCE closely-related cards — near-synonyms with a nuance difference, similar forms,",
    "   different politeness — explaining when to use which, naming the other card by its meaning +",
    "   Japanese with romaji. e.g. for おねがいします: \"A polite request ('I request of you'); softer/more",
    "   formal than ください (kudasai), a more direct 'please give me'.\"",
    "   COMPARE BACKWARD ONLY: a card may reference another card ONLY if that other card is in the SAME or",
    "   an EARLIER lesson (its `lesson` ≤ this card's). NEVER reference a later lesson — the learner hasn't",
    "   met it yet. So the comparison goes on the LATER card of a pair: e.g. その (sono) in a later lesson",
    "   references それ (sore) from an earlier lesson, not the other way around.",
    "2. USAGE & register: when/how to use it, casual vs polite, what a particle/suffix attaches to, how it",
    "   differs from a look-alike card the learner has already seen.",
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
    'Return ONLY JSON: {"notes":[{"id":"…","note":"…"}, …]}',
    "",
    "Cards:",
    JSON.stringify(
      cards.map((c) => ({
        id: c.id,
        lesson: c.__lesson,
        english: c.english,
        target: c.target,
        romaji: c.pronunciation || c.reading || "",
        category: c.category,
        currentNote: c.note || c.cardNote || "",
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
    if (n && typeof n.id === "string" && typeof n.note === "string" && idSet.has(n.id))
      out.set(n.id, n.note.trim());
  }
  return out;
}

for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error("skip (missing):", dir);
    continue;
  }
  const units = lessonFiles(dir);
  // Tag each card (a copy — don't mutate the stored item) with its 1-based lesson index, so the model
  // can enforce backward-only cross-references (compare against earlier/same lessons only).
  const allCards = units.flatMap((u, li) =>
    u.data.items.map((it) => ({ ...it, __lesson: li + 1 })),
  );
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
        if (!notes.has(it.id) || notes.get(it.id) === (it.note || "")) continue;
        console.log(`  [${it.english} / ${it.target}]`);
        console.log(`     ${it.note ? "was: " + it.note : "(no note)"}`);
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
      if (notes.has(it.id) && notes.get(it.id) !== (it.note || "")) {
        it.note = notes.get(it.id);
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
        if (notes.has(it.id) && notes.get(it.id) !== (it.note ?? "")) {
          it.note = notes.get(it.id);
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

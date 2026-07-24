#!/usr/bin/env node
// Teachability pass over a deck's back-of-card `note`s. Runs ONE pass PER LESSON, each fed only that
// lesson + all EARLIER lessons as context — so cross-references are structurally BACKWARD-only (the
// model never sees later lessons, so it can't reference material the learner hasn't met). Writes notes
// for the current lesson only; leaves `hint`/`reviewNote` untouched. Updates cards.json + corpus.json
// in lockstep; backs up each to <file>.pre-enhance.bak.
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

const PROMPT = (cards, currentLesson) =>
  [
    "You improve the teachability of Anki flashcard notes for an English speaker learning Japanese.",
    `Below are the cards from lessons 1..${currentLesson} of a course (the learner studies lessons in`,
    `order, so lessons 1..${currentLesson - 1} are ALREADY LEARNED and lesson ${currentLesson} is the`,
    "CURRENT lesson being taught). Each card is tagged with its `lesson`.",
    "",
    `Add or improve the back-of-card \`note\` ONLY for cards in lesson ${currentLesson} (the current`,
    "lesson). The earlier lessons are shown purely as CONTEXT you may reference — do NOT write notes for",
    "them. Return notes only for the current-lesson cards you add or improve; omit ones you'd leave alone.",
    "",
    "What makes a good note:",
    "1. CROSS-REFERENCE closely-related cards — near-synonyms with a nuance difference, similar forms,",
    "   different politeness — explaining when to use which, naming the other card by its meaning +",
    "   Japanese with romaji. Because you only see already-learned + current lessons, this is naturally",
    "   BACKWARD-looking: a current-lesson card clarifies its difference from something the learner has",
    "   already met. e.g. for its lesson's ください: \"A direct 'please give me'; contrast おねがいします",
    '   (onegaishimasu) from an earlier lesson, a softer/more formal request."',
    "2. USAGE & register: when/how to use it, casual vs polite, what a particle/suffix attaches to, how it",
    "   differs from a look-alike card the learner has already seen.",
    "3. Rewrite weak or thin existing notes on current-lesson cards to be clearer and genuinely useful.",
    "4. Atomic cards (single words, particles, set expressions) benefit most. A full sentence rarely needs",
    "   a note — add one only for a specific, non-obvious point.",
    "",
    "Rules:",
    "- ALWAYS follow any Japanese script in the note with its romaji in parentheses: はじめまして (hajimemashite).",
    "- Keep each note concise (1–2 sentences), concrete, and about USING the card — not restating its meaning.",
    "- Natural sentence-case English. Only reference cards that actually appear in the list below.",
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
  console.error(`${dir}: ${units.length} lesson(s) — one backward pass per lesson…`);

  // PER-CHAPTER, cumulative-backward: process each lesson with ONLY that lesson + all EARLIER lessons as
  // context, and write notes for the current lesson only. The model literally never sees later lessons,
  // so a forward reference is structurally impossible (not just discouraged).
  for (let i = 0; i < units.length; i++) {
    const currentUnit = units[i];
    const currentLesson = i + 1;
    const contextCards = units
      .slice(0, i + 1)
      .flatMap((u, li) => u.data.items.map((it) => ({ ...it, __lesson: li + 1 })));
    const currentIds = new Set(currentUnit.data.items.map((c) => c.id));

    let notes;
    try {
      notes = parseNotes(runClaude(PROMPT(contextCards, currentLesson)), currentIds);
    } catch (e) {
      console.error(`  ${currentUnit.name} (lesson ${currentLesson}): FAILED (${e.message})`);
      continue;
    }

    if (dry) {
      for (const it of currentUnit.data.items) {
        if (!notes.has(it.id) || notes.get(it.id) === (it.note || "")) continue;
        console.log(`  L${currentLesson} [${it.english} / ${it.target}]`);
        console.log(`     ${it.note ? "was: " + it.note : "(no note)"}`);
        console.log(`     now: ${notes.get(it.id)}`);
      }
      continue;
    }

    let changed = 0;
    for (const it of currentUnit.data.items) {
      if (notes.has(it.id) && notes.get(it.id) !== (it.note || "")) {
        it.note = notes.get(it.id);
        changed++;
      }
    }
    if (!changed) {
      console.error(`  ${currentUnit.name} (lesson ${currentLesson}): no change`);
      continue;
    }
    backup(currentUnit.file);
    writeFileSync(currentUnit.file, JSON.stringify(currentUnit.data, null, 2) + "\n");
    const corpusPath = join(dir, currentUnit.name, "corpus.json");
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
    console.error(`  ${currentUnit.name} (lesson ${currentLesson}): updated ${changed} note(s)`);
  }
}

function backup(f) {
  const bak = f + ".pre-enhance.bak";
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(f));
}

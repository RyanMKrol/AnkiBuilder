#!/usr/bin/env node
// Teachability pass over a deck's back-of-card `note`s. Runs ONE pass PER LESSON, each fed only that
// lesson + all EARLIER lessons as context — so cross-references are structurally BACKWARD-only (the
// model never sees later lessons, so it can't reference material the learner hasn't met). Writes notes
// for the current lesson only; leaves `hint`/`reviewNote` untouched. Updates cards.json + corpus.json
// in lockstep; backs up each to <file>.pre-enhance.bak.
//
// Usage: node scripts/enhance-card-notes.mjs [--dry] [--only <unit>] <bookOrCourseDir> [<dir> ...]
//
// --only <unit> restricts which lessons get WRITTEN to the named unit folder (e.g. "chapter-6"),
// while still feeding every earlier lesson in as context. This is the per-lesson pipeline form: a new
// lesson gets its cross-references without re-running the pass over lessons already reviewed and done
// (which would churn their notes and clobber their .pre-enhance.bak backups).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { runClaude } from "../src/translate/runClaude.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyAt = args.indexOf("--only");
const only = onlyAt === -1 ? null : args[onlyAt + 1];
if (onlyAt !== -1 && !only) {
  console.error("--only needs a unit folder name (e.g. --only chapter-6)");
  process.exit(1);
}
const dirs = args.filter(
  (a, i) => a !== "--dry" && a !== "--only" && !(onlyAt !== -1 && i === onlyAt + 1),
);
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
    units.push({
      file: f,
      name: e.name,
      num: data.meta?.chapterNumber ?? 0,
      // The unit's OWN name, taken from whatever `chapterLabel` the source recorded — NOT its position
      // in this list. Any un-numbered unit (front matter, an intro section, a supplement) shifts the
      // two out of step, so a note that cites a position sends the learner to the wrong lesson. Cards
      // are tagged with this, and the prompt requires notes to cite lessons exactly as tagged.
      // Trimmed at the first ":" so a long title reduces to the citable name the learner sees.
      label: (data.meta?.chapterLabel ?? e.name).split(":")[0].trim(),
      data,
    });
  }
  units.sort((a, b) => a.num - b.num || a.name.localeCompare(b.name));
  return units;
}

const PROMPT = (cards, currentLabel, earlierLabels) =>
  [
    "You improve the teachability of Anki flashcard notes for an English speaker learning Japanese.",
    "Below are the cards from one course, listed in STUDY ORDER and tagged with the `lesson` they come",
    `from. The learner has ALREADY LEARNED: ${earlierLabels.length ? earlierLabels.join(", ") : "(nothing — this is the first lesson)"}.`,
    `The CURRENT lesson being taught is "${currentLabel}".`,
    "",
    `Add or improve the back-of-card \`note\` ONLY for cards whose lesson is "${currentLabel}". The`,
    "earlier lessons are shown purely as CONTEXT you may reference — do NOT write notes for",
    "them. Return notes only for the current-lesson cards you add or improve; omit ones you'd leave alone.",
    "",
    'When a note refers to another lesson, name it EXACTLY as tagged (e.g. "from Lesson 4",',
    '"from Frequently Used Expressions"). NEVER invent a lesson number or count positions in this list —',
    "the tags are the book's own names and are the only correct way to cite a lesson.",
    "",
    "What makes a good note:",
    "1. CROSS-REFERENCE closely-related cards — near-synonyms with a nuance difference, similar forms,",
    "   different politeness — explaining when to use which, naming the other card by its meaning +",
    "   Japanese with romaji. Because you only see already-learned + current lessons, this is naturally",
    "   BACKWARD-looking: a current-lesson card clarifies its difference from something the learner has",
    "   already met. e.g. for its lesson's ください: \"A direct 'please give me'; contrast おねがいします",
    '   (onegaishimasu) from an earlier lesson, a softer/more formal request."',
    "2. DISAMBIGUATE a FALSE FRIEND within what the learner already knows: when a card reuses a word or",
    "   kana the learner has met before but here it MEANS or FUNCTIONS differently, call it out — name the",
    "   familiar form, its familiar meaning, and how THIS one differs. High-value cases: a question word",
    "   taking の (どこ (doko) 'where is it?' → どこの (doko no) 'which place's / what make of'; だれ (dare)",
    "   'who' → だれの (dare no) 'whose'; なに (nani) 'what' → なんの (nan no) 'what kind of'); a pronoun vs a",
    "   determiner (それ (sore) 'that one' → その (sono) 'that ___ (+ noun)'); the same kana as a different",
    '   particle; a counter reused for a different thing. e.g. それはどこのコーヒーカップですか: "どこ (doko)',
    "   alone asks a location ('where is it?'), but どこの (doko no) asks origin or make — 'which place's /",
    "   what brand of' coffee cup. The の (no) turns 'where' into a modifier of the noun.\"",
    "3. USAGE & register: when/how to use it, casual vs polite, what a particle/suffix attaches to, how it",
    "   differs from a look-alike card the learner has already seen.",
    "4. Rewrite weak or thin existing notes on current-lesson cards to be clearer and genuinely useful.",
    "5. Atomic cards (single words, particles, set expressions) benefit most. A full sentence usually needs",
    "   no note — but DO add one when the sentence hinges on a false-friend distinction (point 2) or another",
    "   specific, non-obvious point.",
    "6. REMOVE useless notes. If a current-lesson card's existing note merely RESTATES the card — repeats",
    '   the English gloss (e.g. note "Where is the wine shop?" on that same sentence) or re-gives the',
    '   reading already shown (e.g. "First floor (read いっかい)") — and you have nothing genuinely useful to',
    '   add, return it with an EMPTY note ("note": "") to delete it. A note must add to the lesson, never',
    "   echo it. Most number/counter cards and self-evident sentences should end up with NO note.",
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
  if (only && !units.some((u) => u.name === only)) {
    console.error(
      `skip (no unit "${only}" in ${dir}) — have: ${units.map((u) => u.name).join(", ")}`,
    );
    continue;
  }
  console.error(
    only
      ? `${dir}: writing "${only}" only, with ${units.findIndex((u) => u.name === only)} earlier lesson(s) as context…`
      : `${dir}: ${units.length} lesson(s) — one backward pass per lesson…`,
  );

  // PER-CHAPTER, cumulative-backward: process each lesson with ONLY that lesson + all EARLIER lessons as
  // context, and write notes for the current lesson only. The model literally never sees later lessons,
  // so a forward reference is structurally impossible (not just discouraged).
  for (let i = 0; i < units.length; i++) {
    const currentUnit = units[i];
    // --only still walks the list (context is cumulative), but writes just the named unit.
    if (only && currentUnit.name !== only) continue;
    // Cards carry the lesson's own name, never its position — see `label` in lessonFiles().
    const contextCards = units
      .slice(0, i + 1)
      .flatMap((u) => u.data.items.map((it) => ({ ...it, __lesson: u.label })));
    const earlierLabels = units.slice(0, i).map((u) => u.label);
    const currentIds = new Set(currentUnit.data.items.map((c) => c.id));

    let notes;
    try {
      notes = parseNotes(
        runClaude(PROMPT(contextCards, currentUnit.label, earlierLabels)),
        currentIds,
      );
    } catch (e) {
      console.error(`  ${currentUnit.name} (${currentUnit.label}): FAILED (${e.message})`);
      continue;
    }

    if (dry) {
      for (const it of currentUnit.data.items) {
        if (!notes.has(it.id) || notes.get(it.id) === (it.note || "")) continue;
        console.log(`  [${currentUnit.label}] ${it.english} / ${it.target}`);
        console.log(`     ${it.note ? "was: " + it.note : "(no note)"}`);
        console.log(`     now: ${notes.get(it.id)}`);
      }
      continue;
    }

    let changed = 0;
    for (const it of currentUnit.data.items) {
      if (notes.has(it.id) && notes.get(it.id) !== (it.note || "")) {
        // An empty returned note means "delete this restatement" → store null, not "".
        it.note = notes.get(it.id) || null;
        changed++;
      }
    }
    if (!changed) {
      console.error(`  ${currentUnit.name} (${currentUnit.label}): no change`);
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
          it.note = notes.get(it.id) || null;
          cc++;
        }
      }
      if (cc) {
        backup(corpusPath);
        writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n");
      }
    }
    console.error(`  ${currentUnit.name} (${currentUnit.label}): updated ${changed} note(s)`);
  }
}

function backup(f) {
  const bak = f + ".pre-enhance.bak";
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(f));
}

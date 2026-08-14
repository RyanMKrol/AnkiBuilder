#!/usr/bin/env node
//
// SPENT: 2026-08-14 — a one-off MIGRATION, not a standing tool.
// the front-hint / back-note split ran once per collection. It is kept for the record, and because re-reading
// what a migration actually did is the only way to understand the shape of the data it left
// behind. Do not run it as part of any procedure: it is not in SKILL.md's per-chapter flow, and
// it will re-apply a decision that has already been made and reviewed.
//
// Migration for the front-hint / back-note split. Per book/course (all lessons at once, so same-target
// cards are visible together): an LLM moves DISAMBIGUATION parentheticals out of `english` into `hint`
// (and generates a hint for cards that share a target but have none), leaving meaning-integral
// parentheticals like "(person)" in the gloss. Also mechanically renames legacy `cardNote` -> `note`.
// Updates cards.json + corpus.json in lockstep; backs up to <file>.pre-hint-<stamp>.bak.
//
// Usage: node scripts/split-front-hint.mjs [--dry] <bookOrCourseDir> [<dir> ...]
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { runClaude } from "../src/translate/runClaude.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

// Tag in the stamped backup name: <file>.pre-hint-<YYYYMMDDHHmm>.bak
const REASON = "hint";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirs = args.filter((a) => a !== "--dry");

function lessonFiles(dir) {
  const units = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = join(dir, e.name, "cards.json");
    if (!existsSync(f)) continue;
    units.push({ file: f, name: e.name, data: JSON.parse(readFileSync(f, "utf-8")) });
  }
  units.sort((a, b) => (a.data.meta?.chapterNumber ?? 0) - (b.data.meta?.chapterNumber ?? 0));
  return units;
}

const PROMPT = (cards) =>
  [
    "You separate FRONT-of-card hints from the English gloss on Japanese flashcards.",
    "",
    "Each card's `english` is the meaning shown to the learner. Some glosses embed a parenthetical that",
    "is really a DISAMBIGUATION HINT — usage context that helps you pick the right answer, especially when",
    "two cards share the same Japanese `target`. e.g. \"Excuse me. (said when entering another person's",
    'room)", "Good-bye. (said on formal occasions)", "Nice to meet you (first time)".',
    "",
    "For each card:",
    "1. If the english has such a CONTEXTUAL/disambiguation parenthetical, MOVE it into `hint` (drop the",
    '   parens, keep it short) and return the CLEANED english — english "Excuse me.", hint "said when',
    "   entering another person's room\".",
    '2. KEEP meaning-integral parentheticals in the english — do NOT move things like "(person)",',
    '   "(honorific prefix)", "(particle)", "(counter)", or a parenthetical that IS the meaning. Only',
    "   move contextual usage cues.",
    "3. If a card SHARES its Japanese `target` with another card in this list and would be ambiguous on",
    "   the Japanese-front card without a cue, GENERATE a short hint (a few words) even if the english",
    "   had no parenthetical.",
    "4. Otherwise no hint.",
    "",
    "Keep hints in English (a learner reading them may not read kana yet); if a hint must quote Japanese,",
    "follow it with romaji in parentheses.",
    "",
    'Return ONLY: {"cards":[{"id":"…","english":"<cleaned — omit if unchanged>","hint":"<omit if none>"}, …]}',
    "Include a card ONLY if you set a hint and/or cleaned its english.",
    "",
    "Cards:",
    JSON.stringify(
      cards.map((c) => ({
        id: c.id,
        english: c.english,
        target: c.target,
        romaji: c.pronunciation || c.ttsText || "",
        category: c.category,
      })),
      null,
      2,
    ),
  ].join("\n");

function parseCards(text, idSet) {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a === -1 || b === -1) throw new Error("no JSON object");
  const cards = JSON.parse(text.slice(a, b + 1)).cards;
  if (!Array.isArray(cards)) throw new Error("no `cards` array");
  const out = new Map();
  for (const c of cards) {
    if (c && typeof c.id === "string" && idSet.has(c.id)) out.set(c.id, c);
  }
  return out;
}

// Mechanical: fold legacy cardNote -> note (no LLM). Returns count changed.
function renameCardNote(items) {
  let n = 0;
  for (const it of items) {
    if (it.cardNote != null && it.note == null) {
      it.note = it.cardNote;
      delete it.cardNote;
      n++;
    } else if (it.cardNote != null) {
      delete it.cardNote;
    }
  }
  return n;
}

for (const dir of dirs) {
  if (!existsSync(dir)) {
    console.error("skip (missing):", dir);
    continue;
  }
  const units = lessonFiles(dir);
  const allCards = units.flatMap((u) => u.data.items);
  const idSet = new Set(allCards.map((c) => c.id));
  console.error(`${dir}: ${allCards.length} cards → extracting hints…`);

  let result;
  try {
    result = parseCards(runClaude(PROMPT(allCards)), idSet);
  } catch (e) {
    console.error(`  FAILED (${e.message}) — hints unchanged (still doing cardNote->note rename)`);
    result = new Map();
  }
  console.error(`  model returned ${result.size} hint/english change(s)`);

  for (const u of units) {
    let hintChanges = 0,
      engChanges = 0;
    for (const it of u.data.items) {
      const r = result.get(it.id);
      if (!r) continue;
      if (typeof r.hint === "string" && r.hint.trim() && r.hint.trim() !== (it.hint || "")) {
        if (dry) console.log(`  [${it.english}] hint: ${r.hint.trim()}`);
        else it.hint = r.hint.trim();
        hintChanges++;
      }
      if (typeof r.english === "string" && r.english.trim() && r.english.trim() !== it.english) {
        if (dry) console.log(`     english: "${it.english}" -> "${r.english.trim()}"`);
        else it.english = r.english.trim();
        engChanges++;
      }
    }
    const renamed = dry ? 0 : renameCardNote(u.data.items);
    if (dry || (hintChanges === 0 && engChanges === 0 && renamed === 0)) continue;
    writeUnitJson(u.file, u.data, { reason: REASON });
    // corpus.json in the same folder (subset): apply hint/english + rename there too.
    const corpusPath = join(dir, u.name, "corpus.json");
    if (existsSync(corpusPath)) {
      const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
      for (const it of corpus.items || []) {
        const r = result.get(it.id);
        if (r?.hint?.trim()) it.hint = r.hint.trim();
        if (r?.english?.trim()) it.english = r.english.trim();
      }
      renameCardNote(corpus.items || []);
      writeUnitJson(corpusPath, corpus, { reason: REASON });
    }
    console.error(
      `  ${u.name}: ${hintChanges} hint(s), ${engChanges} english cleaned, ${renamed} note rename(s)`,
    );
  }
}

#!/usr/bin/env node
// One-off: in every user-facing `cardNote`, ensure each snippet of non-Roman target-language script
// (kana/kanji, Cyrillic, Hebrew, Arabic, Greek, …) is immediately followed by its romanization in
// parentheses — はじめまして -> はじめまして (hajimemashite) — so a learner who can't yet read the script
// still follows the note. reviewNote is internal and is left untouched. An LLM does the rewrite (only
// where a reading is missing); each changed file is backed up to <file>.pre-romanize.bak.
//
// Usage: node scripts/romanize-card-notes.mjs [--dry] [file ...]  (no files → scans output/)
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

// Non-Roman scripts a learner may not read. Matched via Unicode script-property escapes (the `u` flag),
// which are cleaner than manual code-point ranges and \u2014 unlike literal ranges that start on a combining
// mark \u2014 don't trip eslint's no-misleading-character-class.
const NON_ROMAN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Greek}\p{Script=Thai}\p{Script=Devanagari}]/u;

const PROMPT = (rows, lang) =>
  [
    `These are user-facing flashcard notes for an English speaker learning ${lang}. Each note quotes`,
    `some ${lang} text in a non-Roman script.`,
    "",
    "Rewrite each note so that EVERY snippet of non-Roman script is IMMEDIATELY followed by its",
    "romanization in parentheses — e.g. はじめまして -> はじめまして (hajimemashite); お + かし = おかし ->",
    "お (o) + かし (kashi) = おかし (okashi). Rules:",
    "  - Only ADD readings. Do not otherwise reword, translate, or restructure the note.",
    "  - If a snippet is ALREADY followed by a parenthesized reading, leave it as-is (don't double it).",
    "  - Use standard romanization for the language (Hepburn romaji for Japanese, etc.), lowercase.",
    "  - Keep the English exactly as written.",
    "",
    'Return ONLY a JSON array: [{"id":"…","cardNote":"…rewritten…"}, …] — one object per input item.',
    "",
    "Notes:",
    JSON.stringify(
      rows.map((r) => ({ id: r.id, cardNote: r.cardNote })),
      null,
      2,
    ),
  ].join("\n");

function parseArray(text) {
  const a = text.indexOf("["),
    b = text.lastIndexOf("]");
  if (a === -1 || b === -1) throw new Error("no JSON array in output");
  return JSON.parse(text.slice(a, b + 1));
}

let changedFiles = 0,
  changedNotes = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, "utf-8"));
  const lang = data.meta?.targetLanguage || "the target language";
  const needing = (data.items || []).filter(
    (i) => typeof i.cardNote === "string" && NON_ROMAN.test(i.cardNote),
  );
  if (needing.length === 0) continue;

  let out;
  try {
    out = parseArray(runClaude(PROMPT(needing, lang)));
  } catch (e) {
    console.error(`${file}: FAILED (${e.message}) — unchanged`);
    continue;
  }
  const byId = new Map(out.map((o) => [o.id, o.cardNote]));
  let n = 0;
  for (const it of needing) {
    const next = byId.get(it.id);
    if (typeof next !== "string" || next.trim() === "" || next === it.cardNote) continue;
    if (dry) {
      console.log(`  [${it.id}]`);
      console.log(`     was: ${it.cardNote}`);
      console.log(`     now: ${next}`);
    } else {
      it.cardNote = next.trim();
    }
    n++;
  }
  console.error(`${file}: ${n} cardNote(s) ${dry ? "would be" : ""} romanized`);
  if (!dry && n > 0) {
    const bak = file + ".pre-romanize.bak";
    if (!existsSync(bak)) writeFileSync(bak, readFileSync(file));
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    changedFiles++;
    changedNotes += n;
  }
}
console.error(
  dry ? "dry run complete." : `done — ${changedNotes} cardNote(s) across ${changedFiles} file(s).`,
);

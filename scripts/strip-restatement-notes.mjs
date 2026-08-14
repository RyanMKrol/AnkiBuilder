#!/usr/bin/env node
// One-off: remove `note`s and `hint`s that merely RESTATE the card. Both fields must ADD something the
// card doesn't already show — a `note` gives usage/register/a cross-reference; a `hint` gives a
// disambiguation cue (WHEN/WHERE/WHY it's used, e.g. "said when entering a room"). A field that just
// repeats the English gloss (note "Where is the wine shop?"; hint 'phrased as "wine from France"' on the
// card glossed "This is a wine from France.") or re-gives the reading already in Pronunciation teaches
// nothing and is noise — on a recognition card a restating hint even hands over the answer. This clears
// any such field (sets it to null) in cards.json + corpus.json, backing up each changed file to
// <file>.pre-strip-<stamp>.bak. It only removes PURE restatements; a field that restates and THEN adds a real
// point is left alone (trim those by hand). See docs/epub-extraction-prompt.md ("never restate the card")
// and the enhance pass, which also clears restatement notes going forward.
//
// Usage: node scripts/strip-restatement-notes.mjs [--dry] [file ...]   (no files → scans output/ cards.json)
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { writeUnitJson } from "../src/util/unitWrite.js";

// Tag in the stamped backup name: <file>.pre-strip-<YYYYMMDDHHmm>.bak
const REASON = "strip";

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

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9぀-ヿ一-鿿]/g, "");

// A note is a pure restatement when, after normalizing, it equals the English gloss (or the target), or
// it's the English gloss followed ONLY by a "(read …)" reading gloss (which the Pronunciation field
// already shows). Anything with additional real content fails this test and is kept.
function isRestatementNote(note, english, target) {
  const n = norm(note);
  if (!n) return false;
  const e = norm(english);
  if (n === e || n === norm(target)) return true;
  // "First floor (read いっかい (ikkai))" — English + a parenthetical that only re-gives the reading.
  const m = note.trim().match(/^(.*?)\s*\(\s*read\b[^)]*(?:\([^)]*\))?\s*\)\s*$/i);
  if (m && norm(m[1]) === e) return true;
  return false;
}

// Strip a hint's framing ("phrased as", "means", surrounding quotes) down to its core claim, so a hint
// like 'phrased as "wine from France"' is judged on "wine from France", not the "phrased as" wrapper.
function hintCore(hint) {
  return (hint || "")
    .trim()
    .replace(
      /^(phrased as|means|meaning|as in|the word|literally|reads?|i\.e\.,?|e\.g\.,?)\s+/i,
      "",
    )
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

// A hint restates when its core adds nothing over the English gloss (the gloss already contains it) or is
// just the target/reading. A GOOD disambiguation hint ("said when entering a room") is NOT contained in
// the gloss, so it survives. Requires a core of real length to avoid trivial matches.
function isRestatementHint(hint, english, target, romaji) {
  const core = norm(hintCore(hint));
  if (core.length < 2) return false;
  const e = norm(english);
  if (e && e.includes(core)) return true; // gloss already says everything the hint says
  if (core === norm(target) || core === norm(romaji)) return true; // just the reading
  return false;
}

let clearedNotes = 0,
  clearedHints = 0,
  filesChanged = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const cards = JSON.parse(readFileSync(file, "utf-8"));
  const todo = new Map(); // id -> {note?:true, hint?:true}
  for (const it of cards.items || []) {
    const mark = {};
    if (isRestatementNote(it.note, it.english, it.target)) mark.note = true;
    if (isRestatementHint(it.hint, it.english, it.target, it.pronunciation || it.reading))
      mark.hint = true;
    if (mark.note || mark.hint) todo.set(it.id, mark);
  }
  if (todo.size === 0) continue;

  if (dry) {
    console.log(`${file}:`);
    for (const it of cards.items) {
      const m = todo.get(it.id);
      if (!m) continue;
      if (m.note) console.log(`    note  [${it.english}] "${it.note}"`);
      if (m.hint) console.log(`    hint  [${it.english}] "${it.hint}"`);
    }
    for (const m of todo.values()) {
      if (m.note) clearedNotes++;
      if (m.hint) clearedHints++;
    }
    continue;
  }

  const apply = (items) => {
    let n = 0;
    for (const it of items) {
      const m = todo.get(it.id);
      if (!m) continue;
      if (m.note && it.note != null) {
        it.note = null;
        n++;
      }
      if (m.hint && it.hint != null) {
        it.hint = null;
        n++;
      }
    }
    return n;
  };

  if (apply(cards.items)) {
    writeUnitJson(file, cards, { reason: REASON });
    filesChanged++;
  }
  for (const m of todo.values()) {
    if (m.note) clearedNotes++;
    if (m.hint) clearedHints++;
  }
  console.error(`${file}: cleared restatements (${todo.size} card(s))`);

  const corpusPath = join(dirname(file), "corpus.json");
  if (existsSync(corpusPath)) {
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    if (apply(corpus.items || [])) {
      writeUnitJson(corpusPath, corpus, { reason: REASON });
    }
  }
}

console.error(
  `${dry ? "dry run — would clear" : "done — cleared"} ${clearedNotes} note(s) and ${clearedHints} hint(s)` +
    (dry ? "." : ` across ${filesChanged} file(s).`),
);

#!/usr/bin/env node
// One-off: remove back-of-card `note`s that merely RESTATE the card. A note should ADD to the lesson
// (usage, register, a cross-reference, a false-friend distinction) — a note that just repeats the card's
// English gloss (or its gloss plus the reading already shown in Pronunciation) teaches nothing and is
// noise. This clears any such note (sets it to null) in cards.json + corpus.json, backing up each changed
// file to <file>.pre-strip.bak. It only removes PURE restatements; a note that restates and THEN adds a
// real point is left alone (trim those by hand). See docs/epub-extraction-prompt.md ("never restate the
// card") and the enhance pass, which now also clears restatement notes going forward.
//
// Usage: node scripts/strip-restatement-notes.mjs [--dry] [file ...]   (no files → scans output/ cards.json)
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";

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
function isRestatement(note, english, target) {
  const n = norm(note);
  if (!n) return false;
  const e = norm(english);
  if (n === e || n === norm(target)) return true;
  // "First floor (read いっかい (ikkai))" — English + a parenthetical that only re-gives the reading.
  const m = note.trim().match(/^(.*?)\s*\(\s*read\b[^)]*(?:\([^)]*\))?\s*\)\s*$/i);
  if (m && norm(m[1]) === e) return true;
  return false;
}

let cleared = 0,
  filesChanged = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const cards = JSON.parse(readFileSync(file, "utf-8"));
  const ids = new Set();
  for (const it of cards.items || []) {
    if (isRestatement(it.note, it.english, it.target)) ids.add(it.id);
  }
  if (ids.size === 0) continue;

  if (dry) {
    console.log(`${file}: would clear ${ids.size} restatement note(s)`);
    for (const it of cards.items)
      if (ids.has(it.id)) console.log(`    [${it.english}] "${it.note}"`);
    cleared += ids.size;
    continue;
  }

  for (const it of cards.items) if (ids.has(it.id)) it.note = null;
  writeBackup(file);
  writeFileSync(file, JSON.stringify(cards, null, 2) + "\n");
  filesChanged++;
  cleared += ids.size;
  console.error(`${file}: cleared ${ids.size} restatement note(s)`);

  const corpusPath = join(dirname(file), "corpus.json");
  if (existsSync(corpusPath)) {
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    let cc = 0;
    for (const it of corpus.items || []) {
      if (ids.has(it.id) && it.note != null) {
        it.note = null;
        cc++;
      }
    }
    if (cc) {
      writeBackup(corpusPath);
      writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n");
    }
  }
}

function writeBackup(f) {
  const bak = f + ".pre-strip.bak";
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(f));
}

console.error(
  dry
    ? `dry run — would clear ${cleared} restatement note(s).`
    : `done — cleared ${cleared} restatement note(s) across ${filesChanged} file(s).`,
);

#!/usr/bin/env node
//
// SPENT: 2026-09-05. A one-off MIGRATION, not a standing tool.
// PARTLY REVERTED the same day: the 23 verb-dictionary-forms cards it appended to chapter-15-extras
// and chapter-16-extras were stripped back out on the owner's ruling (see
// docs/designs/verb-forms-family-2026-09.md). Only the 22 family-vocabulary cards remain in the deck,
// so running this again would re-add 23 cards a human has already decided against.
// It added the two 2026-09 augmentation batches to the book's -extras units, once, from the card data
// in docs/designs/verb-forms-family-2026-09.cards.json. It is kept for the record, and because
// re-reading what a migration actually did is the only way to understand the shape of the data it
// left behind. Do not run it as part of any procedure: the cards it appends are now in front of a
// human at the additions gate, and re-running it after any of them is excluded would re-add cards a
// reviewer has already turned down.
//
// Adds two authored batches to the Japanese for Busy People book's -extras units, from the card data
// in docs/designs/verb-forms-family-2026-09.cards.json:
//
//   verb-dictionary-forms — the 23 verbs the deck taught only in ます-form, given the dictionary
//                           form the book never prints for them (plus the three Lesson 15's own
//                           grammar names and extraction missed: みせる, あげる, かりる)
//   family-vocabulary     — siblings, children, grandparents and the collective terms, which
//                           Book 1 either teaches at Lesson 24 or never teaches at all
//
// Both go in as ADDITIONS: every card carries `addition: "<batch>"` and neither review flag, so
// `shippableCards()` holds it out of the .apkg AND the AnkiConnect deliver until it has passed the
// per-card additions gates at /additions/epub/<book>. The destination units keep their own `done`
// sign-off untouched — that is the whole point of the additions gate. See
// .claude/skills/build-anki-deck/references/augment-pathway.md.
//
// Usage:
//   node scripts/add-verb-forms-family.mjs --dry          print the plan, touch nothing
//   node scripts/add-verb-forms-family.mjs                do it
//   ... --only chapter-9-extras                           one unit
//
// Idempotent: a card already present by id is skipped, so a re-run after a failure is safe. It never
// contacts Anki or ElevenLabs, and it never marks anything reviewed or done.
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mergeIntoCardsFile } from "../src/cards/mergeIntoCardsFile.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");
const DATA = join(REPO, "docs/designs/verb-forms-family-2026-09.cards.json");
const REASON = "verb-forms-family";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

// Fields the CORPUS schema declares. Built explicitly rather than by copying the card, because the
// corpus schema is additionalProperties:false: `pronunciation` and `addition` are cards-only, and
// copying either across makes the file invalid. extras-pass.md documents this trap.
const CORPUS_FIELDS = [
  "id",
  "english",
  "category",
  "target",
  "hint",
  "scene",
  "note",
  "reviewNote",
  "ttsText",
  "uncertain",
  "aiSuggested",
  "excluded",
  "excludedBy",
  "excludedReason",
];

const toCorpusItem = (card) => {
  const out = {};
  for (const f of CORPUS_FIELDS) if (f in card && card[f] !== undefined) out[f] = card[f];
  return out;
};

const authored = JSON.parse(readFileSync(DATA, "utf-8"));
const targetUnits = Object.keys(authored).filter((k) => k !== "_" && Array.isArray(authored[k]));

// Every id already shipping anywhere in this COLLECTION, and which unit holds it. The card id is the
// Anki note key on both delivery paths, so a collision would silently merge two cards into one note.
const idOwner = new Map();
for (const dir of readdirSync(BOOK, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const f = join(BOOK, dir.name, "cards.json");
  if (!existsSync(f)) continue;
  for (const item of JSON.parse(readFileSync(f, "utf-8")).items) idOwner.set(item.id, dir.name);
}

const problems = [];
let total = 0;

for (const unit of targetUnits) {
  if (only && unit !== only) continue;
  const cardsPath = join(BOOK, unit, "cards.json");
  const corpusPath = join(BOOK, unit, "corpus.json");
  if (!existsSync(cardsPath) || !existsSync(corpusPath)) {
    problems.push(`${unit}: missing cards.json or corpus.json`);
    continue;
  }

  const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
  const present = new Set(cards.items.map((i) => i.id));
  const incoming = authored[unit].filter((c) => !present.has(c.id));

  // An id owned by a DIFFERENT unit of this collection is a hard stop, not a skip.
  for (const c of incoming) {
    const owner = idOwner.get(c.id);
    if (owner && owner !== unit) {
      problems.push(`${unit}: id "${c.id}" is already used by ${owner} in this collection`);
    }
  }

  const skipped = authored[unit].length - incoming.length;
  console.log(
    `${unit}: ${cards.items.length} cards + ${incoming.length} new` +
      (skipped ? ` (${skipped} already present, skipped)` : ""),
  );
  for (const c of incoming) console.log(`    ${c.target}  —  ${c.english}  [${c.addition}]`);
  total += incoming.length;
}

if (problems.length) {
  console.error("\nPROBLEMS:\n  " + problems.join("\n  "));
  process.exit(1);
}

if (dry) {
  console.log(`\nWould add ${total} card(s). Nothing written.`);
  process.exit(0);
}

for (const unit of targetUnits) {
  if (only && unit !== only) continue;
  const cardsPath = join(BOOK, unit, "cards.json");
  const corpusPath = join(BOOK, unit, "corpus.json");

  // Re-read here rather than reusing the plan's copy: mergeIntoCardsFile re-reads too, and the
  // dashboard is editable for the whole time this runs.
  const present = new Set(JSON.parse(readFileSync(cardsPath, "utf-8")).items.map((i) => i.id));
  const incoming = authored[unit].filter((c) => !present.has(c.id));
  if (!incoming.length) continue;

  mergeIntoCardsFile(cardsPath, { append: incoming, reason: REASON });

  // Mirror into corpus.json in the SAME order, so the two files stay a matched pair.
  const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
  const inCorpus = new Set(corpus.items.map((i) => i.id));
  const addCorpus = incoming.filter((c) => !inCorpus.has(c.id)).map(toCorpusItem);
  if (addCorpus.length) {
    corpus.items.push(...addCorpus);
    writeUnitJson(corpusPath, corpus, { reason: REASON });
  }
}

console.log(`\nAdded ${total} card(s).`);

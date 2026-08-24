#!/usr/bin/env node
//
// SPENT: 2026-08-24. A one-off MIGRATION, not a standing tool.
// It folded the Nihongo 101 course and the two Nihongo 102 class-note PDFs into the book's extras
// units, once, from the routing table in docs/designs/nihongo-absorption-2026-08.md. It is kept for
// the record, and because re-reading what a migration actually did is the only way to understand the
// shape of the data it left behind. Do not run it as part of any procedure: the collection it reads
// from is retired, and re-running it would re-apply placements a human has already reviewed.
//
// What it does, per destination unit:
//   1. appends the routed cards to cards.json (moved course cards keep their id, so the
//      `abid:<id>` tag still binds them to their live Anki note and their scheduling survives)
//   2. mirrors them into corpus.json in the SAME order, built from the corpus schema's own fields
//   3. copies each moved card's audio takes across, including hand-trimmed manual ones
//   4. adds the two hint pairs the post-merge collision analysis requires
//
// Usage:
//   node scripts/absorb-nihongo.mjs --dry          print the plan, touch nothing
//   node scripts/absorb-nihongo.mjs                do it
//   ... --only chapter-5-extras                    one unit
//
// It is idempotent: a card already present by id is skipped, so a re-run after a failure is safe.
// It never touches Anki, and it never marks anything reviewed or done.
import { readFileSync, existsSync, copyFileSync, mkdirSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mergeIntoCardsFile } from "../src/cards/mergeIntoCardsFile.js";
import { writeUnitJson } from "../src/util/unitWrite.js";

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const BOOK = join(REPO, "output/epubs/japanese-for-busy-people-book-1-kana");
const COURSE = join(REPO, "output/courses/nihongo-101-course-n5");
const ROUTING = join(REPO, "docs/designs/nihongo-absorption-2026-08.routing.json");
const NEWCARDS = join(REPO, "docs/designs/nihongo-absorption-2026-08.cards.json");
const REASON = "nihongo-absorption";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

// Fields the CORPUS schema declares. Built explicitly rather than by copying the card, because the
// corpus schema is additionalProperties:false and a cards-only field (ttsText, any audio*,
// pronunciation) makes the file invalid the moment it is copied across. extras-pass.md documents
// this trap; every extras unit built before it was written carried the bug.
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

// Every audio filename a card points at. Copying all of them keeps the reviewer's hand-picked take,
// its untrimmed original and the alternate takes, which are human review work that must not be
// regenerated.
const AUDIO_FIELDS = ["audio", "audioOriginal", "audioAuto", "audioManual", "altAudio"];

const courseCards = new Map();
const courseUnitOf = new Map();
for (const lesson of ["lesson-0", "lesson-2", "lesson-3"]) {
  const p = join(COURSE, lesson, "cards.json");
  if (!existsSync(p)) continue;
  for (const item of readJson(p).items) {
    courseCards.set(item.id, item);
    courseUnitOf.set(item.id, lesson);
  }
}

const authored = readJson(NEWCARDS);
const newByTarget = new Map();
for (const [unit, list] of Object.entries(authored)) {
  if (unit === "_") continue;
  for (const c of list) newByTarget.set(c.target, { unit, card: c });
}

const rows = readJson(ROUTING).rows.filter(
  (r) => r.disposition === "move" || r.disposition === "new",
);

// Build the append list per destination unit, in routing order.
const plan = new Map();
const problems = [];
for (const r of rows) {
  const unit = r.destination;
  if (only && unit !== only) continue;
  let card;
  if (r.disposition === "move") {
    const src = courseCards.get(r.cardId);
    if (!src) {
      problems.push(`move row has no course card: ${r.cardId}`);
      continue;
    }
    card = JSON.parse(JSON.stringify(src));
    // The routing table owns the shipped text: it carries the [number] placeholder rewrite.
    if (r.targetWas) card.target = r.target;
    if (r.englishWas) card.english = r.english;
    if (r.targetWas && r.pronunciation) card.pronunciation = r.pronunciation;
    if (r.cueOnMerge) {
      card.hint = r.cueOnMerge.hint;
      if (r.cueOnMerge.note) card.note = r.cueOnMerge.note;
    }
    const origin = `Moved from the Nihongo 101 course (${courseUnitOf.get(r.cardId)}) by the 2026-08-24 absorption; see docs/designs/nihongo-absorption-2026-08.md. Placed here because: ${r.reason}`;
    card.reviewNote = card.reviewNote ? `${card.reviewNote} ${origin}` : origin;
  } else {
    const hit = newByTarget.get(r.target);
    if (!hit) {
      problems.push(`new row has no authored card: ${r.target}`);
      continue;
    }
    if (hit.unit !== unit)
      problems.push(
        `authored card ${hit.card.id} is filed under ${hit.unit} but routed to ${unit}`,
      );
    card = JSON.parse(JSON.stringify(hit.card));
  }
  if (!plan.has(unit)) plan.set(unit, []);
  plan.get(unit).push(card);
}

if (problems.length) {
  console.error("REFUSING: the routing table and the card files disagree:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

// The two hint pairs the post-merge collision analysis requires on the BOOK side. These sit in base
// units, which are in the dedup library, so only the `hint` field is touched and the review state is
// left alone: un-reviewing a base unit would delete its library entry and corrupt every later
// chapter's backward dedup.
const BOOK_HINTS = [
  { unit: "chapter-8", id: "nomimasu", hint: "the verb, what you do with a drink" },
  { unit: "chapter-10", id: "suzushii", hint: "pleasantly cool weather" },
];

let appended = 0;
let copied = 0;
const units = [...plan.keys()].sort(
  (a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]),
);

for (const unit of units) {
  const dir = join(BOOK, unit);
  const cardsPath = join(dir, "cards.json");
  const corpusPath = join(dir, "corpus.json");
  if (!existsSync(cardsPath)) {
    console.error(`no such unit: ${unit}`);
    process.exit(1);
  }
  const before = readJson(cardsPath);
  const have = new Set(before.items.map((i) => i.id));
  const add = plan.get(unit).filter((c) => !have.has(c.id));
  const moved = add.filter((c) => courseCards.has(c.id)).length;

  console.log(
    `${unit.padEnd(20)} +${String(add.length).padStart(2)} card(s)  (${moved} moved, ${add.length - moved} new)` +
      (add.length !== plan.get(unit).length
        ? `  [${plan.get(unit).length - add.length} already present]`
        : ""),
  );
  if (dry) {
    for (const c of add) console.log(`     ${c.id.padEnd(34)} ${c.target}`);
    appended += add.length;
    continue;
  }
  if (!add.length) continue;

  mergeIntoCardsFile(cardsPath, { append: add, reason: REASON });

  const corpus = readJson(corpusPath);
  const haveCorpus = new Set(corpus.items.map((i) => i.id));
  corpus.items.push(...add.filter((c) => !haveCorpus.has(c.id)).map(toCorpusItem));
  writeUnitJson(corpusPath, corpus, { reason: REASON });

  const audioDir = join(dir, "audio");
  mkdirSync(audioDir, { recursive: true });
  for (const c of add) {
    const srcLesson = courseUnitOf.get(c.id);
    if (!srcLesson) continue;
    const from = join(COURSE, srcLesson, "audio");
    const names = new Set();
    for (const f of AUDIO_FIELDS) if (c[f]) names.add(c[f]);
    // The .orig sibling of every take is the audio recovery path and is kept deliberately.
    if (c.audioTextHash) {
      for (const f of readdirSync(from)) if (f.startsWith(c.audioTextHash)) names.add(f);
    }
    for (const name of names) {
      const s = join(from, name);
      const d = join(audioDir, name);
      if (existsSync(s) && !existsSync(d)) {
        copyFileSync(s, d);
        copied++;
      }
    }
  }
  appended += add.length;
}

if (!only) {
  for (const h of BOOK_HINTS) {
    const p = join(BOOK, h.unit, "cards.json");
    const cur = readJson(p).items.find((i) => i.id === h.id);
    if (!cur) {
      console.error(`book hint target missing: ${h.id} in ${h.unit}`);
      process.exit(1);
    }
    if (cur.hint === h.hint) continue;
    console.log(`${h.unit.padEnd(20)} hint on ${h.id}: "${h.hint}"`);
    if (dry) continue;
    mergeIntoCardsFile(p, {
      byId: new Map([[h.id, { hint: h.hint }]]),
      ownedFields: ["hint"],
      reason: REASON,
    });
    // Mirror into the corpus so the review and the deck agree, the way every other writer does.
    const cp = join(BOOK, h.unit, "corpus.json");
    const corpus = readJson(cp);
    const ci = corpus.items.find((i) => i.id === h.id);
    if (ci && ci.hint !== h.hint) {
      ci.hint = h.hint;
      writeUnitJson(cp, corpus, { reason: REASON });
    }
  }
}

console.log(
  `\n${dry ? "WOULD append" : "appended"} ${appended} card(s) across ${units.length} unit(s)` +
    (dry ? "" : `, copied ${copied} audio file(s)`),
);
if (dry) console.log("dry run , nothing was written");

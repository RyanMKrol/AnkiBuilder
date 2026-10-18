#!/usr/bin/env node
//
// SPENT: 2026-10-18. A one-off MIGRATION, not a standing tool.
// It ran once against the Genki I reading collection in the QA fix pass (docs/designs/
// qa-fix-pass-2026-10.md, task F3) and rewrote the silent kanji cards listed below as the voiced
// word cards the book teaches. Do not run it as part of any procedure: from now on the book pass
// does this itself when it merges a chapter (src/reading/characterGaps.js, rewriteEarlierCard), and
// the owner reviews each rewritten card at the audio gate. Running it again finds nothing to do on
// the Genki collection, but on another collection its hand table (HAND below) would be wrong.
//
// Why it exists. Owner ruling 2026-10-18 (DECISIONS.md, "A single kanji the book teaches as a word
// is the word, across chapters too"): when a later chapter teaches as a word a kanji an earlier
// chapter carded as a silent character, the earlier card becomes the word, in place and under the
// same id, so the delivered Anki note updates rather than migrates. The book pass only applies that
// to units it still merges, and every Genki unit is done, so the cards already shipped need this
// backfill. The preflight check `reading-kanji-taught-as-word` lists what it should touch.
//
// What it does, per silent single-kanji card in the collection:
//   - finds the first chapter (book order) whose readers recorded the kanji as a word with a reading
//     (candidates/tables.json, chapter.json, images.json and as-generated.json), taking the English
//     from that chapter's as-generated.json where it has one, else from the readers' output;
//   - decides its fate with T2's own rule (earlierCardFate): one reading in the whole book makes the
//     card the voiced word; two readings (年 nen / toshi, 後 go / ato) keep it silent with both senses
//     joined in the English;
//   - rewrites it with rewriteEarlierCard, which writes cards.json AND corpus.json through
//     writeUnitJson and updates the unit's candidates/characters.json, so a later book pass does not
//     turn the card back into a kanji card.
// The colour nouns 赤 青 白 黒 are words by rule (the plugin's `wordsByRule`).
//
// Usage:
//   node scripts/backfill-reading-word-cards.mjs <collectionDir> [--dry]
//
// --dry prints the plan (each card, its fate, the old and new English, the reading and romaji, and
// any English another word card in the collection already answers with) and writes nothing.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { readingScheme } from "../src/reading/readingSchemes.js";
import {
  CHARACTERS_FILE,
  bookWordReadings,
  earlierCardFate,
  fateReadings,
  isCharacterCardIn,
  rewriteEarlierCard,
} from "../src/reading/characterGaps.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirArg = args.find((a) => !a.startsWith("--"));
if (!dirArg) {
  console.error("Usage: node scripts/backfill-reading-word-cards.mjs <collectionDir> [--dry]");
  process.exit(2);
}
const collectionDir = resolve(dirArg);

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
};

/**
 * The cases the readers' output gets wrong or does not hold, each checked against the book by hand.
 * `skip` leaves the card alone; otherwise the fields given replace what the readers recorded.
 */
const HAND = {
  // Lesson 8 teaches 袋をお願いします (fukuro o onegai shimasu); the words-only cut excluded the phrase
  // as "its words are carded on their own: 袋", so 袋 is the word fukuro, taught in this same chapter.
  袋: { reading: "ふくろ", english: "Bag", romaji: "fukuro", fromPhrase: "袋をお願いします" },
  // The R&W 11 reader put 有る's reading on the bare kanji. 有 alone is never read ある, so it stays
  // the silent character card.
  有: { skip: "the reader gave 有 the reading of 有る; the kanji alone is never read ある" },
  // Two readings as a word: the card stays silent and these are the senses joined to its English.
  年: { english: "... years" },
  後: { english: "in ... time" },
  // The R&W 12 table's word; that chapter's readers' item never reached the romanization pass.
  天: { romaji: "ten" },
  // Kept from the card it replaces, because the book's bare gloss would collide with another kanji
  // card (card rules 9): 午 is "Noon", 泉 is "Spring", 物 is "Thing (concrete object)".
  昼: { english: "Daytime; noon" },
  春: { english: "Spring (season)" },
  事: { english: "Thing (abstract); matter" },
  // The colour nouns answer as the plugin's `wordsByRule` does, all four alike, rather than with
  // whichever chapter's "Red color" a reader happened to copy.
  赤: { english: "Red" },
  青: { english: "Blue" },
  白: { english: "White" },
  黒: { english: "Black" },
};

const READER_FILES = ["tables.json", "chapter.json", "images.json"];

const unitNames = readdirSync(collectionDir).filter((n) => /^chapter-\d+$/.test(n));
const units = unitNames
  .map((name) => {
    const dir = join(collectionDir, name);
    const cards = readJson(join(dir, "cards.json"));
    return cards ? { name, dir, cards, position: cards.meta?.chapterNumber ?? Infinity } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.position - b.position);
if (!units.length) {
  console.error(`No units under ${collectionDir}`);
  process.exit(2);
}
const language = units[0].cards.meta?.targetLanguage;
const scheme = readingScheme(language);
if (!scheme?.characterCards) {
  console.error(`${collectionDir}: language ${language} has no character cards; nothing to do`);
  process.exit(2);
}
const bookReadings = bookWordReadings(collectionDir, scheme);

// Romaji the romanization pass already produced, by card id (ids are a hash of the written form,
// so the dropped word's id is the earlier card's id).
const romajiById = new Map();
for (const unit of units) {
  for (const row of readJson(join(unit.dir, "candidates", "romanization.json"))?.items ?? []) {
    if (row?.id && row.pronunciation && !romajiById.has(row.id)) {
      romajiById.set(row.id, row.pronunciation);
    }
  }
}

/** The first chapter, in book order, that teaches `char` as a word: its reading and English. */
function firstTeaching(char) {
  for (const unit of units) {
    const snapshot = readJson(join(unit.dir, "as-generated.json"));
    const generated = (snapshot?.items ?? []).find(
      (i) => i.target === char && i.ttsText && (!i.kind || i.kind === "word"),
    );
    let found = null;
    for (const file of READER_FILES) {
      const items = readJson(join(unit.dir, "candidates", file))?.items ?? [];
      found = items.find((i) => i.target === char && i.kind !== "character" && i.reading);
      if (found) break;
    }
    if (!generated && !found) continue;
    const reading = (generated?.ttsText ?? found.reading).split(/[／/]/u)[0].trim();
    return {
      unit,
      reading,
      english: generated?.english ?? found.english,
      category: found?.category ?? null,
    };
  }
  return null;
}

const plan = [];
const skipped = [];
for (const unit of units) {
  const record = readJson(join(unit.dir, CHARACTERS_FILE));
  for (const item of unit.cards.items) {
    if (item.excluded || !scheme.isCharacterTarget(item.target)) continue;
    if (!isCharacterCardIn(item, record, scheme) || item.ttsText) continue;
    const hand = HAND[item.target] ?? {};
    if (hand.skip) {
      skipped.push({ unit, item, reason: hand.skip });
      continue;
    }
    const rule = scheme.wordsByRule?.[item.target];
    let taught = firstTeaching(item.target);
    if (hand.fromPhrase) {
      const phrase = unit.cards.items.find((i) => i.target === hand.fromPhrase);
      if (!phrase) {
        skipped.push({
          unit,
          item,
          reason: `the phrase ${hand.fromPhrase} is not in ${unit.name}`,
        });
        continue;
      }
      taught = { unit, reading: hand.reading, english: hand.english, category: null };
    }
    if (!taught && rule) {
      taught = { unit, reading: rule.reading, english: rule.english, category: rule.category };
    }
    if (!taught) continue;
    const readings = [taught.reading];
    const shape = { target: item.target, ttsText: undefined, character: true };
    const fate = earlierCardFate(shape, readings, { bookReadings });
    const allReadings = fateReadings(shape, readings, { bookReadings });
    const romaji =
      hand.romaji ??
      romajiById.get(item.id) ??
      (rule && rule.reading === taught.reading ? rule.romaji : null);
    if (fate === "word" && !romaji) {
      skipped.push({ unit, item, reason: `no romaji for ${taught.reading}; add it to HAND` });
      continue;
    }
    const word = {
      target: item.target,
      english: hand.english ?? taught.english,
      ttsText: taught.reading,
      pronunciation: romaji ?? "",
      category:
        fate === "word" ? (rule?.category ?? taught.category ?? item.category) : item.category,
    };
    plan.push({
      unit,
      item,
      word,
      fate,
      readings: allReadings,
      chapterLabel: taught.unit.cards.meta?.chapterLabel ?? taught.unit.name,
    });
  }
}

// The English every other shipped card of the same kind answers with, grouped the way the
// reading-distinct-english check groups them (a single kanji with single kanji, a word with words),
// to show a collision before it is written.
const answers = new Map();
for (const unit of units) {
  for (const item of unit.cards.items) {
    if (item.excluded) continue;
    const key = `${scheme.isCharacterTarget(item.target)}:${String(item.english ?? "").toLowerCase()}`;
    if (!answers.has(key)) answers.set(key, []);
    answers.get(key).push({ where: `${unit.name} ${item.target}`, id: item.id });
  }
}

// A card the rule keeps silent whose English already carries every sense is left alone.
const joined = (a, b) => [...new Set([a, b].flatMap((e) => String(e).split(/\s*;\s*/)))].join("; ");
for (const step of [...plan]) {
  if (step.fate !== "word" && joined(step.item.english, step.word.english) === step.item.english) {
    plan.splice(plan.indexOf(step), 1);
    skipped.push({
      unit: step.unit,
      item: step.item,
      reason: `stays silent (${step.readings.join(", ")}) and its English already says it all`,
    });
  }
}

console.log(`${collectionDir}\n`);
for (const step of plan) {
  const { unit, item, word, fate } = step;
  const english =
    fate === "word" ? word.english : `${item.english} + ${word.english} (joined, stays silent)`;
  const clash =
    fate === "word"
      ? (answers.get(`true:${word.english.toLowerCase()}`) ?? []).filter((c) => c.id !== item.id)
      : [];
  console.log(
    `  ${unit.name} ${item.id} ${item.target}  ${fate}  "${item.english}" -> "${english}"` +
      (fate === "word"
        ? `  ${word.ttsText} ${word.pronunciation}`
        : `  (${step.readings.join(", ")})`) +
      `  [taught in ${step.chapterLabel}]` +
      (clash.length ? `\n      SAME ENGLISH AS: ${clash.map((c) => c.where).join(", ")}` : ""),
  );
}
for (const { unit, item, reason } of skipped) {
  console.log(`  ${unit.name} ${item.id} ${item.target}  SKIPPED: ${reason}`);
}
const words = plan.filter((p) => p.fate === "word").length;
console.log(
  `\n${plan.length} card(s): ${words} become voiced words, ${plan.length - words} stay silent ` +
    `with both senses; ${skipped.length} skipped.`,
);
if (dry) {
  console.log("Dry run: nothing written.");
  process.exit(0);
}

let changed = 0;
for (const { unit, word, fate, readings, chapterLabel } of plan) {
  if (!existsSync(join(unit.dir, "cards.json"))) continue;
  if (rewriteEarlierCard(unit.dir, word, { fate, chapterLabel, scheme, readings })) changed += 1;
}
console.log(
  `Rewrote ${changed} card(s). Voiced words need audio: node src/cli/bin.js audio --run <unitDir>`,
);

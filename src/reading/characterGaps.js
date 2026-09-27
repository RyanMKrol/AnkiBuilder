// Character cards a chapter needs before the book teaches them (owner decisions, 2026-09-28).
//
// A reading deck cards each word as the book writes it, and Genki writes its vocabulary in full
// kanji from Lesson 3 (眼鏡, 聞く) while teaching each kanji on its own much later, or never. So a
// chapter's words use characters nothing has carded yet. Built chapter by chapter, a chapter cannot
// know a later one will teach them, so it fills its own gaps: for each character its words use that
// no card in this chapter or an earlier one covers, it adds a character card whose meaning and
// readings come from the language's dictionary, then a model for any the dictionary lacks, and then
// one review agent checks every card it generated. When the book later teaches the character, its
// own data replaces the generated card's (applyBookCharacters), and the later card is the same card:
// the merge carded it once, here.
//
// Nothing here knows a language. The language plugin's `characterSource` (src/reading/readingSchemes.js)
// says which characters a word is made of, looks one up, and writes its readings line.

import { existsSync, readFileSync, utimesSync } from "fs";
import { join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";
import { editedSinceMerge, readingStudyOrder } from "./studyOrder.js";

export const CHARACTERS_FILE = "candidates/characters.json";
const REPORT = "reading-report.json";

const readJson = (path, fallback = null) => {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
};
const writeJson = (path, body) => writeFileAtomic(path, `${JSON.stringify(body, null, 2)}\n`);

/** The characters a unit already cards on their own (a single-character front). */
export function cardedCharacters(items, scheme) {
  return new Set(
    items
      .filter((item) => !item.excluded && scheme.isCharacterTarget(item.target))
      .map((item) => item.target),
  );
}

/**
 * The characters this unit's words use that neither it nor an earlier unit cards, in the order its
 * words first use them, each with the words that use it.
 */
export function characterGaps(items, { scheme, earlier = new Set() }) {
  const source = scheme?.characterSource;
  if (!source) return [];
  const have = new Set([...earlier, ...cardedCharacters(items, scheme)]);
  const gaps = new Map();
  for (const item of items) {
    if (item.excluded || scheme.isCharacterTarget(item.target)) continue;
    for (const character of source.charactersIn(item.target)) {
      if (have.has(character)) continue;
      if (!gaps.has(character)) gaps.set(character, []);
      gaps.get(character).push({ target: item.target, reading: item.ttsText ?? null });
    }
  }
  return [...gaps].map(([target, usedIn]) => ({ target, usedIn }));
}

/**
 * Fills a written unit's character gaps IN PLACE. Returns `{ skipped, added, fromModel, corrected,
 * reopened }`. A unit marked done is not changed; a reviewed one is, and its review is withdrawn.
 * `agents.writeCharacters(entries)` fills what the dictionary lacks and `agents.reviewCharacters(entries)`
 * returns corrections by target; both are model calls, faked in tests.
 */
export async function fillCharacterGaps(
  unitDir,
  { scheme, earlier = new Set(), cardId, agents, log = () => {} },
) {
  const cardsPath = join(unitDir, "cards.json");
  const cards = readJson(cardsPath);
  if (!cards || !scheme?.characterSource) return { skipped: "no cards or no character source" };
  const gaps = characterGaps(cards.items, { scheme, earlier });
  if (!gaps.length) return { added: 0 };
  // A unit marked done is finished (packaged, maybe delivered): it is not given new cards. A unit only
  // REVIEWED still gets them, and its review is withdrawn, because a card nobody has seen is not
  // covered by a sign-off given before it existed. On Genki, Chapter 05 had been reviewed and is where
  // 44 kanji are first used; leaving it alone would have carded them chapters later, or never.
  if (cards.meta?.done === true) {
    return { skipped: `marked done, so ${gaps.length} gap(s) left unfilled` };
  }
  const reopened = cards.meta?.reviewed === true && cards.items.length > 0;
  const source = scheme.characterSource;

  // 1. The dictionary.
  let entries = gaps.map((gap) => {
    const found = source.lookup(gap.target);
    return found ? { ...gap, ...found, source: "dictionary" } : { ...gap, source: null };
  });
  // 2. A model for what the dictionary lacks.
  const missing = entries.filter((entry) => !entry.source);
  let fromModel = 0;
  if (missing.length) {
    const written = await agents.writeCharacters(missing);
    entries = entries.map((entry) => {
      const w = entry.source ? null : written.get(entry.target);
      if (!w) return entry;
      fromModel++;
      return { ...entry, english: w.english, readings: w.readings, source: "model" };
    });
  }
  const unfilled = entries.filter((entry) => !entry.source).map((entry) => entry.target);
  if (unfilled.length) log(`no meaning or readings found for ${unfilled.join(" ")}; left out`);
  entries = entries.filter((entry) => entry.source);
  if (!entries.length) return { added: 0, fromModel };

  // 3. One review of everything generated here.
  const corrections = await agents.reviewCharacters(entries);
  let corrected = 0;
  entries = entries.map((entry) => {
    const fix = corrections.get(entry.target);
    if (!fix) return { ...entry, review: "ok" };
    corrected++;
    return {
      ...entry,
      english: fix.english ?? entry.english,
      readings: fix.readings ?? entry.readings,
      review: fix.reason ?? "corrected",
    };
  });

  const noteFor = (entry) =>
    `Not taught by the book yet: meaning and readings from ${
      entry.source === "dictionary" ? source.name : "a model"
    }, checked by a reviewer.`;
  const generated = entries.map((entry) => ({
    id: cardId(entry.target),
    target: entry.target,
    english: entry.english,
    category: "Other",
    pronunciation: source.line(entry.readings),
    reviewNote: noteFor(entry),
  }));

  const wasEdited = editedSinceMerge(unitDir);
  const isCharacter = (item) => scheme.isCharacterTarget(item.target);
  const items = readingStudyOrder([...cards.items, ...generated], { isCharacter });
  const meta = reopened ? { ...cards.meta, reviewed: false } : cards.meta;
  writeJson(cardsPath, { ...cards, meta, items });
  const corpusPath = join(unitDir, "corpus.json");
  const corpus = readJson(corpusPath);
  if (corpus) {
    const withoutRomaji = generated.map((card) => {
      const rest = { ...card };
      delete rest.pronunciation;
      return rest;
    });
    const corpusItems = readingStudyOrder([...corpus.items, ...withoutRomaji], { isCharacter });
    const corpusMeta = reopened ? { ...corpus.meta, reviewed: false } : corpus.meta;
    writeJson(corpusPath, { ...corpus, meta: corpusMeta, items: corpusItems });
  }
  const reportPath = join(unitDir, REPORT);
  if (!wasEdited && existsSync(reportPath)) {
    const now = new Date();
    utimesSync(reportPath, now, now);
  }
  const record = readJson(join(unitDir, CHARACTERS_FILE), { generated: [] });
  writeJson(join(unitDir, CHARACTERS_FILE), {
    generated: [
      ...record.generated,
      ...entries.map(({ target, english, readings, source: from, usedIn, review }) => ({
        target,
        english,
        readings,
        source: from,
        usedIn: usedIn.map((u) => u.target),
        review,
      })),
    ],
  });
  return { added: generated.length, fromModel, corrected, ...(reopened ? { reopened: true } : {}) };
}

/**
 * When the book teaches a character that an earlier chapter carded from a dictionary or a model, the
 * book's own meaning and readings replace the generated ones on that card, in place. The card is the
 * same card, so this is a field update even in a unit already delivered. `bookCharacters` is
 * `Map<character, { meaning, readings, chapterLabel }>` from the language's `characterReadings`.
 * Returns the characters replaced.
 */
export function applyBookCharacters(unitDir, bookCharacters, { scheme }) {
  const record = readJson(join(unitDir, CHARACTERS_FILE));
  if (!record?.generated?.length) return [];
  const cardsPath = join(unitDir, "cards.json");
  const cards = readJson(cardsPath);
  if (!cards) return [];
  const replaced = [];
  const generated = record.generated.map((entry) => {
    const book = bookCharacters.get(entry.target);
    if (!book || entry.replacedByBook) return entry;
    replaced.push(entry.target);
    return { ...entry, replacedByBook: book.chapterLabel };
  });
  if (!replaced.length) return [];
  const wasEdited = editedSinceMerge(unitDir);
  const items = cards.items.map((item) => {
    if (!replaced.includes(item.target)) return item;
    const book = bookCharacters.get(item.target);
    return {
      ...item,
      ...(book.meaning ? { english: book.meaning } : {}),
      pronunciation: scheme.characterSource.line(book.readings),
      reviewNote: `Meaning and readings from the book (${book.chapterLabel}).`,
    };
  });
  writeJson(cardsPath, { ...cards, items });
  const reportPath = join(unitDir, REPORT);
  if (!wasEdited && existsSync(reportPath)) {
    const now = new Date();
    utimesSync(reportPath, now, now);
  }
  writeJson(join(unitDir, CHARACTERS_FILE), { ...record, generated });
  return replaced;
}

/**
 * Removes, IN PLACE, a unit's character cards for characters an earlier unit already cards (the
 * earlier card was generated there, before this chapter taught the character). A unit marked done is
 * left alone; a reviewed one is changed and its review withdrawn. Returns the characters removed.
 */
export function dropCharactersCardedEarlier(unitDir, earlier, { scheme }) {
  const cardsPath = join(unitDir, "cards.json");
  const cards = readJson(cardsPath);
  if (!cards) return [];
  const repeat = (item) => scheme.isCharacterTarget(item.target) && earlier.has(item.target);
  const removed = cards.items.filter(repeat).map((item) => item.target);
  // As for new cards: a unit marked done is left alone; a reviewed one changes and is reopened.
  if (!removed.length || cards.meta?.done === true) return [];
  const reopen = (meta) => (meta?.reviewed === true ? { ...meta, reviewed: false } : meta);
  const wasEdited = editedSinceMerge(unitDir);
  writeJson(cardsPath, {
    ...cards,
    meta: reopen(cards.meta),
    items: cards.items.filter((item) => !repeat(item)),
  });
  const corpusPath = join(unitDir, "corpus.json");
  const corpus = readJson(corpusPath);
  if (corpus) {
    writeJson(corpusPath, {
      ...corpus,
      meta: reopen(corpus.meta),
      items: corpus.items.filter((i) => !repeat(i)),
    });
  }
  const reportPath = join(unitDir, REPORT);
  if (!wasEdited && existsSync(reportPath)) {
    const now = new Date();
    utimesSync(reportPath, now, now);
  }
  return removed;
}

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

import { existsSync, readFileSync, readdirSync, statSync, utimesSync } from "fs";
import { basename, join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";
import { writeUnitJson } from "../util/unitWrite.js";
import { projectCorpusItem } from "../model/index.js";
import { editedSinceMerge, readingStudyOrder } from "./studyOrder.js";

export const CHARACTERS_FILE = "candidates/characters.json";

/**
 * The version of the character review (docs/reading-character-review-prompt.md) a generated card was
 * checked under. RAISE IT when that prompt changes what the reviewer fixes: the book pass re-reviews,
 * one call per chapter, every generated card checked under an older version (reReviewCharacters).
 * 1: the first review, which kept dictionary senses a learner never meets. 2: meanings judged against
 * the words that use the character. 3: at most two meanings, the words' sense first, and only jōyō
 * readings plus any the words need; the Genki run under 2 still left 172 of 384 cards dictionary-like
 * (若 "Young; if; perhaps", readings にゃ and くるお) (2026-09-28). 4: the character's own meaning,
 * never its word's (将 "Future" from 将来), and no two cards with one answer (洗 and 濯 both "Wash")
 * (2026-10-14).
 */
export const CHARACTER_REVIEW_VERSION = 4;
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
    ...record,
    generated: [
      ...record.generated,
      ...entries.map(({ target, english, readings, source: from, usedIn, review }) => ({
        target,
        english,
        readings,
        source: from,
        usedIn: usedIn.map((u) => u.target),
        review,
        reviewVersion: CHARACTER_REVIEW_VERSION,
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
    // A character the book has since taught as a word is the word's card now (rewriteEarlierCard).
    if (!book || entry.replacedByBook || entry.taughtAsWord) return entry;
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

// ---- a kanji a later chapter teaches as a word ------------------------------------------------
//
// Owner ruling, 2026-10-18 (DECISIONS.md, "A single kanji the book teaches as a word is the word,
// across chapters too"). A chapter that cards a kanji as a silent character, because its words use
// it before the book teaches it, used to keep that card when a later chapter taught the kanji as a
// word: the word was dropped as a repeat and nothing said so. 27 Genki kanji lost their voiced card
// that way (春 haru, 海 umi, 話 hanashi). Now the earlier card BECOMES the word, in place and under
// the same id, so it stays the same Anki note. Two exceptions, both the language plugin's to know:
//   - a kanji the book reads two ways as a word (年 nen and toshi, 後 go and ato) has no single right
//     audio, so its card stays silent and its English carries every sense;
//   - a word the book teaches by rule rather than by a vocabulary line (the colour nouns 赤 青 白 黒)
//     counts as taught although the readers saw only the character (`scheme.wordsByRule`).

const WORD_WINS_REASON = "word-wins";

/**
 * Whether a unit's single-character card is a CHARACTER card (meaning only, silent unless its one
 * official reading voices it) rather than the card of a single-character word. `record` is the
 * unit's candidates/characters.json, whose `cards` names the voiced character cards.
 */
export function isCharacterCardIn(item, record, scheme) {
  if (!scheme?.isCharacterTarget?.(item?.target)) return false;
  return !item.ttsText || Boolean(record?.cards?.[item.target]);
}

/**
 * The word a unit's single-kanji card teaches, or null for a character card: `{ target, english,
 * ttsText, pronunciation, category, readings }`. A colour noun the book teaches by rule is its word
 * even when the card is the character.
 */
export function taughtWordOf(item, record, scheme) {
  if (!scheme?.isCharacterTarget?.(item?.target)) return null;
  if (!isCharacterCardIn(item, record, scheme)) {
    return {
      target: item.target,
      english: item.english,
      ttsText: item.ttsText,
      pronunciation: item.pronunciation ?? "",
      category: item.category,
      readings: [item.ttsText],
    };
  }
  const rule = scheme.wordsByRule?.[item.target];
  if (!rule) return null;
  return {
    target: item.target,
    english: rule.english,
    ttsText: rule.reading,
    pronunciation: rule.romaji,
    category: rule.category ?? item.category,
    readings: [rule.reading],
  };
}

// The readers' saved output: every item they found in the chapter, kept or dropped by the merge.
const READER_FILES = ["tables.json", "chapter.json", "images.json"];

/**
 * Every reading the book gives each single kanji AS A WORD, read from one unit: what the readers
 * found in its chapter (candidates/*.json, an item that is not a character and carries a reading),
 * the readings its merge found for one written form (`readingConflicts`) and the readings of every
 * word it left out for this rule (`dropped[].wordReadings`). `Map<character, Set<reading>>`. The
 * readers' output is what finds Genki's 年 read ねん in Lesson 9 and とし in Lesson 21: no single
 * chapter's merge sees both.
 */
export function wordReadingsInUnit(unitDir, scheme, into = new Map()) {
  const add = (target, readings) => {
    const form = String(target ?? "").trim();
    if (!scheme?.isCharacterTarget?.(form)) return;
    for (const raw of readings ?? []) {
      for (const part of String(raw ?? "").split(/[／/・,，、]/u)) {
        const reading = part.trim().replace(/^[〜~～]+|[〜~～]+$/gu, "");
        if (!reading) continue;
        if (!into.has(form)) into.set(form, new Set());
        into.get(form).add(reading);
      }
    }
  };
  for (const file of READER_FILES) {
    for (const item of readJson(join(unitDir, "candidates", file))?.items ?? []) {
      if (item?.kind !== "character" && item?.reading) add(item.target, [item.reading]);
    }
  }
  const report = readJson(join(unitDir, REPORT));
  for (const conflict of report?.readingConflicts ?? []) add(conflict.target, conflict.readings);
  for (const drop of report?.dropped ?? []) add(drop.target, drop.wordReadings);
  return into;
}

/** `wordReadingsInUnit` over every chapter of one reading collection (never another's). */
export function bookWordReadings(collectionDir, scheme) {
  const out = new Map();
  if (!scheme?.characterCards || !collectionDir || !existsSync(collectionDir)) return out;
  for (const name of readdirSync(collectionDir)) {
    if (/^chapter-\d+$/.test(name)) wordReadingsInUnit(join(collectionDir, name), scheme, out);
  }
  return out;
}

/**
 * What a later chapter teaching `prior.target` as a word (read `readings`) does to the earlier card
 * of it. `prior` is `{ target, ttsText, character }`. Returns "word" (the earlier character card
 * becomes this word), "both-senses" (the book reads the kanji more than one way as a word, so the
 * card is silent and its English joins the senses), or null (the earlier card is already this word:
 * a plain repeat).
 */
export function earlierCardFate(prior, readings, { bookReadings = new Map() } = {}) {
  const all = new Set([...(readings ?? []), ...(bookReadings.get(prior.target) ?? [])]);
  if (!prior.character && prior.ttsText) all.add(prior.ttsText);
  all.delete(undefined);
  all.delete("");
  if (all.size > 1) return "both-senses";
  return prior.character ? "word" : null;
}

/** Every reading the fate was decided on, the earlier word's own first. */
export function fateReadings(prior, readings, { bookReadings = new Map() } = {}) {
  const first = !prior.character && prior.ttsText ? [prior.ttsText] : [];
  return [
    ...new Set([...first, ...(readings ?? []), ...(bookReadings.get(prior.target) ?? [])]),
  ].filter(Boolean);
}

/** The reason a word left out for this rule is logged with, in the later unit's report. */
export function wordWinsReason(fate, where, readings = []) {
  if (fate === "word") {
    return `taught here as a word; the character card in ${where} is rewritten in place as this word (card rules 4)`;
  }
  if (fate === "both-senses") {
    return (
      `taught here as a word, and the book reads it more than one way (${readings.join(", ")}); ` +
      `the card in ${where} stays silent, with every sense in its English (card rules 4)`
    );
  }
  return `already carded in ${where} of this collection`;
}

const glossesOf = (english) =>
  String(english ?? "")
    .split(/\s*;\s*/)
    .map((g) => g.trim())
    .filter(Boolean);

function joinSenses(...englishes) {
  const seen = new Set();
  const out = [];
  for (const gloss of englishes.flatMap(glossesOf)) {
    const key = gloss.toLowerCase().replace(/[\s.,;:!?'"-]+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(gloss.replace(/\.+$/, ""));
  }
  return out.join("; ");
}

/**
 * Rewrites, IN PLACE and under the same id, an earlier unit's card of a single kanji that a later
 * chapter teaches as a word. `word` is `taughtWordOf`'s shape; `fate` is `earlierCardFate`'s answer.
 *
 * Both cards.json and corpus.json are written, through writeUnitJson (validated, backed up), the
 * corpus item projected to the corpus schema. The unit's characters.json stops calling the card a
 * character card (`cards[char]` goes, the generated entry is marked `taughtAsWord`), or the book
 * pass would complete it back into a kanji card on its next run. It is a field edit of one card, so
 * a unit already done or delivered is changed too, and its review stands; the reviewNote names the
 * chapter that teaches the word. A unit a person edited since its merge still reads as edited.
 * Returns whether the card changed.
 */
export function rewriteEarlierCard(unitDir, word, { fate, chapterLabel, scheme, readings = [] }) {
  if (!fate) return false;
  const cardsPath = join(unitDir, "cards.json");
  const cards = readJson(cardsPath);
  if (!cards) return false;
  const item = (cards.items ?? []).find((i) => !i.excluded && i.target === word.target);
  if (!item) return false;
  let next;
  if (fate === "word") {
    next = {
      ...item,
      english: word.english || item.english,
      category: word.category ?? item.category,
      ttsText: word.ttsText,
      pronunciation: word.pronunciation ?? "",
      reviewNote: `Taught as a word in ${chapterLabel}: this is the word's card, voiced.`,
    };
  } else {
    next = {
      ...item,
      english: joinSenses(item.english, word.english),
      reviewNote:
        `Taught as a word in ${chapterLabel}, which the book reads more than one way ` +
        `(${readings.join(", ")}): left silent, with every sense in the English.`,
    };
    delete next.ttsText;
    // A card that was a word loses its romaji with its voice; the character's readings line comes
    // from the dictionary (the book pass completes it to the book's own on its next run).
    if (item.ttsText) {
      const source = scheme?.characterSource;
      const found = source?.lookup?.(item.target)?.readings ?? null;
      const readingsLine = source?.complete ? source.complete(found, item.target, null) : found;
      next.pronunciation = readingsLine && source ? source.line(readingsLine) : "";
    }
  }
  // A single kanji is never spoken from its written form (readingPhase.js, spokenFromWrittenForm).
  delete next.ttsKanji;
  const record = readJson(join(unitDir, CHARACTERS_FILE));
  const changed = JSON.stringify(next) !== JSON.stringify(item);
  if (changed) {
    const wasEdited = editedSinceMerge(unitDir);
    writeUnitJson(
      cardsPath,
      { ...cards, items: cards.items.map((i) => (i === item ? next : i)) },
      { reason: WORD_WINS_REASON },
    );
    const corpusPath = join(unitDir, "corpus.json");
    const corpus = readJson(corpusPath);
    if (corpus) {
      const corpusItem = projectCorpusItem(next).item;
      writeUnitJson(
        corpusPath,
        { ...corpus, items: corpus.items.map((i) => (i.id === item.id ? corpusItem : i)) },
        { reason: WORD_WINS_REASON },
      );
    }
    const reportPath = join(unitDir, REPORT);
    if (!wasEdited && existsSync(reportPath)) {
      const now = new Date();
      utimesSync(reportPath, now, now);
    }
  }
  if (record) {
    const cardsRecord = { ...(record.cards ?? {}) };
    if (fate === "word") delete cardsRecord[word.target];
    const nextRecord = {
      ...record,
      generated: (record.generated ?? []).map((entry) =>
        entry.target === word.target ? { ...entry, taughtAsWord: chapterLabel } : entry,
      ),
      ...(record.cards ? { cards: cardsRecord } : {}),
    };
    if (JSON.stringify(nextRecord) !== JSON.stringify(record)) {
      writeJson(join(unitDir, CHARACTERS_FILE), nextRecord);
    }
  }
  return changed;
}

/**
 * Removes, IN PLACE, a unit's single-kanji cards that an earlier unit already cards, and logs each in
 * the unit's reading-report.json `dropped`. A character card simply goes: the earlier card covers it.
 * A WORD does not just go: the earlier card is rewritten as the word (rewriteEarlierCard), or kept
 * silent with both senses when the book reads the kanji two ways. `cardedIn` maps a character to the
 * earlier unit that cards it; `bookReadings` is `bookWordReadings` for the collection.
 *
 * A unit marked done is left alone; a reviewed one is changed and its review withdrawn. Returns
 * `{ removed, rewritten }`: the characters removed here, and `{ target, unitDir, fate }` for each
 * earlier card the rule rewrote.
 */
export function dropCharactersCardedEarlier(
  unitDir,
  earlier,
  { scheme, cardedIn = new Map(), chapterLabel = null, bookReadings = new Map() },
) {
  const cardsPath = join(unitDir, "cards.json");
  const cards = readJson(cardsPath);
  const none = { removed: [], rewritten: [] };
  if (!cards) return none;
  const repeat = (item) => scheme.isCharacterTarget(item.target) && earlier.has(item.target);
  const repeats = cards.items.filter(repeat);
  // As for new cards: a unit marked done is left alone; a reviewed one changes and is reopened.
  if (!repeats.length || cards.meta?.done === true) return none;
  const label = chapterLabel ?? cards.meta?.chapterLabel ?? basename(unitDir);
  const record = readJson(join(unitDir, CHARACTERS_FILE));
  const logged = [];
  const rewritten = [];
  for (const item of repeats) {
    const word = taughtWordOf(item, record, scheme);
    const earlierDir = cardedIn.get(item.target) ?? null;
    const earlierCards = earlierDir ? readJson(join(earlierDir, "cards.json")) : null;
    const where = earlierCards?.meta?.chapterLabel ?? "an earlier chapter";
    const prior = (earlierCards?.items ?? []).find((i) => !i.excluded && i.target === item.target);
    if (!word || !prior) {
      logged.push({
        target: item.target,
        producedBy: "book pass",
        reason: wordWinsReason(null, where),
        ...(word ? { wordReadings: word.readings } : {}),
      });
      continue;
    }
    const priorRecord = readJson(join(earlierDir, CHARACTERS_FILE));
    const shape = {
      target: item.target,
      ttsText: prior.ttsText,
      character: isCharacterCardIn(prior, priorRecord, scheme),
    };
    const fate = earlierCardFate(shape, word.readings, { bookReadings });
    const readings = fateReadings(shape, word.readings, { bookReadings });
    let failure = null;
    try {
      rewriteEarlierCard(earlierDir, word, { fate, chapterLabel: label, scheme, readings });
      if (fate) rewritten.push({ target: item.target, unitDir: earlierDir, fate });
    } catch (error) {
      failure = String(error.message).split("\n")[0];
    }
    logged.push({
      target: item.target,
      producedBy: "book pass",
      reason:
        wordWinsReason(fate, where, readings) +
        (failure ? `; the rewrite of that card FAILED: ${failure}` : ""),
      wordReadings: word.readings,
    });
  }
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
  // Every drop is logged where the merge logs its own (build-reading.mjs prints them), and the
  // report's time still says whether a person edited the unit since its merge.
  const reportPath = join(unitDir, REPORT);
  if (existsSync(reportPath)) {
    const before = statSync(reportPath);
    const report = readJson(reportPath, {});
    writeJson(reportPath, { ...report, dropped: [...(report.dropped ?? []), ...logged] });
    if (wasEdited) {
      utimesSync(reportPath, before.atime, before.mtime);
    } else {
      const now = new Date();
      utimesSync(reportPath, now, now);
    }
  }
  return { removed: repeats.map((item) => item.target), rewritten };
}

/**
 * Re-reviews, IN PLACE, a unit's generated character cards checked under an older review version
 * (CHARACTER_REVIEW_VERSION), in one call, and applies the reviewer's corrections to the cards. A card
 * the book has since replaced is not reviewed again; a unit marked done is left alone; a reviewed unit
 * whose cards change is reopened. Returns `{ reviewed, corrected }`.
 */
export async function reReviewCharacters(unitDir, { scheme, agents }) {
  const record = readJson(join(unitDir, CHARACTERS_FILE));
  const cardsPath = join(unitDir, "cards.json");
  const cards = readJson(cardsPath);
  if (!record?.generated?.length || !cards || cards.meta?.done === true) {
    return { reviewed: 0, corrected: 0 };
  }
  const stale = record.generated.filter(
    (entry) =>
      !entry.replacedByBook &&
      !entry.taughtAsWord &&
      (entry.reviewVersion ?? 1) < CHARACTER_REVIEW_VERSION,
  );
  if (!stale.length) return { reviewed: 0, corrected: 0 };
  const byTarget = new Map(cards.items.map((item) => [item.target, item]));
  const words = cards.items.filter((item) => !scheme.isCharacterTarget(item.target));
  const entries = stale.map((entry) => ({
    ...entry,
    english: byTarget.get(entry.target)?.english ?? entry.english,
    usedIn: words
      .filter((w) => String(w.target).includes(entry.target))
      .map((w) => ({ target: w.target, reading: w.ttsText ?? null })),
  }));
  const corrections = await agents.reviewCharacters(entries);
  const fixed = new Map();
  const generated = record.generated.map((entry) => {
    if (!stale.includes(entry)) return entry;
    const fix = corrections.get(entry.target);
    if (fix) fixed.set(entry.target, fix);
    return {
      ...entry,
      ...(fix?.english ? { english: fix.english } : {}),
      ...(fix?.readings ? { readings: fix.readings } : {}),
      review: fix ? (fix.reason ?? "corrected") : "ok",
      reviewVersion: CHARACTER_REVIEW_VERSION,
    };
  });
  if (fixed.size) {
    const reopened = cards.meta?.reviewed === true;
    const wasEdited = editedSinceMerge(unitDir);
    const items = cards.items.map((item) => {
      const fix = fixed.get(item.target);
      if (!fix) return item;
      return {
        ...item,
        ...(fix.english ? { english: fix.english } : {}),
        ...(fix.readings ? { pronunciation: scheme.characterSource.line(fix.readings) } : {}),
      };
    });
    writeJson(cardsPath, {
      ...cards,
      meta: reopened ? { ...cards.meta, reviewed: false } : cards.meta,
      items,
    });
    const corpusPath = join(unitDir, "corpus.json");
    const corpus = readJson(corpusPath);
    if (corpus) {
      const corpusItems = corpus.items.map((item) => {
        const fix = fixed.get(item.target);
        return fix?.english ? { ...item, english: fix.english } : item;
      });
      const corpusMeta = reopened ? { ...corpus.meta, reviewed: false } : corpus.meta;
      writeJson(corpusPath, { ...corpus, meta: corpusMeta, items: corpusItems });
    }
    const reportPath = join(unitDir, REPORT);
    if (!wasEdited && existsSync(reportPath)) {
      const now = new Date();
      utimesSync(reportPath, now, now);
    }
  }
  writeJson(join(unitDir, CHARACTERS_FILE), { ...record, generated });
  return { reviewed: stale.length, corrected: fixed.size };
}

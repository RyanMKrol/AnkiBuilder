import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveIso639Code } from "../model/iso639.js";
import { getLanguageFont } from "./fontLibrary.js";
import { unitDeckSegments, groupingSegments } from "./deckPath.js";
import { CARD_TEMPLATES } from "./cardTemplates.js";
import { modelCss } from "./cardStyles.js";
import { FIELD_NAMES, fieldValue } from "./noteFields.js";

// The note type's three halves each live in their own module, because collection.js opens a sqlite
// database at import time and the surfaces that only describe a card (the authoring prompts, the
// card-face preview) must not pay for that: ./cardTemplates.js (structure), ./cardStyles.js (CSS),
// ./noteFields.js (the fields and the card → field mapping). This file assembles them into a model.
const FIELD_SEP = "\x1f";
const DEFAULT_DECK_ID = 1;
// The single-deck path's own deck (buildCollection) and the multi-deck path's book/
// parent deck (buildMultiDeckCollection) never coexist in the same collection, so
// reusing id 2 for both is safe — each function builds its own independent `decks`
// blob.
const DECK_ID = 2;
const BOOK_DECK_ID = 2;
const chapterDeckId = (index) => BOOK_DECK_ID + 1 + index;
// Grouping-deck ids live well above the per-chapter ids so the two ranges can never overlap.
const GROUPING_DECK_ID_BASE = 900_000;

// Anki uses a literal "::" in a deck's own name to signal nesting (e.g.
// "Book::Chapter 2") — sanitize any occurrence out of a book/chapter name so it can't
// accidentally introduce an extra nesting level.
const sanitizeDeckNameSegment = (name) => name.replace(/::/g, "-");

// Reserved id-space per chapter when merging several chapters' notes into one
// collection — comfortably larger than any realistic single-chapter card count (even
// 10,000 cards uses only ~1/10th of one block), so chapter N's notes never collide
// with chapter N+1's.
const CHAPTER_ID_BLOCK = 1_000_000;
const MAX_ITEMS_PER_CHAPTER = CHAPTER_ID_BLOCK / 10;

// The note type is per-language: named `AnkiBuilder <lang>` with a stable, language-derived id.
// Anki keys note types by id, so this means one shared note type per language (its decks reuse it —
// no pile-up of duplicates) that never collides with another language's, and each language can carry
// its own styling (e.g. an embedded font — see fontLibrary.js). `lang` is the resolved ISO 639-1
// code where possible (e.g. "ja"), else the raw targetLanguage.
function languageLabel(targetLanguage) {
  return resolveIso639Code(targetLanguage) || targetLanguage || "?";
}

// A stable, unique-per-language model id, well above the small deck ids and comfortably inside the
// safe-integer range. Deterministic so the same language always yields the same id.
function languageModelId(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 131 + label.charCodeAt(i)) % 1_000_000;
  }
  return 1_000_000_000 + hash;
}

// Resolves the per-language note-type identity + optional embedded font for a deck's target
// language. `getFont` is injectable so tests can turn font embedding off.
function resolveModelSpec(targetLanguage, getFont) {
  const label = languageLabel(targetLanguage);
  return {
    modelId: languageModelId(label),
    modelName: `AnkiBuilder ${label}`,
    fontDescriptor: getFont(resolveIso639Code(targetLanguage)),
  };
}

const SCHEMA_SQL = `
CREATE TABLE col (
  id integer primary key,
  crt integer not null,
  mod integer not null,
  scm integer not null,
  ver integer not null,
  dty integer not null,
  usn integer not null,
  ls integer not null,
  conf text not null,
  models text not null,
  decks text not null,
  dconf text not null,
  tags text not null
);
CREATE TABLE notes (
  id integer primary key,
  guid text not null,
  mid integer not null,
  mod integer not null,
  usn integer not null,
  tags text not null,
  flds text not null,
  sfld text not null,
  csum integer not null,
  flags integer not null,
  data text not null
);
CREATE TABLE cards (
  id integer primary key,
  nid integer not null,
  did integer not null,
  ord integer not null,
  mod integer not null,
  usn integer not null,
  type integer not null,
  queue integer not null,
  due integer not null,
  ivl integer not null,
  factor integer not null,
  reps integer not null,
  lapses integer not null,
  left integer not null,
  odue integer not null,
  odid integer not null,
  flags integer not null,
  data text not null
);
CREATE TABLE revlog (
  id integer primary key,
  cid integer not null,
  usn integer not null,
  ease integer not null,
  ivl integer not null,
  lastIvl integer not null,
  factor integer not null,
  time integer not null,
  type integer not null
);
CREATE TABLE graves (
  usn integer not null,
  oid integer not null,
  type integer not null
);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

// `nowSeconds`: epoch SECONDS — every JSON-embedded `mod` field in this file (model,
// deck, dconf) uses seconds, matching notes.mod/cards.mod, NOT the milliseconds used
// by col.mod/col.scm or by note/card `id`s. See writeCollectionDb's own comment.

// The complete note-type definition for a target language, in AnkiConnect terms: the model name/id,
// ordered fields, card templates ({name, qfmt, afmt}), and the full CSS. This is what the deliverer
// pushes via createModel/updateModelTemplates/updateModelStyling, and what `buildModel` embeds into the
// `.apkg`. One definition, two consumers — so a field/template/CSS change propagates to Anki on the
// next deliver. `getFont` is injectable (tests turn font embedding off).
function noteTypeSpec(targetLanguage, { getFont = getLanguageFont } = {}) {
  const { modelId, modelName, fontDescriptor } = resolveModelSpec(targetLanguage, getFont);
  return {
    modelName,
    modelId,
    fields: [...FIELD_NAMES],
    templates: CARD_TEMPLATES.map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
    css: modelCss(fontDescriptor),
    fontDescriptor,
  };
}

function buildModel(nowSeconds, { modelId, modelName, fontDescriptor }) {
  return {
    [modelId]: {
      id: modelId,
      name: modelName,
      type: 0,
      mod: nowSeconds,
      usn: -1,
      sortf: 0,
      did: DECK_ID,
      tmpls: CARD_TEMPLATES.map((t, ord) => ({
        name: t.name,
        ord,
        qfmt: t.qfmt,
        afmt: t.afmt,
        did: null,
        bqfmt: "",
        bafmt: "",
      })),
      flds: FIELD_NAMES.map((name, ord) => ({
        name,
        ord,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
        media: [],
      })),
      css: modelCss(fontDescriptor),
      latexPre:
        "\\documentclass[12pt]{article}\\special{papersize=3in,5in}\\usepackage[utf8]{inputenc}\\usepackage{amssymb,amsmath}\\pagestyle{empty}\\setlength{\\parindent}{0in}\\begin{document}",
      latexPost: "\\end{document}",
      req: [
        [0, "any", [0]],
        [1, "any", [2]],
      ],
    },
  };
}

function deckRow(id, name, nowSeconds) {
  return {
    id,
    name,
    mod: nowSeconds,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: true,
    browserCollapsed: true,
    desc: "",
    dyn: 0,
    conf: 1,
    extendNew: 0,
    extendRev: 0,
  };
}

function buildDecks(nowSeconds, deckName) {
  return {
    [DEFAULT_DECK_ID]: deckRow(DEFAULT_DECK_ID, "Default", nowSeconds),
    [DECK_ID]: deckRow(DECK_ID, deckName, nowSeconds),
  };
}

// The book/parent deck holds no cards itself — Anki's client aggregates due counts
// under it purely from the "::" name prefix on its chapter sub-decks, no data
// modeling needed beyond giving the parent name its own row.
//
// A unit may sit one level deeper, under a GROUPING deck ("Lesson 1"), so a lesson and its extras
// unit nest together — see src/deck/deckPath.js, which owns that decision for both delivery paths.
// Grouping decks are emitted here as empty rows: no card's `did` ever points at one, because Anki
// studies a parent together with its children and a card-holding parent could not be studied alone.
// `sanitizeDeckNameSegment` still runs per segment, so a label containing "::" cannot invent a level
// of its own.
function buildMultiDecks(nowSeconds, bookName, chapterNames) {
  const book = sanitizeDeckNameSegment(bookName);
  const decks = {
    [DEFAULT_DECK_ID]: deckRow(DEFAULT_DECK_ID, "Default", nowSeconds),
    [BOOK_DECK_ID]: deckRow(BOOK_DECK_ID, book, nowSeconds),
  };
  chapterNames.forEach((chapterName, index) => {
    const id = chapterDeckId(index);
    const path = unitDeckSegments(chapterName).map(sanitizeDeckNameSegment).join("::");
    decks[id] = deckRow(id, `${book}::${path}`, nowSeconds);
  });
  // The card-less grouping decks. Their ids sit above the per-chapter block so they can never
  // collide with chapterDeckId(index).
  groupingSegments(chapterNames).forEach((group, i) => {
    const id = GROUPING_DECK_ID_BASE + i;
    decks[id] = deckRow(id, `${book}::${sanitizeDeckNameSegment(group)}`, nowSeconds);
  });
  return decks;
}

function buildDconf(nowSeconds) {
  return {
    1: {
      id: 1,
      mod: nowSeconds,
      name: "Default",
      usn: -1,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: {
        bury: false,
        delays: [1, 10],
        initialFactor: 2500,
        ints: [1, 4, 0],
        order: 1,
        perDay: 20,
      },
      rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
      lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
      dyn: false,
    },
  };
}

function buildConf(curDeck, activeDecks, modelId) {
  return {
    curDeck,
    curModel: modelId,
    nextPos: 1,
    estTimes: true,
    dueCounts: true,
    activeDecks,
    sortType: "noteFld",
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    newSpread: 0,
    dayLearnFirst: false,
    schedVer: 2,
    creationOffset: 0,
  };
}

// Masked to 31 bits (clearing the sign bit) so this always fits a signed 32-bit
// integer — the first 8 hex chars of a SHA1 digest are effectively random, so an
// unmasked value exceeds i32::MAX (2147483647) roughly half the time. csum is only
// ever used as a cheap duplicate-detection hint, never validated against a
// recomputed value, so narrowing it costs nothing real.
function fieldChecksum(sortField) {
  const digest = createHash("sha1").update(sortField, "utf-8").digest("hex");
  return parseInt(digest.slice(0, 8), 16) & 0x7fffffff;
}

// `chapterGroups`: [{ deckId, cards }], one entry per chapter (a single-entry array
// for the ordinary one-deck case). Each chapter gets its own reserved
// CHAPTER_ID_BLOCK of note/card ids, so merging several chapters' notes into one
// collection never collides even though each chapter's own `items` numbering
// restarts at 0. `position` (and so `due`, new-card order) runs as ONE counter across
// every chapter in order, so new cards surface chapter-by-chapter in book order.
//
// `now` (epoch milliseconds) seeds note/card `id`s — Anki uses millisecond epoch
// values as its id scheme. `nowSeconds` is a SEPARATE value for the `mod` column on
// both tables — unlike `col.mod`/`col.scm` (milliseconds), a note's and a card's own
// `mod` field is epoch SECONDS in Anki's actual schema. Passing the millisecond value
// there produces a modification time ~1000x in the future, which is the kind of
// out-of-range timestamp Anki's importer rejects.
function insertNotesAndCards(
  insertNote,
  insertCard,
  chapterGroups,
  now,
  nowSeconds,
  modelId,
  guidNamespace = null,
) {
  let position = 1;
  chapterGroups.forEach(({ deckId, cards }, chapterIndex) => {
    if (cards.items.length > MAX_ITEMS_PER_CHAPTER) {
      throw new Error(
        `chapter ${chapterIndex} has ${cards.items.length} item(s), exceeding the ` +
          `${MAX_ITEMS_PER_CHAPTER}-item-per-chapter id-block limit`,
      );
    }

    cards.items.forEach((card, itemIndex) => {
      const noteId = now + chapterIndex * CHAPTER_ID_BLOCK + itemIndex * 10;
      const flds = FIELD_NAMES.map((name) => fieldValue(card, name)).join(FIELD_SEP);
      const sortField = fieldValue(card, FIELD_NAMES[0]);

      // Anki matches guids COLLECTION-wide, so a bare card.id from one book collides with the
      // same slug in another. Namespaced (`<namespace>/<card.id>`) for books/courses created
      // after the namespace existed; older decks keep bare ids — rewriting theirs would orphan
      // live scheduling. See materializeBookInOutput.
      insertNote.run(
        noteId,
        guidNamespace ? `${guidNamespace}/${card.id}` : card.id,
        modelId,
        nowSeconds,
        flds,
        sortField,
        fieldChecksum(sortField),
      );

      // BOTH card rows, always — including for a card carrying `dirSuspended`. Omitting a row here
      // would be inert AND self-reversing: Anki's Check Database and any template update regenerate
      // a missing card row for a note whose front is non-empty. Direction suppression happens at
      // DELIVERY, by suspending the unwanted ordinal (src/anki/directionSuspension.js), which is the
      // only form of it that survives routine housekeeping.
      //
      // The stated consequence: a `.apkg` built here deliberately does NOT reproduce the delivered
      // deck card-for-card. That is the right trade — the two builders must not drift STRUCTURALLY —
      // but it is a real difference and is written down in docs/PIPELINE.md and LIMITATIONS.
      for (let ord = 0; ord < 2; ord++) {
        const cardId = noteId + ord + 1;
        insertCard.run(cardId, noteId, deckId, ord, nowSeconds, position);
        position++;
      }
    });
  });
}

// `now` (milliseconds) seeds col.mod/col.scm and note/card ids — Anki's own id scheme.
// `nowSeconds` seeds col.crt and every note/card mod field, matching Anki's actual
// schema convention: col.crt/notes.mod/cards.mod (and, from the caller, every
// JSON-embedded model/deck/dconf `mod`) are epoch SECONDS, while col.mod/col.scm are
// epoch milliseconds. `decksJson` is already fully rendered JSON by the time it gets
// here, built by the caller using nowSeconds too — see buildCollection/
// buildMultiDeckCollection.
function writeCollectionDb({
  decksJson,
  curDeck,
  activeDecks,
  now,
  nowSeconds,
  chapterGroups,
  modelSpec,
  guidNamespace = null,
}) {
  const tmpDir = mkdtempSync(join(tmpdir(), "anki-builder-collection-"));
  const dbPath = join(tmpDir, "collection.anki2");

  try {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(SCHEMA_SQL);

      const insertCol = db.prepare(
        "INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')",
      );
      insertCol.run(
        nowSeconds,
        now,
        now,
        JSON.stringify(buildConf(curDeck, activeDecks, modelSpec.modelId)),
        JSON.stringify(buildModel(nowSeconds, modelSpec)),
        decksJson,
        JSON.stringify(buildDconf(nowSeconds)),
      );

      const insertNote = db.prepare(
        "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, -1, '', ?, ?, ?, 0, '')",
      );
      const insertCard = db.prepare(
        "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 2500, 0, 0, 0, 0, 0, 0, '')",
      );

      insertNotesAndCards(
        insertNote,
        insertCard,
        chapterGroups,
        now,
        nowSeconds,
        modelSpec.modelId,
        guidNamespace,
      );
    } finally {
      db.close();
    }

    return readFileSync(dbPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Builds the raw bytes of a `collection.anki2` SQLite database from cards,
 * one note per card with two generated cards (Recognition, Production).
 * `card.audio`, when present, must already be the filename to embed via
 * `[sound:...]` (the caller resolves whether the underlying file exists).
 */
export function buildCollection(cards, { deckName, now, getFont = getLanguageFont }) {
  const nowSeconds = Math.floor(now / 1000);
  return writeCollectionDb({
    decksJson: JSON.stringify(buildDecks(nowSeconds, deckName)),
    curDeck: DECK_ID,
    activeDecks: [DECK_ID],
    now,
    nowSeconds,
    chapterGroups: [{ deckId: DECK_ID, cards }],
    modelSpec: resolveModelSpec(cards.meta?.targetLanguage, getFont),
  });
}

/**
 * Builds the raw bytes of a `collection.anki2` SQLite database merging several
 * chapters' cards into ONE collection, each chapter as its own real Anki sub-deck
 * nested under a parent deck named for the book. `chapterDecks`:
 * `[{ name: chapterLabel, cards }]`, in the desired sub-deck order — `name` is the
 * chapter label only, `"${bookName}::${chapterLabel}"` composition happens here, not
 * by the caller. Every card's `did` points at its own chapter's sub-deck — never the
 * parent/Default, which hold no cards.
 *
 * A chapter may sit under a card-less GROUPING deck (`Book::Lesson 1::Meeting…`) so a lesson and its
 * extras unit nest together — src/deck/deckPath.js decides that, for this and for AnkiConnect
 * delivery alike. No card ever lands in a grouping deck.
 */
export function buildMultiDeckCollection(
  chapterDecks,
  { bookName, now, getFont = getLanguageFont, guidNamespace = null },
) {
  const nowSeconds = Math.floor(now / 1000);
  const chapterNames = chapterDecks.map((c) => c.name);
  const decks = buildMultiDecks(nowSeconds, bookName, chapterNames);
  const chapterGroups = chapterDecks.map((c, index) => ({
    deckId: chapterDeckId(index),
    cards: c.cards,
  }));

  return writeCollectionDb({
    decksJson: JSON.stringify(decks),
    curDeck: BOOK_DECK_ID,
    activeDecks: Object.keys(decks).map(Number),
    now,
    nowSeconds,
    chapterGroups,
    modelSpec: resolveModelSpec(chapterDecks[0]?.cards?.meta?.targetLanguage, getFont),
    guidNamespace,
  });
}

export { FIELD_NAMES, languageLabel, languageModelId, noteTypeSpec, fieldValue };

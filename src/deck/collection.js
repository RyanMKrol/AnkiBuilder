import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const FIELD_NAMES = ["Target", "Pronunciation", "English", "Category", "Hint", "Image", "Audio"];
const FIELD_SEP = "\x1f";
const MODEL_ID = 1;
const DEFAULT_DECK_ID = 1;
// The single-deck path's own deck (buildCollection) and the multi-deck path's book/
// parent deck (buildMultiDeckCollection) never coexist in the same collection, so
// reusing id 2 for both is safe — each function builds its own independent `decks`
// blob.
const DECK_ID = 2;
const BOOK_DECK_ID = 2;
const chapterDeckId = (index) => BOOK_DECK_ID + 1 + index;

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
function buildModel(nowSeconds) {
  return {
    [MODEL_ID]: {
      id: MODEL_ID,
      name: "AnkiBuilder",
      type: 0,
      mod: nowSeconds,
      usn: -1,
      sortf: 0,
      did: DECK_ID,
      tmpls: [
        {
          name: "Recognition",
          ord: 0,
          qfmt: "{{Target}}<br>{{Audio}}",
          afmt: `{{FrontSide}}<hr id=answer>
<div class="field"><div class="field-label">Answer</div><div class="answer">{{English}}</div></div>
{{#Pronunciation}}<div class="field"><div class="field-label">Says</div><div class="pron">{{Pronunciation}}</div></div>{{/Pronunciation}}
{{#Hint}}<div class="field"><div class="field-label">Note</div><div class="hint">{{Hint}}</div></div>{{/Hint}}
{{#Image}}<div class="field">{{Image}}</div>{{/Image}}`,
          did: null,
          bqfmt: "",
          bafmt: "",
        },
        {
          name: "Production",
          ord: 1,
          qfmt: "{{English}}",
          afmt: `{{FrontSide}}<hr id=answer>
<div class="field"><div class="field-label">Answer</div><div class="answer">{{Target}}</div></div>
{{#Pronunciation}}<div class="field"><div class="field-label">Says</div><div class="pron">{{Pronunciation}}</div></div>{{/Pronunciation}}
{{#Hint}}<div class="field"><div class="field-label">Note</div><div class="hint">{{Hint}}</div></div>{{/Hint}}
{{#Image}}<div class="field">{{Image}}</div>{{/Image}}
{{#Audio}}<div class="field">{{Audio}}</div>{{/Audio}}`,
          did: null,
          bqfmt: "",
          bafmt: "",
        },
      ],
      flds: FIELD_NAMES.map((name, ord) => ({
        name,
        ord,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
        media: [],
      })),
      css: `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.field {
  margin-bottom: 14px;
}
.field:last-child {
  margin-bottom: 0;
}
.field-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #1f6f6b;
  margin-bottom: 3px;
}
.answer {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
}
.pron {
  font-size: 16px;
  font-weight: 400;
  color: #555555;
}
.hint {
  font-size: 14px;
  color: #888888;
}`,
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
function buildMultiDecks(nowSeconds, bookName, chapterNames) {
  const book = sanitizeDeckNameSegment(bookName);
  const decks = {
    [DEFAULT_DECK_ID]: deckRow(DEFAULT_DECK_ID, "Default", nowSeconds),
    [BOOK_DECK_ID]: deckRow(BOOK_DECK_ID, book, nowSeconds),
  };
  chapterNames.forEach((chapterName, index) => {
    const id = chapterDeckId(index);
    decks[id] = deckRow(id, `${book}::${sanitizeDeckNameSegment(chapterName)}`, nowSeconds);
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

function buildConf(curDeck, activeDecks) {
  return {
    curDeck,
    curModel: MODEL_ID,
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

function fieldValue(card, name) {
  switch (name) {
    case "Target":
      return card.target || "";
    case "Pronunciation":
      return card.pronunciation || "";
    case "English":
      return card.english || "";
    case "Category":
      return card.category || "";
    case "Hint":
      return card.hint || "";
    case "Image":
      return card.image ? `<img src="${card.image}">` : "";
    case "Audio":
      return card.audio ? `[sound:${card.audio}]` : "";
    default:
      return "";
  }
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
function insertNotesAndCards(insertNote, insertCard, chapterGroups, now, nowSeconds) {
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

      insertNote.run(
        noteId,
        card.id,
        MODEL_ID,
        nowSeconds,
        flds,
        sortField,
        fieldChecksum(sortField),
      );

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
function writeCollectionDb({ decksJson, curDeck, activeDecks, now, nowSeconds, chapterGroups }) {
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
        JSON.stringify(buildConf(curDeck, activeDecks)),
        JSON.stringify(buildModel(nowSeconds)),
        decksJson,
        JSON.stringify(buildDconf(nowSeconds)),
      );

      const insertNote = db.prepare(
        "INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, -1, '', ?, ?, ?, 0, '')",
      );
      const insertCard = db.prepare(
        "INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 2500, 0, 0, 0, 0, 0, 0, '')",
      );

      insertNotesAndCards(insertNote, insertCard, chapterGroups, now, nowSeconds);
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
export function buildCollection(cards, { deckName, now }) {
  const nowSeconds = Math.floor(now / 1000);
  return writeCollectionDb({
    decksJson: JSON.stringify(buildDecks(nowSeconds, deckName)),
    curDeck: DECK_ID,
    activeDecks: [DECK_ID],
    now,
    nowSeconds,
    chapterGroups: [{ deckId: DECK_ID, cards }],
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
 */
export function buildMultiDeckCollection(chapterDecks, { bookName, now }) {
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
  });
}

export { FIELD_NAMES };

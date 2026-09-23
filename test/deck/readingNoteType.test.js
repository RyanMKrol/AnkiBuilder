import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";
import {
  buildCollection,
  buildMultiDeckCollection,
  languageModelId,
  noteTypeSpec,
} from "../../src/deck/collection.js";
import {
  CARD_TEMPLATES,
  READING_TEMPLATES,
  templatesForDeckKind,
} from "../../src/deck/cardTemplates.js";
import { renderReadingCardFacesBlock, renderCardFacesBlock } from "../../src/deck/cardFaces.js";
import { renderCardFaceHtml } from "../../src/deck/cardFacePreview.js";
import { assertEveryCardHasAudio } from "../../src/deck/shippableCards.js";
import { ISO_639_1_CODES } from "../../src/model/iso639.js";
import { resolveDeckKind, deckKindOf } from "../../src/model/deckKind.js";

// The reading deck's note type (docs/designs/reading-decks/02-reading-note-type.md): one template,
// a silent front showing the written form alone, English and audio on the back. A second note type,
// so the shared speaking one (and every card the owner studies) is untouched.

const noFont = () => null;

function withTempDb(bytes, fn) {
  const dir = mkdtempSync(join(tmpdir(), "reading-note-type-"));
  const dbPath = join(dir, "collection.anki2");
  writeFileSync(dbPath, bytes);
  const db = new DatabaseSync(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const readingCards = () => ({
  meta: { targetLanguage: "ja" },
  items: [
    { id: "eiga", target: "映画", english: "Movie", ttsText: "えいが", audio: "eiga.mp3" },
    { id: "hi", target: "日", english: "Day; sun" },
  ],
});

test("the reading front is the written form alone: no audio, no scene, no category", () => {
  assert.equal(READING_TEMPLATES.length, 1);
  const [reading] = READING_TEMPLATES;
  assert.equal(reading.qfmt, '<div class="prompt">{{Target}}</div>');
  // The only field tag on the front is Target. An edit that adds anything else fails here.
  assert.deepEqual(reading.qfmt.match(/\{\{[^}]+\}\}/g), ["{{Target}}"]);
  assert.match(reading.afmt, /\{\{English\}\}/);
  assert.match(reading.afmt, /\{\{#Audio\}\}.*\{\{Audio\}\}.*\{\{\/Audio\}\}/s);
  // The owner's decision: the back is the English and the audio, and nothing that gives the reading.
  for (const hidden of ["Pronunciation", "Reading", "Note", "Hint", "Scene", "Category"]) {
    assert.doesNotMatch(reading.afmt, new RegExp(`\\{\\{[#/]?${hidden}\\}\\}`), hidden);
  }
});

test("the deck kind picks the templates; absent means speaking-listening", () => {
  assert.equal(templatesForDeckKind(undefined), CARD_TEMPLATES);
  assert.equal(templatesForDeckKind("speaking-listening"), CARD_TEMPLATES);
  assert.equal(templatesForDeckKind("reading"), READING_TEMPLATES);
  assert.equal(resolveDeckKind(undefined), "speaking-listening");
  assert.equal(deckKindOf({ title: "old marker" }), "speaking-listening");
  assert.equal(deckKindOf({ deckKind: "reading" }), "reading");
  assert.throws(() => resolveDeckKind("writing"), /speaking-listening, reading/);
});

test("the reading note type is a second note type, with its own name and id", () => {
  const speaking = noteTypeSpec("ja", { getFont: noFont });
  const reading = noteTypeSpec("ja", { getFont: noFont, deckKind: "reading" });
  assert.equal(speaking.modelName, "AnkiBuilder ja");
  assert.equal(reading.modelName, "AnkiBuilder ja Reading");
  assert.notEqual(reading.modelId, speaking.modelId);
  assert.deepEqual(reading.fields, speaking.fields);
  assert.deepEqual(
    reading.templates.map((t) => t.name),
    ["Reading"],
  );
  // The spec's templates carry only what AnkiConnect accepts.
  assert.deepEqual(Object.keys(reading.templates[0]).sort(), ["afmt", "name", "qfmt"]);
});

test("no language's reading note type id collides with any language's speaking one", () => {
  const speakingIds = new Set([...ISO_639_1_CODES].map((code) => languageModelId(code)));
  for (const code of ISO_639_1_CODES) {
    const readingId = languageModelId(`${code} reading`);
    assert.ok(!speakingIds.has(readingId), `reading id for ${code} collides`);
  }
});

test("the speaking note type is unchanged by the reading one", () => {
  const speaking = noteTypeSpec("ja", { getFont: noFont });
  assert.deepEqual(
    speaking.templates,
    CARD_TEMPLATES.map((t) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
  );
  const bytes = buildCollection(
    { meta: { targetLanguage: "ja" }, items: [{ id: "a", target: "あ", english: "A" }] },
    { deckName: "D", now: 1_700_000_000_000, getFont: noFont },
  );
  withTempDb(bytes, (db) => {
    const models = Object.values(JSON.parse(db.prepare("SELECT models FROM col").get().models));
    assert.equal(models.length, 1);
    assert.deepEqual(models[0].req, [
      [0, "any", [0]],
      [1, "any", [2]],
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cards").get().n, 2);
  });
});

test("a reading package writes one card per note, under the reading note type", () => {
  const bytes = buildMultiDeckCollection(
    [{ name: "Chapter 01: Greetings", cards: readingCards() }],
    {
      bookName: "Genki (Reading)",
      now: 1_700_000_000_000,
      getFont: noFont,
      deckKind: "reading",
    },
  );
  withTempDb(bytes, (db) => {
    const models = Object.values(JSON.parse(db.prepare("SELECT models FROM col").get().models));
    assert.equal(models.length, 1);
    assert.equal(models[0].name, "AnkiBuilder ja Reading");
    assert.deepEqual(
      models[0].tmpls.map((t) => [t.name, t.ord]),
      [["Reading", 0]],
    );
    assert.deepEqual(models[0].req, [[0, "any", [0]]]);
    const notes = db.prepare("SELECT COUNT(*) AS n FROM notes").get().n;
    const cards = db.prepare("SELECT ord, due FROM cards ORDER BY due").all();
    assert.equal(notes, 2);
    assert.deepEqual(
      cards.map((c) => [c.ord, c.due]),
      [
        [0, 1],
        [0, 2],
      ],
    );
    const mids = db.prepare("SELECT DISTINCT mid FROM notes").all();
    assert.deepEqual(
      mids.map((m) => m.mid),
      [models[0].id],
    );
  });
});

test("the reading prompt block describes ONE card, and the kanji card is silent", () => {
  const block = renderReadingCardFacesBlock();
  assert.match(block, /becomes ONE card/);
  assert.doesNotMatch(block, /TWO cards|Production|Recognition/);
  const [word, kanji] = block.split("日: FRONT");
  assert.match(word, /映画: BACK[\s\S]*Movie[\s\S]*\(audio plays\)/);
  assert.match(kanji, /Day; sun/);
  assert.doesNotMatch(kanji, /audio plays/);
  // The speaking block is untouched.
  assert.match(renderCardFacesBlock(), /becomes TWO cards/);
});

test("the preview renders the collection's own templates", () => {
  const card = { id: "eiga", target: "映画", english: "Movie", audio: "eiga.mp3" };
  const reading = renderCardFaceHtml(card, { templates: READING_TEMPLATES });
  assert.equal(reading.length, 1);
  assert.equal(reading[0].name, "Reading");
  assert.doesNotMatch(reading[0].front, /sound|audio/i);
  assert.equal(renderCardFaceHtml(card).length, 2);
});

test("a card may ship without audio only when the language plugin says it is silent", () => {
  const sets = [{ label: "Chapter 01", items: readingCards().items }];
  assert.throws(() => assertEveryCardHasAudio(sets, "the deck"), /hi \(Chapter 01\)/);
  const isSilent = (card) => card.target === "日";
  assert.doesNotThrow(() => assertEveryCardHasAudio(sets, "the deck", { isSilent }));
  const wordWithoutAudio = [{ label: "Chapter 01", items: [{ id: "x", target: "映画" }] }];
  assert.throws(() => assertEveryCardHasAudio(wordWithoutAudio, "the deck", { isSilent }), /x/);
});

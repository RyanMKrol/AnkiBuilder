import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { buildDeck, buildBookDeck } from "../../src/deck/index.js";
import { readApkg } from "../../src/deck/readApkg.js";

test("readApkg round-trips a built deck: fields, sub-deck, and embedded audio bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "apkg-rt-"));
  try {
    const audioBytes = Buffer.from("ID3-fake-clip-bytes");
    writeFileSync(join(dir, "hi.mp3"), audioBytes);
    const cards = {
      meta: { targetLanguage: "ja" },
      items: [
        {
          id: "c1",
          english: "Hello",
          target: "こんにちは",
          pronunciation: "konnichiwa",
          category: "Greetings",
          audio: "hi.mp3",
        },
        {
          id: "c2",
          english: "Bye",
          target: "さようなら",
          pronunciation: "sayounara",
          category: "Greetings",
        },
      ],
    };
    const outPath = join(dir, "deck.apkg");
    buildDeck(cards, { outPath, audioDir: dir, deckName: "Test Deck", now: 1000 });

    const deck = readApkg(outPath);
    assert.equal(deck.totalCards, 2);
    assert.equal(deck.sections.length, 1);

    const cardsOut = deck.sections[0].cards;
    const hello = cardsOut.find((c) => c.english === "Hello");
    assert.ok(hello, "Hello card present");
    assert.equal(hello.target, "こんにちは");
    assert.equal(hello.pronunciation, "konnichiwa");
    assert.equal(hello.category, "Greetings");
    assert.equal(hello.audioName, "hi.mp3");
    assert.deepEqual(Buffer.from(hello.audioData), audioBytes);

    const bye = cardsOut.find((c) => c.english === "Bye");
    assert.equal(bye.audioData, null, "card with no audio resolves to null bytes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readApkg groups cards under their sub-decks for a merged book, in book order", () => {
  const dir = mkdtempSync(join(tmpdir(), "apkg-book-"));
  try {
    const outPath = join(dir, "book.apkg");
    buildBookDeck(
      [
        {
          name: "Lesson 1",
          cards: {
            meta: { targetLanguage: "ja" },
            items: [
              {
                id: "a",
                english: "one",
                target: "いち",
                pronunciation: "ichi",
                category: "Numbers",
              },
            ],
          },
        },
        {
          name: "Lesson 2",
          cards: {
            meta: { targetLanguage: "ja" },
            items: [
              { id: "b", english: "two", target: "に", pronunciation: "ni", category: "Numbers" },
            ],
          },
        },
      ],
      { outPath, bookName: "My Book", now: 1000 },
    );

    const deck = readApkg(outPath);
    assert.equal(deck.title, "My Book");
    assert.deepEqual(
      deck.sections.map((s) => s.leaf),
      ["Lesson 1", "Lesson 2"],
    );
    assert.equal(deck.totalCards, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

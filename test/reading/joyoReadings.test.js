import test from "node:test";
import assert from "node:assert/strict";
import {
  officialReadings,
  completeKanjiReadings,
  soleKanjiReading,
} from "../../src/reading/joyoReadings.js";
import { completeCharacterCards } from "../../src/reading/characterReadings.js";
import { readingScheme } from "../../src/reading/readingSchemes.js";

// Kanji cards completed to the official school reading list (src/reading/joyoReadings.js).

test("the reference holds the official readings, without special narrow-use ones", () => {
  assert.deepEqual(officialReadings("曜"), { on: ["よう"], kun: [] });
  assert.deepEqual(officialReadings("明"), { on: ["めい", "みょう"], kun: ["あ", "あか", "あき"] });
  // 上's しょう and うわ are bracketed (special) in the official table.
  assert.deepEqual(officialReadings("上"), { on: ["じょう"], kun: ["うえ", "かみ", "あ", "のぼ"] });
  // A prefecture kanji whose only reading is bracketed keeps it.
  assert.deepEqual(officialReadings("岡"), { on: [], kun: ["おか"] });
  assert.equal(officialReadings("鏡")?.on.includes("きょう"), true);
});

test("completion keeps the book's readings first; one reading in all is voiced", () => {
  assert.deepEqual(completeKanjiReadings({ on: ["めい"], kun: ["あか"] }, "明"), {
    on: ["めい", "みょう"],
    kun: ["あか", "あ", "あき"],
  });
  assert.equal(soleKanjiReading(completeKanjiReadings(null, "週")), "しゅう");
  assert.equal(soleKanjiReading(completeKanjiReadings(null, "明")), null);
});

test("character cards are completed and a single-reading one voiced; a word card is not touched", () => {
  const ja = readingScheme("ja");
  const items = [
    { id: "a", target: "曜", pronunciation: "yō" },
    { id: "b", target: "明", pronunciation: "mei / aka" },
    { id: "c", target: "日", ttsText: "ひ", pronunciation: "hi" },
  ];
  const base = new Map([["明", { on: ["めい"], kun: ["あか"] }]]);
  const first = completeCharacterCards(items, { scheme: ja, base, record: null });
  assert.equal(first.changed, 2);
  assert.deepEqual(
    first.items.map((i) => [i.target, i.pronunciation, i.ttsText ?? null]),
    [
      ["曜", "yō", "よう"],
      ["明", "mei, myō / aka, a, aki", null],
      ["日", "hi", "ひ"],
    ],
  );
  // Run again with the record: the voiced 曜 is still known as a character card, nothing changes.
  const again = completeCharacterCards(first.items, { scheme: ja, base, record: first.record });
  assert.equal(again.changed, 0);
  assert.equal(again.record.cards["曜"].voiced, true);
  assert.equal(again.record.cards["日"], undefined);
});

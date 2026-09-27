import test from "node:test";
import assert from "node:assert/strict";
import {
  parseKanjiReadings,
  readingRomaji,
  kanjiReadingsLine,
} from "../../src/reading/kanjiReadings.js";
import { withCharacterReadings } from "../../src/reading/characterReadings.js";
import { readingScheme } from "../../src/reading/readingSchemes.js";

// A kanji card's romaji line is every reading the book's kanji table lists
// (src/reading/kanjiReadings.js).

test("both of Genki's kanji-table layouts are parsed, readings split by kind", () => {
  const html =
    "<p>001 一 ▶ いち いっ ▷ひと (one) 一(いち) one 一時(いちじ)</p>" +
    "<p>075 聞 (to listen) ▶ぶん ▷き 聞く(きく) to listen</p>" +
    "<p>073 員 (member) ▶いん 会社員(かいしゃいん) office worker</p>";
  const readings = parseKanjiReadings(html);
  assert.deepEqual(readings.get("一"), { on: ["いち", "いっ"], kun: ["ひと"], meaning: "One" });
  assert.deepEqual(readings.get("聞"), { on: ["ぶん"], kun: ["き"], meaning: "To listen" });
  assert.deepEqual(readings.get("員"), { on: ["いん"], kun: [], meaning: "Member" });
});

test("readings are written in the house romaji, and a trailing っ as the dictionaries do", () => {
  assert.equal(readingRomaji("じょう"), "jō");
  assert.equal(readingRomaji("しゅう"), "shū");
  assert.equal(readingRomaji("いっ"), "it-");
  assert.equal(kanjiReadingsLine({ on: ["いち", "いっ"], kun: ["ひと"] }), "ichi, it- / hito");
  assert.equal(kanjiReadingsLine({ on: ["いん"], kun: [] }), "in");
});

test("only a silent kanji card gets the line, and a line already there is kept", () => {
  const readings = new Map([
    ["聞", { on: ["ぶん"], kun: ["き"] }],
    ["日", { on: ["にち"], kun: ["ひ"] }],
  ]);
  const { items, filled } = withCharacterReadings(
    [
      { id: "a", target: "聞", pronunciation: "" },
      { id: "b", target: "日", ttsText: "ひ", pronunciation: "hi" },
      { id: "c", target: "聞く", ttsText: "きく", pronunciation: "kiku" },
      { id: "d", target: "聞", pronunciation: "edited by a reviewer" },
    ],
    readings,
    readingScheme("ja"),
  );
  assert.equal(filled, 1);
  assert.deepEqual(
    items.map((i) => i.pronunciation),
    ["bun / ki", "hi", "kiku", "edited by a reviewer"],
  );
});

test("a language without character readings is left untouched", () => {
  const items = [{ id: "a", target: "A", pronunciation: "" }];
  assert.deepEqual(
    withCharacterReadings(items, new Map([["A", { on: ["x"] }]]), readingScheme("fr")),
    { items, filled: 0 },
  );
});

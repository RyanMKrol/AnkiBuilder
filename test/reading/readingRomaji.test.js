import test from "node:test";
import assert from "node:assert/strict";
import { romanizeReadingItems, READINGS_SEPARATOR } from "../../src/reading/readingRomaji.js";

// The romaji on a reading card (src/reading/readingRomaji.js). The library and the correction pass
// are both faked: the real library loads a dictionary and the real correction calls a model.

const ROMAJI = { しちにん: "shichi-nin", ななにん: "nana-nin", えいが: "eiga" };
const fakeLibrary = (seen = []) => ({
  load: async () => ({
    romanize: async (text) => {
      seen.push(text);
      if (!(text in ROMAJI)) throw new Error(`no romaji for ${text}`);
      return ROMAJI[text];
    },
  }),
});
// The correction pass returns no corrections, so every row keeps the library's value.
const noCorrections = () => "[]";

test("a word the book reads two ways lists both readings in its romaji", async () => {
  const seen = [];
  const { items, romanized } = await romanizeReadingItems(
    [
      { id: "r1", target: "七人", ttsText: "しちにん", alternateReadings: ["ななにん"] },
      { id: "r2", target: "映画", ttsText: "えいが" },
    ],
    { targetLanguage: "ja", libraryEntry: fakeLibrary(seen), runClaude: noCorrections },
  );
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.r1.pronunciation, "shichi-nin / nana-nin");
  assert.equal(byId.r2.pronunciation, "eiga");
  // The voice is untouched: it still speaks the first reading.
  assert.equal(byId.r1.ttsText, "しちにん");
  assert.deepEqual(seen.sort(), ["えいが", "しちにん", "ななにん"].sort());
  // What is cached is the joined line under the card's own id, and nothing for the second reading.
  assert.deepEqual(
    romanized.map((r) => [r.id, r.pronunciation]),
    [
      ["r1", "shichi-nin / nana-nin"],
      ["r2", "eiga"],
    ],
  );
});

test("a cached romaji with only the first reading is romanised again", async () => {
  const seen = [];
  const { items, reused } = await romanizeReadingItems(
    [
      { id: "r1", target: "七人", ttsText: "しちにん", alternateReadings: ["ななにん"] },
      { id: "r2", target: "映画", ttsText: "えいが" },
    ],
    {
      targetLanguage: "ja",
      cached: { r1: "shichi-nin", r2: "eiga" },
      libraryEntry: fakeLibrary(seen),
      runClaude: noCorrections,
    },
  );
  assert.equal(reused, 1);
  assert.deepEqual(seen.sort(), ["しちにん", "ななにん"].sort());
  assert.equal(items[0].pronunciation, ["shichi-nin", "nana-nin"].join(READINGS_SEPARATOR));
});

test("a reading the library cannot romanise leaves the card with no romaji, not half of it", async () => {
  const { items } = await romanizeReadingItems(
    [{ id: "r1", target: "七人", ttsText: "しちにん", alternateReadings: ["なないん"] }],
    { targetLanguage: "ja", libraryEntry: fakeLibrary(), runClaude: noCorrections },
  );
  assert.equal(items[0].pronunciation, "");
});

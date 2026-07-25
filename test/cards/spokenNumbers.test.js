import test from "node:test";
import assert from "node:assert/strict";
import { findUnreadableNumbers, describeUnreadableNumbers } from "../../src/cards/spokenNumbers.js";

const card = (id, target, over = {}) => ({ id, target, ...over });

// The exact seven-card shape that reached ElevenLabs from Lesson 7: a numeral in the target and no
// reading, so `speechText` handed the digits straight to the voice.
test("flags a card whose target has a digit and no reading", () => {
  const found = findUnreadableNumbers(
    [card("a", "2025ねんに"), card("b", "こんにちは"), card("c", "5じに")],
    "ja",
  );
  assert.deepEqual(
    found.map((f) => f.id),
    ["a", "c"],
  );
  assert.match(found[0].cause, /no reading/);
  assert.equal(found[0].field, "spoken");
});

test("a spelled-out reading clears it", () => {
  const found = findUnreadableNumbers(
    [card("a", "2025ねんに", { reading: "にせんにじゅうごねんに" })],
    "ja",
  );
  assert.deepEqual(found, []);
});

// A different mistake with a different fix: someone wrote a reading but left a digit in it.
test("a reading that still contains a digit is flagged, and says so", () => {
  const [found] = findUnreadableNumbers([card("a", "2025ねんに", { reading: "2025ねんに" })], "ja");
  assert.equal(found.cause, "reading still contains a digit");
});

test("fullwidth digits count — a textbook mixes them with ASCII freely", () => {
  assert.equal(findUnreadableNumbers([card("a", "４がつ")], "ja").length, 1);
});

test("an excluded card is ignored — the audio stage skips it anyway", () => {
  assert.deepEqual(findUnreadableNumbers([card("a", "5じに", { excluded: true })], "ja"), []);
});

// Scoped by language: a Spanish voice should receive "2000 euros" exactly as written.
test("a language with no TTS text transform is left alone", () => {
  assert.deepEqual(findUnreadableNumbers([card("a", "2000 euros")], "es"), []);
  assert.deepEqual(findUnreadableNumbers([card("a", "2000 euros")], undefined), []);
});

test("the report names each card, its text and the cause", () => {
  const report = describeUnreadableNumbers(findUnreadableNumbers([card("a", "5じに")], "ja"));
  assert.match(report, /a: 5じに — no reading/);
});

// The romaji is what the learner reads to know how to SAY the card, so a digit in it is wrong on its
// own terms. This arm also catches the stale case: a reading filled in later without regenerating the
// romanization — which is exactly what happened after the first pass at this fix.
test("a digit in the romaji is flagged even when the spoken text is clean", () => {
  const [found] = findUnreadableNumbers(
    [card("a", "2025ねんに", { reading: "にせんにじゅうごねんに", pronunciation: "2025-nen ni" })],
    "ja",
  );
  assert.equal(found.field, "pronunciation");
  assert.match(found.cause, /romaji still contains a digit/);
});

test("a card with a numeric target, a spelled-out reading and clean romaji passes", () => {
  assert.deepEqual(
    findUnreadableNumbers(
      [
        card("a", "13,000えん", {
          reading: "いちまんさんぜんえん",
          pronunciation: "ichiman sanzen'en",
        }),
      ],
      "ja",
    ),
    [],
  );
});

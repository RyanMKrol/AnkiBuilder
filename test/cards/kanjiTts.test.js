import test from "node:test";
import assert from "node:assert/strict";
import { generateUnitKanjiTts, bearsHomophone } from "../../src/cards/kanjiTts.js";

const unit = (items, meta = {}) => ({
  meta: { targetLanguage: "ja", sourceType: "epub", ...meta },
  items,
});
const card = (over) => ({
  id: "a",
  english: "Now",
  category: "Other",
  target: "いま",
  pronunciation: "ima",
  ...over,
});
const runClaude = async () => JSON.stringify({ kanji: "今" });

test("converts every card and stores the orthography without touching the target", async () => {
  const result = await generateUnitKanjiTts(unit([card({}), card({ id: "b", target: "かみ" })]), {
    runClaude,
  });
  assert.equal(result.converted, 2);
  assert.equal(result.cards.items[0].ttsKanji, "今");
  assert.equal(result.cards.items[0].target, "いま", "the learner still sees the kana");
});

// Storing the orthography must not change what is spoken. That is the per-unit flag's job, and
// keeping them separate is what lets a human read the conversions before paying to hear them.
test("converting a unit does not opt it into speaking the kanji", async () => {
  const result = await generateUnitKanjiTts(unit([card({})]), { runClaude });
  assert.equal(result.cards.meta.kanjiTts, undefined);
});

test("an excluded card and a card with no text cost no model call", async () => {
  let calls = 0;
  const result = await generateUnitKanjiTts(
    unit([card({ excluded: true }), card({ id: "b", target: "" }), card({ id: "c" })]),
    {
      runClaude: async () => {
        calls++;
        return JSON.stringify({ kanji: "今" });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.converted, 1);
  assert.equal(result.skipped, 2);
});

test("an existing conversion is left alone unless it is forced", async () => {
  const existing = unit([card({ ttsKanji: "居間" })]);
  const kept = await generateUnitKanjiTts(existing, { runClaude });
  assert.equal(kept.cards.items[0].ttsKanji, "居間");
  assert.equal(kept.converted, 0);

  const redone = await generateUnitKanjiTts(existing, { runClaude, force: true });
  assert.equal(redone.cards.items[0].ttsKanji, "今");
});

// One card the model returns nonsense for must not lose the other forty conversions.
test("a failed conversion is collected, not thrown", async () => {
  let n = 0;
  const result = await generateUnitKanjiTts(unit([card({}), card({ id: "b" })]), {
    runClaude: async () => (n++ === 0 ? "not json at all" : JSON.stringify({ kanji: "今" })),
  });
  assert.equal(result.converted, 1);
  assert.deepEqual(
    result.errors.map((e) => e.id),
    ["a"],
  );
  assert.equal("ttsKanji" in result.cards.items[0], false, "the failed card is left as it was");
  assert.equal(result.cards.items[1].ttsKanji, "今");
});

test("a non-Japanese unit is refused rather than converted", async () => {
  await assert.rejects(
    () => generateUnitKanjiTts(unit([card({})], { targetLanguage: "es" }), { runClaude }),
    /Japanese-only/,
  );
});

// The class where the conversion can silently put a different word in the audio: はし is bridge,
// chopsticks or edge; いま is now or living-room. The card face is kana, so the learner cannot tell.
test("the homophone-bearing class is recognised from the spoken text", () => {
  assert.equal(bearsHomophone(card({ target: "いま" })), true);
  assert.equal(bearsHomophone(card({ target: "はしをわたります" })), true);
  assert.equal(bearsHomophone(card({ target: "りんご" })), false);
  // Judged on what is SPOKEN, so a kanji target with a kana ttsText is still caught.
  assert.equal(bearsHomophone(card({ target: "今", ttsText: "いま" })), true);
});

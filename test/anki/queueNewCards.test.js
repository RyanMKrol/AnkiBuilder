import test from "node:test";
import assert from "node:assert/strict";
import { deckSearch, queueNewCards, resolveChapterDecks } from "../../src/anki/queueNewCards.js";

/**
 * scripts/queue-new-cards.mjs, driven against an in-memory fake of the handful of AnkiConnect
 * actions it uses. Nothing here reaches AnkiConnect (CLAUDE.md rule 6).
 */

const PARENT = "Genki I (Reading)";
const CH0 = `${PARENT}::Chapter 00: Kana`;
const CH6 = `${PARENT}::Chapter 06: Lesson 4: The First Date`;
const CH20 = `${PARENT}::Chapter 20: Reading and Writing 6: My Favorite Restaurant`;
const NOW = 1_793_971_610;

// Cards are { cardId, deckName, type, queue, due, ord, reps, introducedToday?, suspended? }.
function fakeAnki(cards, { steps = 1 } = {}) {
  const decks = { [PARENT]: 1, [CH0]: 2, [CH6]: 3, [CH20]: 4, "Other::Chapter 00: Kana": 5 };
  const writes = [];
  const byId = new Map(cards.map((c) => [c.cardId, { ord: 0, reps: 0, ...c }]));
  const inDeck = (query) => {
    const m = /^deck:"((?:[^"\\]|\\.)*)"/.exec(query);
    const name = m[1].replace(/\\(.)/g, "$1");
    return [...byId.values()].filter(
      (c) => c.deckName === name || c.deckName.startsWith(`${name}::`),
    );
  };
  const client = {
    async invoke(action, params) {
      if (action === "deckNamesAndIds") return decks;
      if (action === "getDeckConfig") return { new: { delays: Array(steps).fill(15) } };
      if (action === "setSpecificValueOfCard") {
        writes.push(params);
        const card = byId.get(params.card);
        params.keys.forEach((k, i) => (card[k] = params.newValues[i]));
        return [true];
      }
      throw new Error(`unexpected action ${action}`);
    },
    async findCards(query) {
      let hits = inDeck(query);
      if (query.includes("introduced:1")) hits = hits.filter((c) => c.introducedToday);
      if (query.includes("is:learn")) hits = hits.filter((c) => c.queue === 1 || c.queue === 3);
      if (query.includes("is:new")) hits = hits.filter((c) => c.type === 0 && !c.suspended);
      return hits.map((c) => c.cardId);
    },
    async cardsInfo(ids) {
      return ids.map((id) => {
        const c = byId.get(id);
        return { ...c, fields: { Front: { value: `front-${id}`, order: 0 } } };
      });
    },
  };
  return { client, writes, byId };
}

const newCard = (cardId, deckName, due) => ({ cardId, deckName, type: 0, queue: 0, due });

test("resolveChapterDecks matches the numbered prefix directly under the parent", () => {
  const decks = { [PARENT]: 1, [CH0]: 2, [CH6]: 3, "Other::Chapter 06: Elsewhere": 9 };
  assert.deepEqual(
    resolveChapterDecks(decks, PARENT, [6, 0]).map((d) => d.name),
    [CH6, CH0],
  );
  assert.throws(() => resolveChapterDecks(decks, PARENT, [7]), /no chapter 7 deck/);
  assert.throws(() => resolveChapterDecks(decks, "Missing", [0]), /no deck named "Missing"/);
});

test("resolveChapterDecks reads a speaking deck's bare Lesson grouping deck", () => {
  const p = "Busy People";
  const decks = { [p]: 1, [`${p}::Lesson 20`]: 2, [`${p}::Lesson 20::Going Places`]: 3 };
  assert.deepEqual(
    resolveChapterDecks(decks, p, [20]).map((d) => d.name),
    [`${p}::Lesson 20`],
  );
});

test("deckSearch escapes the characters Anki treats specially inside quotes", () => {
  assert.equal(deckSearch(CH0), `deck:"${CH0}"`);
  assert.equal(deckSearch('a_b*c"d\\e'), 'deck:"a\\_b\\*c\\"d\\\\e"');
});

test("queues the lowest-position new cards as unanswered learning cards due now", async () => {
  const cards = [30, 10, 20, 50, 40, 60].map((due, i) => newCard(100 + i, CH0, due));
  const { client, writes, byId } = fakeAnki(cards, { steps: 2 });
  const [r] = await queueNewCards({ client, parent: PARENT, chapters: [0], perDeck: 3, now: NOW });

  assert.deepEqual(
    r.queued.map((c) => c.originalPosition),
    [10, 20, 30],
  );
  assert.equal(writes.length, 3);
  for (const w of writes) {
    assert.deepEqual(w.keys, ["type", "queue", "due", "left"]);
    assert.deepEqual(w.newValues, [1, 1, NOW, 2]);
    assert.equal(w.warning_check, true);
  }
  assert.equal(byId.get(101).queue, 1);
  assert.equal(byId.get(103).queue, 0, "a later card is left alone");
  assert.equal(r.newLeft, 3);
});

test("a second run the same day tops up rather than adding another batch", async () => {
  const cards = [
    { ...newCard(1, CH6, 1), type: 1, queue: 1, reps: 0 }, // queued earlier, not yet studied
    { ...newCard(2, CH6, 2), type: 1, queue: 1, reps: 2, introducedToday: true }, // studied today
    { ...newCard(3, CH6, 3), type: 2, queue: 1, reps: 9 }, // a lapsed review card: not counted
    ...[4, 5, 6, 7].map((n) => newCard(n, CH6, n)),
  ];
  const { client, writes } = fakeAnki(cards);
  const [r] = await queueNewCards({ client, parent: PARENT, chapters: [6], perDeck: 5, now: NOW });

  assert.equal(r.introducedToday, 1);
  assert.equal(r.queuedNotStudied, 1);
  assert.deepEqual(
    r.queued.map((c) => c.cardId),
    [4, 5, 6],
  );
  assert.equal(writes.length, 3);

  const again = await queueNewCards({ client, parent: PARENT, chapters: [6], perDeck: 5 });
  assert.equal(again[0].queued.length, 0, "already at the target");
  assert.equal(writes.length, 3);
});

test("suspended cards are skipped and an exhausted chapter reports none left", async () => {
  const cards = [{ ...newCard(1, CH20, 1), suspended: true }, newCard(2, CH20, 2)];
  const { client } = fakeAnki(cards);
  const [r] = await queueNewCards({ client, parent: PARENT, chapters: [20], perDeck: 5 });
  assert.deepEqual(
    r.queued.map((c) => c.cardId),
    [2],
  );
  assert.equal(r.newLeft, 0);
});

test("dry run plans the same cards and writes nothing", async () => {
  const { client, writes, byId } = fakeAnki([newCard(1, CH0, 5), newCard(2, CH0, 6)]);
  const [r] = await queueNewCards({ client, parent: PARENT, chapters: [0], dryRun: true });
  assert.deepEqual(
    r.queued.map((c) => c.cardId),
    [1, 2],
  );
  assert.equal(writes.length, 0);
  assert.equal(byId.get(1).queue, 0);
});

test("refuses before any write when a deck has no learning steps or a chapter is missing", async () => {
  const noSteps = fakeAnki([newCard(1, CH0, 1), newCard(2, CH6, 1)], { steps: 0 });
  await assert.rejects(
    queueNewCards({ client: noSteps.client, parent: PARENT, chapters: [0, 6] }),
    /no learning steps/,
  );
  assert.equal(noSteps.writes.length, 0);

  const missing = fakeAnki([newCard(1, CH0, 1)]);
  await assert.rejects(
    queueNewCards({ client: missing.client, parent: PARENT, chapters: [0, 7] }),
    /no chapter 7 deck/,
  );
  assert.equal(missing.writes.length, 0);
});

test("a write AnkiConnect accepts but does not apply is caught on read-back", async () => {
  const { client } = fakeAnki([newCard(1, CH0, 1)]);
  client.invoke = ((inner) => async (action, params) =>
    action === "setSpecificValueOfCard" ? [true] : inner(action, params))(
    client.invoke.bind(client),
  );
  await assert.rejects(
    queueNewCards({ client, parent: PARENT, chapters: [0] }),
    /did not end up in learning/,
  );
});

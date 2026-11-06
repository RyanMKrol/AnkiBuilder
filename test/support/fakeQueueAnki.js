/**
 * An in-memory fake of the AnkiConnect actions src/anki/queueNewCards.js uses, shared by its unit
 * tests and the dashboard route tests. Nothing here reaches AnkiConnect (CLAUDE.md rule 6).
 *
 * Cards are `{ cardId, deckName, type, queue, due, ord?, reps?, introducedToday?, suspended? }`.
 * `calls` records every action name in order, which is what the safety-net tests assert on.
 */
export function fakeQueueAnki(
  cards,
  { steps = 1, decks = {}, profile = "Ryan", syncFails = [], exportResult = true } = {},
) {
  const calls = [];
  const writes = [];
  const byId = new Map(cards.map((c) => [c.cardId, { ord: 0, reps: 0, ...c }]));
  let syncs = 0;
  const inDeck = (query) => {
    const m = /^deck:"((?:[^"\\]|\\.)*)"/.exec(query);
    const name = m[1].replace(/\\(.)/g, "$1");
    return [...byId.values()].filter(
      (c) => c.deckName === name || c.deckName.startsWith(`${name}::`),
    );
  };
  const client = {
    async invoke(action, params) {
      calls.push(action);
      if (action === "getActiveProfile") return profile;
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
    async sync() {
      calls.push("sync");
      syncs++;
      if (syncFails.includes(syncs)) throw new Error("AnkiWeb unreachable");
    },
    async exportPackage() {
      calls.push("exportPackage");
      return exportResult;
    },
    async findCards(query) {
      let hits = inDeck(query);
      if (query.includes("introduced:1")) hits = hits.filter((c) => c.introducedToday);
      if (query.includes("is:learn")) hits = hits.filter((c) => c.queue === 1 || c.queue === 3);
      if (query.includes("is:new")) hits = hits.filter((c) => c.type === 0 && !c.suspended);
      return hits.map((c) => c.cardId);
    },
    async cardsInfo(ids) {
      return ids
        .filter((id) => byId.has(id))
        .map((id) => {
          const c = byId.get(id);
          return { ...c, fields: { Front: { value: `front-${id}`, order: 0 } } };
        });
    },
  };
  return { client, calls, writes, byId };
}

export const newCard = (cardId, deckName, due) => ({ cardId, deckName, type: 0, queue: 0, due });

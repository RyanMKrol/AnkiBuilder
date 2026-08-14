import test from "node:test";
import assert from "node:assert/strict";
import {
  FILTERED_DECK,
  MAX_PROBE_CARDS,
  PROBE_MODEL,
  SENTINEL_DECK,
  assertInterlock,
  checkInterlock,
  ensureProbeModel,
  probeChangeDeckOnFiltered,
  probeSuspendOnFiltered,
  probeTemplateRegeneration,
  runProbes,
} from "../../src/anki/behaviourProbe.js";

/**
 * Every test here drives an INJECTED fake client. Nothing in this file opens a socket, and nothing
 * touches port 8765 — which is the same property the probe module itself is built for: the module
 * never constructs a client, it is always handed one.
 */

const card = (over = {}) => ({
  cardId: 1,
  ord: 0,
  deckName: SENTINEL_DECK,
  did: 10,
  odid: 0,
  odue: 0,
  queue: 0,
  type: 0,
  ...over,
});

/** A collection that satisfies all four interlock conditions. */
function cleanProfile(over = {}) {
  return {
    modelNames: async () => ["Basic", "Cloze"],
    findNotes: async () => [],
    deckNames: async () => ["Default", SENTINEL_DECK],
    findCards: async () => [1, 2, 3],
    ...over,
  };
}

const DELIVERED = ["Japanese for Busy People Book 1: Kana", "Nihongo 101 Course (N5)"];

test("the interlock passes on a clean throwaway profile", async () => {
  const { ok, checks } = await checkInterlock(cleanProfile(), { deliveredParents: DELIVERED });
  assert.ok(ok);
  assert.deepEqual(
    checks.map((c) => c.id),
    ["no-deliverable-model", "no-delivered-notes", "sentinel-and-size", "no-delivered-decks"],
  );
});

test("(a) a deliverable note type stops the run, and the check is a PATTERN not a list", async () => {
  for (const name of ["AnkiBuilder ja", "AnkiBuilder de", "AnkiBuilder Klingon"]) {
    const { ok, checks } = await checkInterlock(
      cleanProfile({ modelNames: async () => ["Basic", name] }),
      { deliveredParents: DELIVERED },
    );
    assert.ok(!ok, name);
    assert.match(checks[0].detail, /note type\(s\) this repo delivers into/);
  }
});

test("(a) the probe's own note type does not trip the interlock it just passed", async () => {
  const { ok } = await checkInterlock(
    cleanProfile({ modelNames: async () => ["Basic", PROBE_MODEL] }),
    { deliveredParents: DELIVERED },
  );
  assert.ok(ok, "a second run must not refuse itself");
});

test("(b) a single abid-tagged note stops the run even with no AnkiBuilder note type", async () => {
  // The renamed-note-type case: (a) is satisfied, and only the durable delivery tag catches it.
  const { ok, checks } = await checkInterlock(cleanProfile({ findNotes: async () => [7] }), {
    deliveredParents: DELIVERED,
  });
  assert.ok(!ok);
  assert.match(checks[1].detail, /carry an abid: delivery tag/);
});

test("(b) the abid query is the tag wildcard, not a deck or note-type name", async () => {
  let query = null;
  await checkInterlock(
    cleanProfile({
      findNotes: async (q) => {
        query = q;
        return [];
      },
    }),
    { deliveredParents: DELIVERED },
  );
  assert.equal(query, "tag:abid:*");
});

test("(c) a missing sentinel deck stops the run", async () => {
  const { ok, checks } = await checkInterlock(
    cleanProfile({ deckNames: async () => ["Default"] }),
    { deliveredParents: DELIVERED },
  );
  assert.ok(!ok);
  assert.match(checks[2].detail, /sentinel deck .* is not here/);
});

test("(c) the size limit counts CARDS, via findCards, not notes", async () => {
  const queries = [];
  const big = cleanProfile({
    findCards: async (q) => {
      queries.push(q);
      return Array.from({ length: MAX_PROBE_CARDS }, (_, i) => i);
    },
  });
  const { ok, checks } = await checkInterlock(big, { deliveredParents: DELIVERED });
  assert.ok(!ok, "exactly at the limit is already too big");
  assert.match(checks[2].detail, new RegExp(`${MAX_PROBE_CARDS} card\\(s\\)`));
  assert.deepEqual(queries, [""], "the whole collection, not a deck");
});

test("(d) a deck matching a delivered ankiParent stops the run, including a sub-deck", async () => {
  for (const deck of [DELIVERED[0], `${DELIVERED[1]}::Lesson 01`]) {
    const { ok, checks } = await checkInterlock(
      cleanProfile({ deckNames: async () => ["Default", SENTINEL_DECK, deck] }),
      { deliveredParents: DELIVERED },
    );
    assert.ok(!ok, deck);
    assert.match(checks[3].detail, /matching a delivered collection are present/);
  }
});

test("(d) a deck that merely SHARES A PREFIX with a delivered name does not false-positive", async () => {
  const { ok } = await checkInterlock(
    cleanProfile({
      deckNames: async () => ["Default", SENTINEL_DECK, `${DELIVERED[0]} Practice`],
    }),
    { deliveredParents: DELIVERED },
  );
  assert.ok(ok);
});

test("the interlock is a CONJUNCTION: three passing conditions do not carry the fourth", async () => {
  await assert.rejects(
    () =>
      assertInterlock(cleanProfile({ findNotes: async () => [1] }), {
        deliveredParents: DELIVERED,
      }),
    /REFUSING TO PROBE/,
  );
});

test("the refusal names the stage, so a mid-run profile switch reads differently", async () => {
  await assert.rejects(
    () =>
      assertInterlock(cleanProfile({ deckNames: async () => [] }), {
        deliveredParents: DELIVERED,
        stage: "before probe 2's changeDeck write",
      }),
    /REFUSING TO PROBE \(before probe 2's changeDeck write\)/,
  );
});

test("the probe note type is created only when asked, and never twice", async () => {
  const created = [];
  const client = cleanProfile({
    modelNames: async () => (created.length ? [PROBE_MODEL] : []),
    createModel: async (spec) => created.push(spec.modelName),
  });
  assert.deepEqual(await ensureProbeModel(client), { created: true });
  assert.deepEqual(created, [PROBE_MODEL]);
  assert.deepEqual(await ensureProbeModel(client), { created: false });
  assert.equal(created.length, 1);
});

/** A fake that records writes and lets each probe's reads be scripted. */
function probeClient({ cards = [], filtered = [], onWrite = () => {} } = {}) {
  let state = cards;
  return {
    ...cleanProfile(),
    addNote: async () => {
      onWrite("addNote");
      return 99;
    },
    findCards: async (query) => {
      if (query === "") return [1, 2, 3];
      if (query.startsWith("deck:")) return filtered;
      return state.map((c) => c.cardId);
    },
    cardsInfo: async () => state,
    suspend: async (ids) => {
      onWrite("suspend");
      state = state.map((c) => (ids.includes(c.cardId) ? { ...c, queue: -1 } : c));
    },
    unsuspend: async () => onWrite("unsuspend"),
    changeDeck: async () => onWrite("changeDeck"),
    updateModelTemplates: async () => {
      onWrite("updateModelTemplates");
      // The behaviour under test: does a template write bring a suspended card back?
      state = state.map((c) => ({ ...c, queue: c.queue === -1 ? 0 : c.queue }));
    },
  };
}

test("probe 1 re-asserts the interlock before the note write AND before the template write", async () => {
  const stages = [];
  const client = probeClient({ cards: [card({ cardId: 1, ord: 0 }), card({ cardId: 2, ord: 1 })] });
  await probeTemplateRegeneration(client, { guard: async (stage) => stages.push(stage) });
  assert.equal(stages.length, 2);
  assert.match(stages[0], /before probe 1 /);
  assert.match(stages[1], /template write/);
});

test("probe 1 reports whether a template write unsuspended the card it suspended", async () => {
  const client = probeClient({ cards: [card({ cardId: 1, ord: 0 }), card({ cardId: 2, ord: 1 })] });
  const result = await probeTemplateRegeneration(client, { guard: async () => {} });
  assert.equal(result.answers.templateWriteUnsuspended, true);
  assert.equal(result.answers.rowCountChanged, false);
});

test("probe 2 and 3 SKIP rather than guess when the filtered deck holds nothing", async () => {
  const writes = [];
  const client = probeClient({ filtered: [], onWrite: (w) => writes.push(w) });
  const two = await probeChangeDeckOnFiltered(client, { guard: async () => {} });
  const three = await probeSuspendOnFiltered(client, { guard: async () => {} });
  assert.match(two.skipped, new RegExp(FILTERED_DECK));
  assert.match(three.skipped, /see probe 2/);
  assert.deepEqual(writes, [], "a skipped probe writes nothing");
});

test("probe 2 reports a refusal from changeDeck rather than throwing", async () => {
  const client = {
    ...probeClient({ filtered: [5], cards: [card({ cardId: 5, odid: 10, did: 77 })] }),
    changeDeck: async () => {
      throw new Error("cannot move a card out of a filtered deck");
    },
  };
  const result = await probeChangeDeckOnFiltered(client, { guard: async () => {} });
  assert.equal(result.answers.refused, true);
  assert.match(result.error, /filtered deck/);
});

test("a guard that refuses stops the run before any probe writes", async () => {
  const writes = [];
  const client = probeClient({ cards: [card()], onWrite: (w) => writes.push(w) });
  await assert.rejects(
    () =>
      runProbes(client, {
        guard: async () => {
          throw new Error("REFUSING TO PROBE (startup)");
        },
      }),
    /REFUSING TO PROBE/,
  );
  assert.deepEqual(writes, []);
});

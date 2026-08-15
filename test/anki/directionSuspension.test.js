import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDirectionSuspension,
  assertStudiableDirection,
  suspendedOrdinals,
  dirSuspendedTag,
  describeSuspension,
  DELIVERED_SUSPEND_PROBES,
} from "../../src/anki/directionSuspension.js";
import {
  assertProbesRecorded,
  unansweredProbes,
  PROBE_ANSWERS,
} from "../../src/anki/probeResults.js";

// A fake collection: notes with two cards each, ordinals 0 and 1. Nothing here reaches a network,
// a port, or a running Anki — the client is this object and only this object.
function fakeCollection({ notes = {} } = {}) {
  const calls = [];
  // notes: { [noteId]: { tags: [], cards: { 0: {cardId, queue}, 1: {…} } } }
  const cardIndex = new Map();
  for (const [noteId, note] of Object.entries(notes)) {
    for (const [ord, card] of Object.entries(note.cards)) {
      cardIndex.set(card.cardId, { ...card, ord: Number(ord), noteId: Number(noteId) });
    }
  }
  return {
    calls,
    notes,
    client: {
      findCards: async (query) => {
        calls.push(["findCards", query]);
        const noteId = Number(query.replace("nid:", ""));
        return Object.values(notes[noteId]?.cards ?? {}).map((c) => c.cardId);
      },
      cardsInfo: async (ids) => {
        calls.push(["cardsInfo", ids]);
        return ids.map((id) => {
          const c = cardIndex.get(id);
          return { cardId: id, ord: c.ord, queue: c.queue ?? 0 };
        });
      },
      notesInfo: async (ids) => {
        calls.push(["notesInfo", ids]);
        return ids.map((id) => ({ noteId: id, tags: notes[id]?.tags ?? [] }));
      },
      suspend: async (ids) => {
        calls.push(["suspend", ids]);
        for (const id of ids) cardIndex.get(id).queue = -1;
        return true;
      },
      addTags: async (ids, tags) => {
        calls.push(["addTags", ids, tags]);
        for (const id of ids) notes[id].tags = [...(notes[id].tags ?? []), tags];
      },
    },
  };
}

const twoCardNote = (base, { tags = [], queues = [0, 0] } = {}) => ({
  tags,
  cards: {
    0: { cardId: base, queue: queues[0] },
    1: { cardId: base + 1, queue: queues[1] },
  },
});

const names = (calls) => calls.map((c) => c[0]);

test("ordinals are normalized: deduped, sorted, and bounded by the template count", () => {
  assert.deepEqual(suspendedOrdinals({ dirSuspended: [1, 1, 0] }, 2), [0, 1]);
  assert.deepEqual(suspendedOrdinals({ dirSuspended: [5, -1, "1"] }, 2), []);
  assert.deepEqual(suspendedOrdinals({}, 2), []);
  assert.deepEqual(suspendedOrdinals({ dirSuspended: "1" }, 2), []);
});

// Suspending every direction is not "hide this card", it is a note with no studiable card at all.
test("a card suspending every direction is refused by name", () => {
  assert.throws(
    () => assertStudiableDirection({ id: "both", dirSuspended: [0, 1] }, 2),
    /suspends every direction.*no.*studiable card/s,
  );
  assert.doesNotThrow(() => assertStudiableDirection({ id: "one", dirSuspended: [1] }, 2));
});

// A note created seconds ago has never been studied, so there is no scheduling to disturb and no
// consent to ask for.
test("a note created by THIS deliver is suspended unconditionally, and tagged per ordinal", async () => {
  const { client, calls, notes } = fakeCollection({ notes: { 100: twoCardNote(500) } });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "intro", dirSuspended: [1] }, noteId: 100, isNew: true }],
    {},
  );
  assert.deepEqual(out.suspended, [{ card: "intro", noteId: 100, cardId: 501, ord: 1 }]);
  assert.deepEqual(out.skippedDelivered, []);
  assert.ok(names(calls).includes("suspend"));
  assert.deepEqual(
    calls.find((c) => c[0] === "suspend").slice(1),
    [[501]],
    "only the Production card",
  );
  assert.deepEqual(notes[100].tags, [dirSuspendedTag(1)]);
});

// A card the owner has been studying for months must not silently stop appearing.
test("an ALREADY-DELIVERED note is reported and left alone without the opt-in flag", async () => {
  const { client, calls } = fakeCollection({ notes: { 100: twoCardNote(500) } });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "old", dirSuspended: [1] }, noteId: 100, isNew: false }],
    {},
  );
  assert.deepEqual(out.suspended, []);
  assert.deepEqual(out.skippedDelivered, [{ card: "old", noteId: 100, cardId: null, ord: 1 }]);
  assert.deepEqual(calls, [], "not even a read against a note we will not touch");
});

// The gate. It fires BEFORE any read, so a run that cannot legally finish never touches anything.
test("the opt-in path is refused outright, naming the probes that have not been run", async () => {
  const { client, calls } = fakeCollection({ notes: { 100: twoCardNote(500) } });
  await assert.rejects(
    () =>
      applyDirectionSuspension(
        client,
        [{ card: { id: "old", dirSuspended: [1] }, noteId: 100, isNew: false }],
        { suspendDelivered: true },
      ),
    (err) => {
      assert.match(err.message, /--suspend-delivered/);
      assert.match(err.message, /suspend-on-filtered/);
      assert.match(err.message, /housekeeping-unsuspends/);
      assert.match(err.message, /anki-behaviour-probe\.mjs/);
      return true;
    },
  );
  assert.deepEqual(calls, [], "refused before any read");
});

// A NEW note is not gated on those probes: it is in its home deck, unstudied, with nothing for
// housekeeping to undo.
test("the opt-in flag does not gate the new-note path", async () => {
  const { client } = fakeCollection({ notes: { 100: twoCardNote(500) } });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "fresh", dirSuspended: [1] }, noteId: 100, isNew: true }],
    { suspendDelivered: true },
  );
  assert.equal(out.suspended.length, 1);
});

// THE HUMAN-OVERRIDE RULE: unsuspended AND already tagged means a person turned it back on.
test("a direction a human unsuspended is reported and never re-suspended", async () => {
  const { client, calls } = fakeCollection({
    notes: { 100: twoCardNote(500, { tags: [dirSuspendedTag(1)], queues: [0, 0] }) },
  });
  const logged = [];
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "wanted-back", dirSuspended: [1] }, noteId: 100, isNew: true }],
    { log: (m) => logged.push(m) },
  );
  assert.deepEqual(out.suspended, []);
  assert.deepEqual(out.humanUnsuspended, [
    { card: "wanted-back", noteId: 100, cardId: 501, ord: 1 },
  ]);
  assert.ok(!names(calls).includes("suspend"));
  assert.match(logged.join("\n"), /unsuspended by hand/);
});

test("only the distinct second flag overrides a human unsuspend", async () => {
  const { client, calls } = fakeCollection({
    notes: { 100: twoCardNote(500, { tags: [dirSuspendedTag(1)] }) },
  });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "wanted-back", dirSuspended: [1] }, noteId: 100, isNew: true }],
    { reSuspendHumanUnsuspended: true },
  );
  assert.equal(out.suspended.length, 1);
  assert.deepEqual(out.humanUnsuspended, []);
  assert.ok(names(calls).includes("suspend"));
});

test("a card already suspended is left alone — the pass is idempotent", async () => {
  const { client, calls } = fakeCollection({
    notes: { 100: twoCardNote(500, { tags: [dirSuspendedTag(1)], queues: [0, -1] }) },
  });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "settled", dirSuspended: [1] }, noteId: 100, isNew: true }],
    {},
  );
  assert.deepEqual(out.suspended, []);
  assert.deepEqual(out.humanUnsuspended, [], "suspended and tagged is the state we wanted");
  assert.ok(!names(calls).includes("suspend"));
});

test("a dry run reads and plans but writes nothing", async () => {
  const { client, calls } = fakeCollection({ notes: { 100: twoCardNote(500) } });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "intro", dirSuspended: [1] }, noteId: 100, isNew: true }],
    { dry: true },
  );
  assert.deepEqual(out.suspended, []);
  assert.deepEqual(out.wouldSuspend, [
    { card: "intro", noteId: 100, cardId: 501, ord: 1, from: "unsuspended" },
  ]);
  assert.ok(!names(calls).includes("suspend"));
  assert.ok(!names(calls).includes("addTags"));
});

// The --dry line has to carry every identifier the reviewer needs to check it in Anki by hand.
test("a dry-run line names note, card, ordinal, from-state and to-state", () => {
  const line = describeSuspension({
    card: "intro",
    noteId: 100,
    cardId: 501,
    ord: 1,
    from: "unsuspended",
  });
  for (const part of ["intro", "note 100", "card 501", "ord 1", "Production", "-> suspended"]) {
    assert.ok(line.includes(part), `the preview line must name ${part}: ${line}`);
  }
});

// A missing card row means the note or the note type is not what we think it is. On the AnkiConnect
// path Anki generates one card per template, so this should be impossible — which is why it is
// reported rather than skipped.
test("a missing card at the wanted ordinal is refused, not silently skipped", async () => {
  const { client } = fakeCollection({
    notes: { 100: { tags: [], cards: { 0: { cardId: 500, queue: 0 } } } },
  });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "half", dirSuspended: [1] }, noteId: 100, isNew: true }],
    {},
  );
  assert.deepEqual(out.suspended, []);
  assert.equal(out.refused.length, 1);
  assert.match(out.refused[0].reason, /no card at ordinal/);
});

test("a card with no dirSuspended costs nothing at all", async () => {
  const { client, calls } = fakeCollection({ notes: { 100: twoCardNote(500) } });
  const out = await applyDirectionSuspension(
    client,
    [{ card: { id: "ordinary" }, noteId: 100, isNew: true }],
    {},
  );
  assert.deepEqual(out.suspended, []);
  assert.deepEqual(calls, []);
});

// "not yet run" and "known safe" are different states, and this is the file that must not collapse
// them. If this test ever fails, someone recorded a probe answer — go and re-read the gated path.
test("the delivered-note probes are still unanswered, and the gate says so", () => {
  assert.deepEqual(unansweredProbes(DELIVERED_SUSPEND_PROBES), DELIVERED_SUSPEND_PROBES);
  for (const id of DELIVERED_SUSPEND_PROBES) {
    assert.equal(PROBE_ANSWERS[id], null, `${id} must default to null, never false`);
  }
  assert.throws(() => assertProbesRecorded(DELIVERED_SUSPEND_PROBES, "a feature"), /a feature/);
});

test("once every named probe has an answer, the gate opens", () => {
  const answers = { "suspend-on-filtered": "suspends in place", "housekeeping-unsuspends": "no" };
  assert.deepEqual(unansweredProbes(DELIVERED_SUSPEND_PROBES, answers), []);
  assert.doesNotThrow(() =>
    assertProbesRecorded(DELIVERED_SUSPEND_PROBES, "a feature", { answers }),
  );
});

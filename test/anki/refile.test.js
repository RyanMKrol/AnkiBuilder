import test from "node:test";
import assert from "node:assert/strict";
import { ORPHAN_TAG, syncDeckContent } from "../../src/anki/deliver.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

/**
 * `--refile` and `--suspend-orphans`: what they PREVIEW today, and the gate that stops them running.
 *
 * Both are opt-in live writes to a card's scheduling state. Both preview freely (a preview reads and
 * prints) and both refuse to run until the behaviour probes have answered what they do to a card
 * sitting in a filtered deck.
 */

const SPEC = noteTypeSpec("ja");

const note = (noteId, { target, english, tags = [], cards = [] }) => ({
  noteId,
  tags,
  cards,
  fields: Object.fromEntries(
    SPEC.fields.map((f) => [
      f,
      { value: f === "Target" ? target : f === "English" ? english : "" },
    ]),
  ),
});

function fakeClient({ notes, decksOf, odids = {} }) {
  const calls = [];
  return {
    calls,
    client: {
      findNotes: async (query) =>
        notes
          .filter((n) => query.includes(`deck:"${n.homeDeck}"`) || query.includes('deck:"My Book"'))
          .map((n) => n.noteId),
      notesInfo: async (ids) => notes.filter((n) => ids.includes(n.noteId)),
      getDecks: async (ids) => {
        const out = {};
        for (const id of ids) {
          const name = decksOf[id];
          (out[name] ??= []).push(id);
        }
        return out;
      },
      cardsInfo: async (ids) => ids.map((id) => ({ cardId: id, odid: odids[id] ?? 0 })),
      changeDeck: async (ids, deck) => calls.push(["changeDeck", ids, deck]),
      suspend: async (ids) => calls.push(["suspend", ids]),
      addTags: async (ids, tags) => calls.push(["addTags", ids, tags]),
      updateNoteFields: async (id) => calls.push(["updateNoteFields", id]),
      addNote: async () => calls.push(["addNote"]),
      storeMediaFile: async () => {},
    },
  };
}

const deck = (cards) => ({
  type: "epub",
  id: "book",
  ankiParent: "My Book",
  spec: SPEC,
  marker: { ankiParent: "My Book" },
  units: [
    {
      ankiDeck: "My Book::Lesson 05::New Title",
      audioDir: null,
      // A deliverable card must have audio; these fixtures are about deck MEMBERSHIP, not sound.
      cards: (cards || []).map((c) => (c.audio ? c : { ...c, audio: `${c.id}.mp3` })),
    },
  ],
});

/** One delivered note whose two cards sit under the unit's OLD deck name. */
function renamedUnit({ odids = {} } = {}) {
  const notes = [
    Object.assign(
      note(1, { target: "ねこ", english: "Cat", tags: ["abid:cat"], cards: [11, 12] }),
      { homeDeck: "My Book::Lesson 05::New Title" },
    ),
  ];
  return fakeClient({
    notes,
    decksOf: { 11: "My Book::Lesson 5: Old Title", 12: "My Book::Lesson 5: Old Title" },
    odids,
  });
}

const card = { id: "cat", target: "ねこ", english: "Cat" };

test("without --refile, nothing about deck membership is even read", async () => {
  const { client, calls } = renamedUnit();
  const report = await syncDeckContent(client, deck([card]), false);
  assert.equal(report.refiled, null);
  assert.ok(!calls.some((c) => c[0] === "changeDeck"));
});

test("--refile --dry previews every move and writes nothing", async () => {
  const { client, calls } = renamedUnit();
  const lines = [];
  const report = await syncDeckContent(client, deck([card]), true, {
    refile: true,
    log: (m) => lines.push(m),
  });
  assert.deepEqual(
    report.refiled.moves.map((m) => [m.cardId, m.from, m.to]),
    [
      [11, "My Book::Lesson 5: Old Title", "My Book::Lesson 05::New Title"],
      [12, "My Book::Lesson 5: Old Title", "My Book::Lesson 05::New Title"],
    ],
  );
  assert.equal(report.refiled.applied, false);
  assert.match(lines.join("\n"), /refile: card 11 \(cat\)/);
  assert.deepEqual(calls, []);
});

test("the --refile RUN is refused: the changeDeck probe has never been answered", async () => {
  const { client, calls } = renamedUnit();
  await assert.rejects(
    () => syncDeckContent(client, deck([card]), false, { refile: true }),
    (error) => {
      assert.match(error.message, /--refile .* is gated on live-Anki behaviour probes/);
      assert.match(error.message, /change-deck-on-filtered/);
      return true;
    },
  );
  // And nothing at all was written — the refusal is asserted BEFORE the content pass, not after it.
  // Throwing at the end would leave every note updated and the delivered marker unwritten.
  assert.deepEqual(calls, [], "no write of any kind on the way to refusing");
});

test("a card in a FILTERED deck is skipped, with its reason, never moved", async () => {
  const { client } = renamedUnit({ odids: { 11: 4242 } });
  const report = await syncDeckContent(client, deck([card]), true, { refile: true });
  assert.deepEqual(
    report.refiled.moves.map((m) => m.cardId),
    [12],
  );
  assert.match(report.refiled.skipped[0].reason, /filtered deck/);
  assert.equal(report.refiled.skipped[0].cardId, 11);
});

test("a card outside this collection's deck tree is left alone", async () => {
  const notes = [
    Object.assign(note(1, { target: "ねこ", english: "Cat", tags: ["abid:cat"], cards: [11] }), {
      homeDeck: "My Book::Lesson 05::New Title",
    }),
  ];
  const { client } = fakeClient({ notes, decksOf: { 11: "My Own Study Pile" } });
  const report = await syncDeckContent(client, deck([card]), true, { refile: true });
  assert.deepEqual(report.refiled.moves, []);
  assert.match(report.refiled.skipped[0].reason, /outside "My Book"/);
});

test("--suspend-orphans previews the notes it would suspend, and refuses to run", async () => {
  const notes = [
    Object.assign(
      note(9, { target: "とり", english: "Bird", tags: ["abid:gone"], cards: [91, 92] }),
      { homeDeck: "My Book::Lesson 05::New Title" },
    ),
  ];
  const { client, calls } = fakeClient({ notes, decksOf: { 91: "x", 92: "x" } });

  const preview = await syncDeckContent(client, deck([]), true, { suspendOrphans: true });
  assert.deepEqual(
    preview.suspendedOrphans.orphans.map((o) => [o.card, o.cardIds]),
    [["gone", [91, 92]]],
  );
  assert.equal(preview.suspendedOrphans.applied, false);
  assert.deepEqual(calls, []);

  await assert.rejects(
    () => syncDeckContent(client, deck([]), false, { suspendOrphans: true }),
    /--suspend-orphans .* is gated on live-Anki behaviour probes/,
  );
  assert.deepEqual(calls, [], "refused before anything was written");
});

test("suspend-orphans skips a card in a filtered deck, exactly as --refile does", async () => {
  const notes = [
    Object.assign(
      note(9, { target: "とり", english: "Bird", tags: ["abid:gone"], cards: [91, 92] }),
      {
        homeDeck: "My Book::Lesson 05::New Title",
      },
    ),
  ];
  const { client } = fakeClient({
    notes,
    decksOf: { 91: "x", 92: "x" },
    odids: { 91: 4242 }, // 91 is in a custom-study session
  });
  const report = await syncDeckContent(client, deck([]), true, { suspendOrphans: true });
  assert.deepEqual(
    report.suspendedOrphans.orphans.map((o) => o.cardIds),
    [[92]],
    "only the unfiltered card would be suspended",
  );
  assert.match(report.suspendedOrphans.skipped[0].reason, /filtered deck/);
});

test("orphans are still reported when the flag is off — that behaviour is unchanged", async () => {
  const notes = [
    Object.assign(note(9, { target: "とり", english: "Bird", tags: ["abid:gone"], cards: [91] }), {
      homeDeck: "My Book::Lesson 05::New Title",
    }),
  ];
  const { client } = fakeClient({ notes, decksOf: { 91: "x" } });
  const report = await syncDeckContent(client, deck([]), true);
  assert.deepEqual(
    report.orphaned.map((o) => o.card),
    ["gone"],
  );
  assert.equal(report.suspendedOrphans, null);
  assert.equal(ORPHAN_TAG, "ab-orphaned");
});

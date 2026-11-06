import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  QUEUE_BACKUP_DIR,
  QUEUE_LOG,
  deckSearch,
  queueIntoDecks,
  queueNewCards,
  resolveChapterDecks,
  unqueueCards,
  withSafetyNet,
} from "../../src/anki/queueNewCards.js";
import { fakeQueueAnki, newCard } from "../support/fakeQueueAnki.js";

/**
 * scripts/queue-new-cards.mjs, driven against an in-memory fake of the handful of AnkiConnect
 * actions it uses. Nothing here reaches AnkiConnect (CLAUDE.md rule 6).
 */

const PARENT = "Genki I (Reading)";
const CH0 = `${PARENT}::Chapter 00: Kana`;
const CH6 = `${PARENT}::Chapter 06: Lesson 4: The First Date`;
const CH20 = `${PARENT}::Chapter 20: Reading and Writing 6: My Favorite Restaurant`;
const NOW = 1_793_971_610;

const DECKS = { [PARENT]: 1, [CH0]: 2, [CH6]: 3, [CH20]: 4, "Other::Chapter 00: Kana": 5 };
const fakeAnki = (cards, opts = {}) => fakeQueueAnki(cards, { decks: DECKS, ...opts });

test("resolveChapterDecks matches the numbered prefix directly under the parent", () => {
  const decks = { [PARENT]: 1, [CH0]: 2, [CH6]: 3, "Other::Chapter 06: Elsewhere": 9 };
  assert.deepEqual(resolveChapterDecks(decks, PARENT, [6, 0]), [CH6, CH0]);
  assert.throws(() => resolveChapterDecks(decks, PARENT, [7]), /no chapter 7 deck/);
  assert.throws(() => resolveChapterDecks(decks, "Missing", [0]), /no deck named "Missing"/);
});

test("resolveChapterDecks reads a speaking deck's bare Lesson grouping deck", () => {
  const p = "Busy People";
  const decks = { [p]: 1, [`${p}::Lesson 20`]: 2, [`${p}::Lesson 20::Going Places`]: 3 };
  assert.deepEqual(resolveChapterDecks(decks, p, [20]), [`${p}::Lesson 20`]);
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

test("unqueueCards puts unanswered cards back at their old positions and leaves studied ones", async () => {
  const { client, byId } = fakeAnki([
    newCard(1, CH0, 40),
    newCard(2, CH0, 41),
    newCard(3, CH0, 42),
  ]);
  const [r] = await queueIntoDecks({ client, decks: [CH0], perDeck: 3, now: NOW });
  byId.get(2).reps = 1; // studied since: its review is real history now

  const { restored, kept } = await unqueueCards({ client, cards: r.queued });
  assert.deepEqual(
    restored.map((c) => c.cardId),
    [1, 3],
  );
  assert.deepEqual(
    kept.map((c) => [c.cardId, c.reason]),
    [[2, "already studied"]],
  );
  assert.deepEqual([byId.get(1).type, byId.get(1).queue, byId.get(1).due], [0, 0, 40]);
  assert.equal(byId.get(3).due, 42);
  assert.equal(byId.get(2).queue, 1);
});

const scratchRoot = () => mkdtempSync(join(tmpdir(), "queue-new-backups-"));

test("withSafetyNet syncs, backs up, changes, then syncs again, and logs the run", async () => {
  const { client, calls } = fakeAnki([newCard(1, CH0, 1)]);
  const backupRoot = scratchRoot();
  const run = await withSafetyNet({
    client,
    parent: PARENT,
    action: "queue",
    backupRoot,
    change: () => queueIntoDecks({ client, decks: [CH0], now: NOW }),
  });

  const steps = ["getActiveProfile", "sync", "exportPackage", "setSpecificValueOfCard"];
  assert.deepEqual(
    calls.filter((c) => steps.includes(c)),
    ["getActiveProfile", "sync", "exportPackage", "setSpecificValueOfCard", "sync"],
  );
  assert.equal(run.syncedAfter, true);
  assert.ok(run.backupDir.startsWith(join(backupRoot, QUEUE_BACKUP_DIR)));
  assert.equal(readdirSync(join(backupRoot, QUEUE_BACKUP_DIR)).length, 1);

  const [entry] = readFileSync(join(backupRoot, QUEUE_LOG), "utf-8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(entry.action, "queue");
  assert.equal(entry.backupDir, run.backupDir);
  assert.equal(entry.result[0].queued[0].originalPosition, 1);
});

test("a failed first sync or backup stops before any card moves", async () => {
  for (const opts of [{ syncFails: [1] }, { exportResult: false }]) {
    const { client, writes } = fakeAnki([newCard(1, CH0, 1)], opts);
    let changed = false;
    await assert.rejects(
      withSafetyNet({
        client,
        parent: PARENT,
        action: "queue",
        backupRoot: scratchRoot(),
        change: async () => (changed = true),
      }),
      opts.syncFails ? /sync before the change failed.*Nothing was changed/ : /backup failed/,
    );
    assert.equal(changed, false);
    assert.equal(writes.length, 0);
  }
});

test("a failed second sync keeps the change and says so", async () => {
  const { client } = fakeAnki([newCard(1, CH0, 1)], { syncFails: [2] });
  const run = await withSafetyNet({
    client,
    parent: PARENT,
    action: "queue",
    backupRoot: scratchRoot(),
    change: () => queueIntoDecks({ client, decks: [CH0], now: NOW }),
  });
  assert.equal(run.syncedAfter, false);
  assert.match(run.syncError, /AnkiWeb unreachable/);
  assert.equal(run.result[0].queued.length, 1);
});

test("a change that fails after the backup names the backup, and the log records it", async () => {
  const { client } = fakeAnki([]);
  const backupRoot = scratchRoot();
  await assert.rejects(
    withSafetyNet({
      client,
      parent: PARENT,
      action: "queue",
      backupRoot,
      change: async () => {
        throw new Error("boom");
      },
    }),
    /boom \(backup taken before the change: .+\)/,
  );
  const [entry] = readFileSync(join(backupRoot, QUEUE_LOG), "utf-8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(entry.error, "boom");
  assert.ok(entry.backupDir);
});

test("withSafetyNet refuses the probe profiles", async () => {
  const { client, calls } = fakeAnki([], { profile: "Claude Test Profile" });
  await assert.rejects(
    withSafetyNet({
      client,
      parent: PARENT,
      action: "queue",
      backupRoot: scratchRoot(),
      change: async () => {},
    }),
    /probe profile/,
  );
  assert.ok(!calls.includes("sync"));
});

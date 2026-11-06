import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startDeckServer } from "../../src/server/index.js";
import { QUEUE_LOG } from "../../src/anki/queueNewCards.js";
import { fakeQueueAnki, newCard } from "../support/fakeQueueAnki.js";

// The dashboard's "+5 new" button: the routes behind it, against a scratch book and a fake Anki.
// What matters is that the button can only reach a deck Deliver created, and that it never writes a
// card without the sync and the backup first.

// The parent is the name Deliver resolves for the book, which for a scratch book with no EPUB
// metadata is the fallback below. The marker only says the deck has been delivered.
const PARENT = "AnkiBuilder Book Deck";
const MEETING = `${PARENT}::Lesson 01::Meeting`;
const EXTRAS = `${PARENT}::Lesson 01::Meeting (Extras)`;

function book({ delivered = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "queue-new-out-"));
  const bookDir = join(root, "epubs", "bk");
  mkdirSync(bookDir, { recursive: true });
  writeFileSync(
    join(bookDir, "book.json"),
    JSON.stringify({ title: "Bk", slug: "bk", epubHash: null, targetLanguage: "ja" }),
  );
  const unit = (name, meta, id) => {
    mkdirSync(join(bookDir, name), { recursive: true });
    writeFileSync(
      join(bookDir, name, "cards.json"),
      JSON.stringify({
        // Reviewed with audio is what puts a lesson in "Built" rather than "Not finished".
        meta: { done: true, reviewed: true, targetLanguage: "ja", ...meta },
        items: [
          {
            id,
            english: "One",
            target: "いち",
            pronunciation: "ichi",
            category: "Numbers",
            audio: `${id}.mp3`,
          },
        ],
      }),
    );
  };
  unit("chapter-0", { chapterNumber: 1, chapterLabel: "Lesson 1: Meeting" }, "a");
  unit(
    "chapter-0-extras",
    {
      chapterNumber: 1,
      chapterLabel: "Lesson 1: Meeting (Extras)",
      baseChapterLabel: "Lesson 1: Meeting",
    },
    "b",
  );
  if (delivered) {
    writeFileSync(join(bookDir, "anki-delivered.json"), JSON.stringify({ ankiParent: PARENT }));
  }
  return root;
}

async function withServer(opts, fn) {
  const backupRoot = mkdtempSync(join(tmpdir(), "queue-new-backups-"));
  const { server, url } = await startDeckServer({
    port: 0,
    outputRoot: book(opts.book),
    backupRoot,
    ...opts.server,
  });
  try {
    return await fn(url, backupRoot);
  } finally {
    server.close();
  }
}

async function call(url, path, method = "GET") {
  const r = await fetch(url + path, { method });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // A 404 page is HTML.
  }
  return { status: r.status, body };
}

const cards = () => [
  newCard(1, MEETING, 3),
  newCard(2, MEETING, 1),
  { ...newCard(3, EXTRAS, 1), introducedToday: true, type: 1, queue: 1, reps: 1 },
  newCard(4, EXTRAS, 2),
];

test("status lists each finished lesson by the deck name Deliver gives it", async () => {
  const anki = fakeQueueAnki(cards());
  await withServer({ server: { createClient: () => anki.client } }, async (url) => {
    const { status, body } = await call(url, "/api/deck/book/bk/queue-new");
    assert.equal(status, 200);
    assert.equal(body.perDeck, 5);
    assert.deepEqual(
      body.units.map((u) => [u.deck, u.introducedToday, u.newLeft]),
      [
        [MEETING, 0, 2],
        [EXTRAS, 1, 1],
      ],
    );
  });
  assert.ok(!anki.calls.includes("setSpecificValueOfCard"), "status never writes");
});

test("the button syncs, backs up, queues that lesson only, syncs again, and logs it", async () => {
  const anki = fakeQueueAnki(cards());
  await withServer({ server: { createClient: () => anki.client } }, async (url, backupRoot) => {
    const seq = (await call(url, "/api/deck/book/bk/queue-new")).body.units[0].seq;
    const { status, body } = await call(url, `/api/deck/book/bk/unit/${seq}/queue-new`, "POST");
    assert.equal(status, 200);
    assert.deepEqual(
      body.queued.map((c) => c.cardId),
      [2, 1],
    );
    assert.equal(body.syncedAfter, true);
    assert.ok(body.backupDir.startsWith(backupRoot));
    assert.match(readFileSync(join(backupRoot, QUEUE_LOG), "utf-8"), /"action":"queue"/);
  });
  const steps = ["sync", "exportPackage", "setSpecificValueOfCard"];
  assert.deepEqual(
    anki.calls.filter((c) => steps.includes(c)),
    ["sync", "exportPackage", "setSpecificValueOfCard", "setSpecificValueOfCard", "sync"],
  );
  assert.equal(anki.byId.get(4).queue, 0, "the other lesson is untouched");
});

test("a failed sync before the change queues nothing and says so", async () => {
  const anki = fakeQueueAnki(cards(), { syncFails: [1] });
  await withServer({ server: { createClient: () => anki.client } }, async (url) => {
    const seq = (await call(url, "/api/deck/book/bk/queue-new")).body.units[0].seq;
    const { status, body } = await call(url, `/api/deck/book/bk/unit/${seq}/queue-new`, "POST");
    assert.equal(status, 502);
    assert.match(body.error, /Nothing was changed/);
  });
  assert.ok(!anki.calls.includes("exportPackage"));
  assert.ok(!anki.calls.includes("setSpecificValueOfCard"));
});

test("a deck never delivered to Anki has no button to press", async () => {
  const anki = fakeQueueAnki(cards());
  await withServer(
    { book: { delivered: false }, server: { createClient: () => anki.client } },
    async (url) => {
      const { status, body } = await call(url, "/api/deck/book/bk/unit/0/queue-new", "POST");
      assert.equal(status, 409);
      assert.match(body.error, /has not been delivered/);
      const page = await (await fetch(url + "/")).text();
      assert.ok(!page.includes('class="qnew"'));
    },
  );
  assert.deepEqual(anki.calls, []);
});

test("the button is not routed through the dashboard's write journal", async () => {
  const gitCalls = [];
  const git = {
    snapshot: async () => (gitCalls.push("snapshot"), new Map()),
    record: async () => void gitCalls.push("record"),
    assess: async () => ({ ok: true, commitPaths: [] }),
  };
  const anki = fakeQueueAnki(cards());
  await withServer({ server: { git, createClient: () => anki.client } }, async (url) => {
    const seq = (await call(url, "/api/deck/book/bk/queue-new")).body.units[0].seq;
    assert.equal((await call(url, `/api/deck/book/bk/unit/${seq}/queue-new`, "POST")).status, 200);
  });
  assert.deepEqual(gitCalls, []);
});

test("the page shows the buttons on an editable server and not on a read-only one", async () => {
  const anki = fakeQueueAnki(cards());
  await withServer({ server: { createClient: () => anki.client } }, async (url) => {
    const page = await (await fetch(url + "/")).text();
    assert.equal((page.match(/class="urow qrow"/g) || []).length, 2);
    assert.match(page, /data-queue="\/api\/deck\/book\/bk"/);
  });
  await withServer(
    { server: { editable: false, createClient: () => anki.client } },
    async (url) => {
      const page = await (await fetch(url + "/")).text();
      assert.ok(!page.includes('class="qnew"'));
      assert.equal((await call(url, "/api/deck/book/bk/queue-new")).status, 404);
    },
  );
});

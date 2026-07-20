import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Buffer } from "buffer";
import { startDeckServer } from "../../src/server/index.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-"));
  const book = join(root, "epubs", "mybook");
  mkdirSync(join(book, "chapter-0", "audio"), { recursive: true });
  writeFileSync(
    join(book, "book.json"),
    JSON.stringify({ title: "My Book", targetLanguage: "ja" }),
  );
  writeFileSync(
    join(book, "chapter-0", "cards.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson One" },
      items: [
        {
          id: "a",
          english: "one",
          target: "いち",
          pronunciation: "ichi",
          category: "Numbers",
          audio: "a.mp3",
        },
        { id: "b", english: "two", target: "に", pronunciation: "ni", category: "Numbers" },
      ],
    }),
  );
  writeFileSync(join(book, "chapter-0", "audio", "a.mp3"), Buffer.from("CLIP-A-BYTES"));
  return root;
}

// Injected font deps so the test doesn't depend on the bundled asset.
const fontDeps = {
  getLanguageFont: () => ({ family: "X" }),
  readFontBytes: () => Buffer.from("FONTBYTES"),
};

async function withServer(root, fn) {
  const { server, url } = await startDeckServer({ port: 0, outputRoot: root, ...fontDeps });
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

test("dashboard lists decks; deck page has collapsible lessons + audio URLs; media streams bytes", async () => {
  const root = fixture();
  try {
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.match(home, /My Book/);
      assert.match(home, /\/deck\/book\/mybook/);

      const deckRes = await fetch(`${url}/deck/book/mybook`);
      assert.equal(deckRes.status, 200);
      const deck = await deckRes.text();
      assert.match(deck, /<details class="lesson">/);
      assert.doesNotMatch(deck, /<details class="lesson" open>/); // collapsed by default
      assert.match(deck, /Lesson One/);
      assert.match(deck, /src="\/media\/book\/mybook\/0\/a\.mp3"/); // card a has audio
      assert.match(deck, /class="x">—/); // card b has none
      assert.match(deck, /Expand all/);

      const mediaRes = await fetch(`${url}/media/book/mybook/0/a.mp3`);
      assert.equal(mediaRes.status, 200);
      assert.equal(mediaRes.headers.get("content-type"), "audio/mpeg");
      assert.equal(await mediaRes.text(), "CLIP-A-BYTES");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("media supports Range requests (206 with a byte slice)", async () => {
  const root = fixture();
  try {
    await withServer(root, async (url) => {
      const res = await fetch(`${url}/media/book/mybook/0/a.mp3`, {
        headers: { Range: "bytes=0-3" },
      });
      assert.equal(res.status, 206);
      assert.equal(res.headers.get("content-range"), "bytes 0-3/12");
      assert.equal(await res.text(), "CLIP"); // first 4 bytes of "CLIP-A-BYTES"
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("path traversal, unknown routes, and non-GET are rejected", async () => {
  const root = fixture();
  try {
    await withServer(root, async (url) => {
      // encoded ../ in the file segment — rejected by the filename guard
      assert.equal((await fetch(`${url}/media/book/mybook/0/..%2F..%2Fbook.json`)).status, 404);
      assert.equal((await fetch(`${url}/deck/book/nope`)).status, 404);
      assert.equal((await fetch(`${url}/deck/nosuchtype/x`)).status, 404);
      assert.equal((await fetch(`${url}/nonsense`)).status, 404);
      assert.equal((await fetch(`${url}/`, { method: "POST" })).status, 405);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("font asset is served from the injected font bytes", async () => {
  const root = fixture();
  try {
    await withServer(root, async (url) => {
      const res = await fetch(`${url}/assets/font.woff2`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "font/woff2");
      assert.equal(await res.text(), "FONTBYTES");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty output shows an empty-state, not a 500", async () => {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-empty-"));
  try {
    await withServer(root, async (url) => {
      const res = await fetch(`${url}/`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /No built decks found/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

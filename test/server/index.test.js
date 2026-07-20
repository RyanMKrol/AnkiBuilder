import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
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

// Injected deps so the tests don't depend on the bundled font, a real ElevenLabs key, or the network.
const fontDeps = {
  getLanguageFont: () => ({ family: "X" }),
  readFontBytes: () => Buffer.from("FONTBYTES"),
};
const editDeps = {
  ...fontDeps,
  getDefaultVoice: () => "voice1",
  fetchTts: async (text) => Buffer.from("TTS:" + text),
  getApiKey: () => "test-key",
};

async function withServer(root, fn, opts = fontDeps) {
  const { server, url } = await startDeckServer({ port: 0, outputRoot: root, ...opts });
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

const asJson = async (res) => ({ status: res.status, body: await res.json() });

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
      assert.equal((await fetch(`${url}/`, { method: "POST" })).status, 404); // non-write POST route
      assert.equal((await fetch(`${url}/`, { method: "PUT" })).status, 405); // unsupported method
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

test("a mixed-stage book renders corpus + translate sections read-only (no edit UI until all-audio)", async () => {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-wip-"));
  try {
    const book = join(root, "epubs", "wip");
    mkdirSync(book, { recursive: true });
    writeFileSync(join(book, "book.json"), JSON.stringify({ title: "WIP", targetLanguage: "ja" }));
    mkdirSync(join(book, "chapter-0"), { recursive: true });
    writeFileSync(
      join(book, "chapter-0", "corpus.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Corpus Ch" },
        items: [{ id: "a", english: "one", category: "Numbers", target: "いち", reading: "いち" }],
      }),
    );
    mkdirSync(join(book, "chapter-1"), { recursive: true });
    writeFileSync(
      join(book, "chapter-1", "cards.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 2, chapterLabel: "Translate Ch" },
        items: [
          { id: "b", english: "two", category: "Numbers", target: "に", pronunciation: "ni" },
        ],
      }),
    );

    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/wip`)).text();
        // corpus section columns
        assert.match(html, /<th>Category<\/th><th>Target<\/th><th>Reading<\/th><th>Flags<\/th>/);
        assert.match(html, /data-stage="corpus"/);
        // translate section columns
        assert.match(
          html,
          /<th>Target<\/th><th>Pronunciation<\/th><th>Category<\/th><th>Note<\/th>/,
        );
        assert.match(html, /data-stage="translate"/);
        // not all-audio → read-only: no edit controls or rebuild toolbar
        assert.doesNotMatch(html, /Rebuild deck/);
        assert.doesNotMatch(html, /class="repl"/);
        assert.doesNotMatch(html, /class="gen"/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Corpus review write-back (exclude toggle + mark reviewed) in the dashboard.
// ---------------------------------------------------------------------------

function corpusFixture() {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-corpus-"));
  const book = join(root, "epubs", "cbook");
  mkdirSync(join(book, "chapter-0"), { recursive: true });
  writeFileSync(join(book, "book.json"), JSON.stringify({ title: "C Book", targetLanguage: "ja" }));
  writeFileSync(
    join(book, "chapter-0", "corpus.json"),
    JSON.stringify({
      meta: {
        targetLanguage: "ja",
        sourceType: "epub",
        epubHash: "h1",
        chapterNumber: 2,
        chapterLabel: "Ch",
      },
      items: [
        { id: "a", english: "one", category: "Numbers", notes: null, target: "いち" },
        { id: "b", english: "two", category: "Numbers", notes: null, target: "に" },
      ],
    }),
  );
  return { root, book };
}
const readCorpus = (book) =>
  JSON.parse(readFileSync(join(book, "chapter-0", "corpus.json"), "utf-8"));

test("corpus section is editable: exclude checkboxes, Mark reviewed, and #deckctx are rendered", async () => {
  const { root } = corpusFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/cbook`)).text();
        assert.match(html, /id="deckctx"/);
        assert.match(html, /class="excl"/);
        assert.match(html, /Mark reviewed/);
        assert.match(html, /data-stage="corpus"/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("corpus exclude writes the flag; mark-reviewed sets meta.reviewed + saves the filtered corpus to the library", async () => {
  const { root, book } = corpusFixture();
  const saved = [];
  try {
    await withServer(
      root,
      async (url) => {
        const ex = await asJson(
          await fetch(`${url}/api/deck/book/cbook/unit/0/card/a/corpus/exclude`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excluded: true }),
          }),
        );
        assert.equal(ex.status, 200);
        assert.equal(readCorpus(book).items.find((i) => i.id === "a").excluded, true);

        const rev = await asJson(
          await fetch(`${url}/api/deck/book/cbook/unit/0/corpus/reviewed`, { method: "POST" }),
        );
        assert.equal(rev.status, 200);
        assert.equal(readCorpus(book).meta.reviewed, true);
        // the library copy is saved for (h1, 2), with the excluded item filtered out
        assert.deepEqual(saved, [{ hash: "h1", ch: 2, ids: ["b"] }]);
      },
      {
        ...editDeps,
        saveChapterCorpus: (hash, ch, corpus) =>
          saved.push({ hash, ch, ids: corpus.items.map((i) => i.id) }),
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("read-only server 403s the corpus write routes and hides the controls", async () => {
  const { root } = corpusFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/cbook`)).text();
        assert.doesNotMatch(html, /class="excl"/);
        assert.doesNotMatch(html, /id="deckctx"/);
        assert.equal(
          (await fetch(`${url}/api/deck/book/cbook/unit/0/corpus/reviewed`, { method: "POST" }))
            .status,
          403,
        );
      },
      { ...editDeps, editable: false },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Translate review write-back (exclude + inline field edit) in the dashboard.
// ---------------------------------------------------------------------------

function translateFixture() {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-tr-"));
  const book = join(root, "epubs", "tbook");
  mkdirSync(join(book, "chapter-0"), { recursive: true });
  writeFileSync(join(book, "book.json"), JSON.stringify({ title: "T Book", targetLanguage: "ja" }));
  writeFileSync(
    join(book, "chapter-0", "cards.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Tch" },
      items: [
        { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
        { id: "b", english: "two", category: "Numbers", target: "に", pronunciation: "ni" },
      ],
    }),
  );
  return { root, book };
}
const readCards = (book) =>
  JSON.parse(readFileSync(join(book, "chapter-0", "cards.json"), "utf-8"));

test("translate section is editable: exclude checkboxes, editable target/pron cells, #deckctx", async () => {
  const { root } = translateFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/tbook`)).text();
        assert.match(html, /data-stage="translate"/);
        assert.match(html, /data-field="target"/);
        assert.match(html, /data-field="pronunciation"/);
        assert.match(html, /class="excl"/);
        assert.match(html, /id="deckctx"/);
        // no audio-edit UI at the translate stage
        assert.doesNotMatch(html, /Rebuild deck/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("translate exclude writes the flag; translate edit updates whitelisted fields", async () => {
  const { root, book } = translateFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const ex = await asJson(
          await fetch(`${url}/api/deck/book/tbook/unit/0/card/a/translate/exclude`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excluded: true }),
          }),
        );
        assert.equal(ex.status, 200);
        assert.equal(readCards(book).items.find((i) => i.id === "a").excluded, true);

        const ed = await asJson(
          await fetch(`${url}/api/deck/book/tbook/unit/0/card/b/translate/edit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "二", pronunciation: "ni!", english: "HACK" }),
          }),
        );
        assert.equal(ed.status, 200);
        const b = readCards(book).items.find((i) => i.id === "b");
        assert.equal(b.target, "二");
        assert.equal(b.pronunciation, "ni!");
        assert.equal(b.english, "two", "non-whitelisted field untouched");
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("read-only server 403s the translate write routes and hides the controls", async () => {
  const { root } = translateFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/tbook`)).text();
        assert.doesNotMatch(html, /class="excl"/);
        assert.doesNotMatch(html, /id="deckctx"/);
        assert.equal(
          (
            await fetch(`${url}/api/deck/book/tbook/unit/0/card/a/translate/exclude`, {
              method: "POST",
            })
          ).status,
          403,
        );
      },
      { ...editDeps, editable: false },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Editor: upload / generate / select / rebuild / download (editable server).
// ---------------------------------------------------------------------------

test("editable deck page shows Replace/Generate/Rebuild controls", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/mybook`)).text();
        assert.match(html, /Rebuild deck/);
        assert.match(html, /class="repl"/);
        assert.match(html, /class="gen"/);
        assert.match(html, /data-card-id="a"/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("upload writes a new clip, updates cards.json, and /media serves the new bytes", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        // card b starts with NO audio → upload adds the field
        const up = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/b/audio?ext=mp3`, {
            method: "POST",
            body: Buffer.from("NEW-BYTES"),
          }),
        );
        assert.equal(up.status, 200);
        assert.match(up.body.audio, /^b-user-[0-9a-f]{8}\.mp3$/);

        const cards = JSON.parse(
          readFileSync(join(root, "epubs/mybook/chapter-0/cards.json"), "utf-8"),
        );
        assert.equal(cards.items.find((i) => i.id === "b").audio, up.body.audio);

        const media = await fetch(`${url}${up.body.mediaUrl}`);
        assert.equal(media.status, 200);
        assert.equal(await media.text(), "NEW-BYTES");
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generate makes a FRESH TTS call per variant every time (no cache), without touching cards.json; select applies one", async () => {
  const root = fixture();
  try {
    let ttsCalls = 0;
    const countingDeps = {
      ...editDeps,
      fetchTts: async (text) => {
        ttsCalls += 1;
        return Buffer.from("TTS:" + text);
      },
    };
    await withServer(
      root,
      async (url) => {
        const before = readFileSync(join(root, "epubs/mybook/chapter-0/cards.json"), "utf-8");
        const gen = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/generate`, { method: "POST" }),
        );
        assert.equal(gen.status, 200);
        assert.equal(gen.body.variants.length, 2); // plain ja card → no 。 / with 。
        assert.equal(ttsCalls, 2); // one fresh ElevenLabs call per variant
        // fresh clips are named distinctly (never the built hash(text).mp3), so they can't clobber it
        assert.match(gen.body.variants[0].audio, /-gen-[0-9a-f]{8}\.mp3$/);
        // a second generate calls TTS again — no cache reuse
        await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/generate`, { method: "POST" });
        assert.equal(ttsCalls, 4);
        // stubbed clip is reachable
        assert.equal((await fetch(`${url}${gen.body.variants[0].mediaUrl}`)).status, 200);
        // generation did not mutate cards.json
        assert.equal(
          readFileSync(join(root, "epubs/mybook/chapter-0/cards.json"), "utf-8"),
          before,
        );

        const sel = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/select`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: gen.body.variants[0].audio }),
          }),
        );
        assert.equal(sel.status, 200);
        const cards = JSON.parse(
          readFileSync(join(root, "epubs/mybook/chapter-0/cards.json"), "utf-8"),
        );
        assert.equal(cards.items.find((i) => i.id === "a").audio, gen.body.variants[0].audio);
      },
      countingDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuild regenerates deck.apkg and /download streams it as an attachment", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        // replace card a's clip, then rebuild
        await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio?ext=mp3`, {
          method: "POST",
          body: Buffer.from("REBUILT-CLIP"),
        });
        const rb = await asJson(
          await fetch(`${url}/api/deck/book/mybook/rebuild`, { method: "POST" }),
        );
        assert.equal(rb.status, 200);
        assert.equal(rb.body.noteCount, 2);
        assert.match(rb.body.apkgPath, /mybook[/\\]deck\.apkg$/);

        const dl = await fetch(`${url}${rb.body.downloadUrl}`);
        assert.equal(dl.status, 200);
        assert.equal(dl.headers.get("content-type"), "application/octet-stream");
        assert.match(dl.headers.get("content-disposition"), /attachment; filename="mybook\.apkg"/);
        assert.ok((await dl.arrayBuffer()).byteLength > 0);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("read-only server hides the edit UI and 403s the write routes", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/mybook`)).text();
        assert.doesNotMatch(html, /Rebuild deck/);
        assert.doesNotMatch(html, /class="repl"/);
        assert.equal(
          (await fetch(`${url}/api/deck/book/mybook/rebuild`, { method: "POST" })).status,
          403,
        );
      },
      { ...editDeps, editable: false },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("editor input errors: bad ext 400, oversized 413, unknown card 404, missing key 503", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        assert.equal(
          (
            await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio?ext=exe`, {
              method: "POST",
              body: Buffer.from("x"),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio?ext=mp3`, {
              method: "POST",
              body: Buffer.alloc(11 * 1024 * 1024),
            })
          ).status,
          413,
        );
        assert.equal(
          (
            await fetch(`${url}/api/deck/book/mybook/unit/0/card/nope/audio?ext=mp3`, {
              method: "POST",
              body: Buffer.from("x"),
            })
          ).status,
          404,
        );
      },
      editDeps,
    );
    // no ElevenLabs key → 503 on generate
    await withServer(
      root,
      async (url) => {
        assert.equal(
          (await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/generate`, { method: "POST" }))
            .status,
          503,
        );
      },
      { ...editDeps, getApiKey: () => undefined },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuild with a chapter missing cards.json returns 409", async () => {
  const root = fixture();
  try {
    // add an unbuilt chapter dir → rebuild's assembly throws → 409
    mkdirSync(join(root, "epubs/mybook/chapter-1"), { recursive: true });
    await withServer(
      root,
      async (url) => {
        assert.equal(
          (await fetch(`${url}/api/deck/book/mybook/rebuild`, { method: "POST" })).status,
          409,
        );
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

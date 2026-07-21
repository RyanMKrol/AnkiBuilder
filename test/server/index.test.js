import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
  existsSync,
} from "fs";
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
      meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Lesson One", done: true },
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
      assert.match(home, /\/review\/book\/mybook\/0/); // built lesson opens the edit-audio view

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

test("built lesson has a single action opening the unit-scoped edit-audio view (no separate Browse)", async () => {
  const root = fixture();
  try {
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.match(home, /href="\/review\/book\/mybook\/0">Open/);
      assert.doesNotMatch(home, /\/deck\/book\/mybook/); // Browse is consolidated into the review view
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("home page bifurcates decks into 'In review' and 'Built' sections with different actions", async () => {
  const root = fixture(); // mybook is all-audio → Built
  try {
    // add an in-review book (corpus-only)
    const wip = join(root, "epubs", "wipbook");
    mkdirSync(join(wip, "chapter-0"), { recursive: true });
    writeFileSync(
      join(wip, "book.json"),
      JSON.stringify({ title: "WIP Book", targetLanguage: "ja" }),
    );
    writeFileSync(
      join(wip, "chapter-0", "corpus.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "C1" },
        items: [{ id: "a", english: "one", category: "Numbers", notes: null, target: null }],
      }),
    );
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.match(home, /In review/);
      assert.match(home, /Built · ready to study/);
      // in-review lesson → "Review →" to the unit-scoped /review
      assert.match(home, /href="\/review\/book\/wipbook\/0">Review/);
      assert.doesNotMatch(home, /\/deck\/book\/wipbook/);
      // built lesson → a single "Open" action to the unit-scoped edit-audio view
      assert.match(home, /href="\/review\/book\/mybook\/0">Open/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("browse view (/deck) is read-only even on an editable server, and links to Review", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/mybook`)).text();
        assert.match(html, /Browse · anki-builder/);
        assert.match(html, /src="\/media\/book\/mybook\/0\/a\.mp3"/); // players still render
        assert.doesNotMatch(html, /class="repl"/); // no edit controls
        assert.doesNotMatch(html, /class="gen"/);
        assert.doesNotMatch(html, /Rebuild deck/);
        assert.doesNotMatch(html, /id="deckctx"/);
        assert.match(html, /href="\/review\/book\/mybook"/); // link across to Review
      },
      editDeps,
    );
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
      assert.match(await res.text(), /No decks found/);
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
        const html = await (await fetch(`${url}/review/book/wip`)).text();
        // pre-translate corpus section is READ-ONLY English + Note + provenance ticks (no Target, no Exclude)
        assert.match(
          html,
          /<th>English<\/th><th>Category<\/th><th>Note<\/th><th class="ctr">AI-suggested<\/th><th class="ctr">Uncertain<\/th>/,
        );
        assert.match(html, /data-stage="corpus"/);
        // combined Corpus review section: English-first, Category, then Target + Pronunciation, Note, flags
        assert.match(
          html,
          /<th>English<\/th><th>Category<\/th><th>Target<\/th><th>Pronunciation<\/th><th>Note<\/th>/,
        );
        assert.match(html, /data-stage="translate"/);
        // not all-audio → the audio-edit UI + rebuild are absent
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

test("pre-translate corpus section is read-only: no exclude, no Mark reviewed, a run-translate hint", async () => {
  const { root } = corpusFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/cbook`)).text();
        assert.match(html, /data-stage="corpus"/);
        assert.doesNotMatch(html, /class="excl"/); // no exclude checkbox pre-translation
        assert.doesNotMatch(html, /Mark reviewed/); // the review gate is post-translation
        assert.match(html, /run <code>translate<\/code>/i); // hint to translate first
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Combined Corpus review write-back (exclude + inline edit + Mark reviewed) on cards.json.
// ---------------------------------------------------------------------------

function translateFixture() {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-tr-"));
  const book = join(root, "epubs", "tbook");
  mkdirSync(join(book, "chapter-0"), { recursive: true });
  writeFileSync(join(book, "book.json"), JSON.stringify({ title: "T Book", targetLanguage: "ja" }));
  writeFileSync(
    join(book, "chapter-0", "cards.json"),
    JSON.stringify({
      meta: {
        targetLanguage: "ja",
        sourceType: "epub",
        epubHash: "h1",
        chapterNumber: 2,
        chapterLabel: "Tch",
      },
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

test("Corpus review section is editable: exclude, editable target/pron cells, Mark reviewed, #deckctx", async () => {
  const { root } = translateFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/tbook`)).text();
        assert.match(html, /data-stage="translate"/);
        assert.match(html, /data-field="target"/);
        assert.match(html, /data-field="pronunciation"/);
        assert.match(html, /class="excl"/);
        assert.match(html, /Mark reviewed/); // the combined review carries the sign-off button
        assert.match(html, /id="deckctx"/);
        // no audio-edit UI at this stage
        assert.doesNotMatch(html, /Rebuild deck/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Corpus review: Mark reviewed sets cards.meta.reviewed + saves the filtered dedup corpus (epub)", async () => {
  const { root, book } = translateFixture();
  const saved = [];
  try {
    await withServer(
      root,
      async (url) => {
        // exclude card a, then mark reviewed
        await fetch(`${url}/api/deck/book/tbook/unit/0/card/a/review/exclude`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ excluded: true }),
        });
        const rev = await asJson(
          await fetch(`${url}/api/deck/book/tbook/unit/0/review/reviewed`, { method: "POST" }),
        );
        assert.equal(rev.status, 200);
        assert.equal(readCards(book).meta.reviewed, true);
        // dedup library gets (h1, 2) with the excluded card filtered out
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

test("Corpus review exclude writes the flag; edit updates whitelisted fields", async () => {
  const { root, book } = translateFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const ex = await asJson(
          await fetch(`${url}/api/deck/book/tbook/unit/0/card/a/review/exclude`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excluded: true }),
          }),
        );
        assert.equal(ex.status, 200);
        assert.equal(readCards(book).items.find((i) => i.id === "a").excluded, true);

        const ed = await asJson(
          await fetch(`${url}/api/deck/book/tbook/unit/0/card/b/review/edit`, {
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

test("read-only server 403s the Corpus review write routes and hides the controls", async () => {
  const { root } = translateFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/tbook`)).text();
        assert.doesNotMatch(html, /class="excl"/);
        assert.doesNotMatch(html, /id="deckctx"/);
        assert.equal(
          (
            await fetch(`${url}/api/deck/book/tbook/unit/0/card/a/review/exclude`, {
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

test("editable deck page shows Replace/Generate controls (rebuild is automatic, no button)", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.doesNotMatch(html, /Rebuild deck/); // no manual rebuild button
        assert.match(html, /id="deckctx"[^>]*data-done="1"/); // edit ctx carries done → auto-rebuild
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

test("generate-kanji returns kanji variants for a ja deck; the button is shown", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.match(html, /class="gen-kanji"/);

        const gen = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/generate-kanji`, {
            method: "POST",
          }),
        );
        assert.equal(gen.status, 200);
        assert.equal(gen.body.variants.length, 2); // no 。 / with 。
        assert.equal(gen.body.variants[0].kanji, "一"); // from the stubbed runClaude
        assert.match(gen.body.variants[0].audio, /-genkanji-[0-9a-f]{8}\.mp3$/);
        assert.equal((await fetch(`${url}${gen.body.variants[0].mediaUrl}`)).status, 200);
      },
      { ...editDeps, runClaude: () => '{ "kanji": "一" }' },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generate-kanji is hidden and 422s for a non-Japanese deck", async () => {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-es-"));
  try {
    const t = join(root, "templates", "nums", "es");
    mkdirSync(join(t, "audio"), { recursive: true });
    writeFileSync(
      join(t, "cards.json"),
      JSON.stringify({
        meta: { targetLanguage: "es", sourceType: "template" },
        items: [
          {
            id: "a",
            english: "one",
            category: "Numbers",
            target: "uno",
            pronunciation: "OO-no",
            audio: "a.mp3",
          },
        ],
      }),
    );
    writeFileSync(join(t, "audio", "a.mp3"), Buffer.from("CLIP"));
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/template/nums__es`)).text();
        assert.doesNotMatch(html, /class="gen-kanji"/);
        assert.equal(
          (
            await fetch(`${url}/api/deck/template/nums__es/unit/0/card/a/generate-kanji`, {
              method: "POST",
            })
          ).status,
          422,
        );
      },
      { ...editDeps, runClaude: () => '{ "kanji": "x" }' },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuild writes the single group deck.apkg (no per-lesson file, no download route)", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        // replace card a's clip, then rebuild the group package
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
        assert.equal(rb.body.downloadUrl, undefined); // download removed entirely

        // the group package lands at the book root, and NO per-lesson file is written
        assert.ok(statSync(join(root, "epubs/mybook/deck.apkg")).size > 0);
        assert.equal(existsSync(join(root, "epubs/mybook/chapter-0/deck.apkg")), false);

        // the download routes are gone
        assert.equal((await fetch(`${url}/download/book/mybook/deck.apkg`)).status, 404);
        assert.equal((await fetch(`${url}/download/book/mybook/0/deck.apkg`)).status, 404);
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
        const html = await (await fetch(`${url}/review/book/mybook`)).text();
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

test("audio review: Mark done sets meta.done and shows Reopen; Reopen clears it", async () => {
  const root = fixture();
  const p = join(root, "epubs/mybook/chapter-0/cards.json");
  // start not-done so the "Mark done" button shows
  const stripped = JSON.parse(readFileSync(p, "utf-8"));
  delete stripped.meta.done;
  writeFileSync(p, JSON.stringify(stripped));
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.match(html, /class="mark-done"/);
        assert.doesNotMatch(html, /class="reopen"/);

        const done = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/done`, { method: "POST" }),
        );
        assert.equal(done.status, 200);
        assert.equal(JSON.parse(readFileSync(p, "utf-8")).meta.done, true);

        const html2 = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.match(html2, /class="reopen"/);

        await fetch(`${url}/api/deck/book/mybook/unit/0/reopen`, { method: "POST" });
        assert.equal("done" in JSON.parse(readFileSync(p, "utf-8")).meta, false);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuild skips an in-progress chapter and merges only the done ones", async () => {
  const root = fixture(); // mybook chapter-0 is done
  try {
    // add an in-progress (no cards.json) chapter — it must be skipped, not fail the whole rebuild
    mkdirSync(join(root, "epubs/mybook/chapter-1"), { recursive: true });
    await withServer(
      root,
      async (url) => {
        const rb = await asJson(
          await fetch(`${url}/api/deck/book/mybook/rebuild`, { method: "POST" }),
        );
        assert.equal(rb.status, 200);
        assert.equal(rb.body.noteCount, 2); // only chapter-0's two cards were merged
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebuild 409s when no lesson is marked done", async () => {
  const root = fixture();
  try {
    // strip the done flag from the only chapter → nothing finished to build → 409
    const p = join(root, "epubs/mybook/chapter-0/cards.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    delete data.meta.done;
    writeFileSync(p, JSON.stringify(data));
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

// Adds a second, in-review (translate-stage, no audio) chapter to the mybook fixture.
function addTranslateChapter(root) {
  const ch = join(root, "epubs/mybook/chapter-1");
  mkdirSync(ch, { recursive: true });
  writeFileSync(
    join(ch, "cards.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", chapterNumber: 2, chapterLabel: "Lesson Two" },
      items: [
        { id: "c", english: "three", target: "さん", pronunciation: "san", category: "Numbers" },
      ],
    }),
  );
}

test("unit-scoped review renders ONE lesson editable at audio; out-of-range unit 404s", async () => {
  const root = fixture();
  addTranslateChapter(root); // ch1 is translate-stage — mixing stages
  try {
    await withServer(
      root,
      async (url) => {
        // The done audio lesson edits on its own, regardless of the in-review sibling.
        const one = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.match(one, /Lesson One/);
        assert.doesNotMatch(one, /Lesson Two/); // filtered to the single unit
        assert.match(one, /class="repl"/); // per-unit editable (audio controls present)
        assert.match(one, /id="deckctx"[^>]*data-done="1"/); // done → audio edits auto-rebuild the group
        assert.match(one, /<details class="lesson" open>/); // review opens the lesson expanded
        assert.doesNotMatch(one, /Expand all/); // …with no expand/collapse chrome
        assert.doesNotMatch(one, /Collapse all/);
        // A whole-deck review is NOT editable while stages are mixed (no audio edit controls).
        const all = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.doesNotMatch(all, /class="repl"/);
        // An out-of-range unit has no lesson to show.
        assert.equal((await fetch(`${url}/review/book/mybook/9`)).status, 404);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unit-scoped browse (/deck/:type/:id/:unit) shows one lesson read-only", async () => {
  const root = fixture();
  addTranslateChapter(root);
  try {
    await withServer(root, async (url) => {
      const html = await (await fetch(`${url}/deck/book/mybook/0`)).text();
      assert.match(html, /Browse · anki-builder/);
      assert.match(html, /Lesson One/);
      assert.doesNotMatch(html, /Lesson Two/);
      assert.doesNotMatch(html, /class="repl"/); // read-only
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the per-lesson rebuild route is gone (only the group package is built)", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        assert.equal(
          (await fetch(`${url}/api/deck/book/mybook/unit/0/rebuild`, { method: "POST" })).status,
          404,
        );
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Mark done rebuilds the group package so the single .apkg tracks the done-set", async () => {
  const root = fixture();
  // start not-done so there's no package yet, then mark done
  const p = join(root, "epubs/mybook/chapter-0/cards.json");
  const stripped = JSON.parse(readFileSync(p, "utf-8"));
  delete stripped.meta.done;
  writeFileSync(p, JSON.stringify(stripped));
  try {
    await withServer(
      root,
      async (url) => {
        assert.equal(existsSync(join(root, "epubs/mybook/deck.apkg")), false);
        const done = await fetch(`${url}/api/deck/book/mybook/unit/0/done`, { method: "POST" });
        assert.equal(done.status, 200);
        // the group package now exists (the newly-done lesson was folded in server-side)
        assert.ok(statSync(join(root, "epubs/mybook/deck.apkg")).size > 0);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("homepage never shows a Download action", async () => {
  const root = fixture();
  try {
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.doesNotMatch(home, />Download</);
      assert.doesNotMatch(home, /\/download\//);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

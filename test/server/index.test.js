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
import { tmpdir, hostname } from "os";
import { Buffer } from "buffer";
import { request as httpRequest } from "node:http";
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
      // A done lesson has necessarily passed BOTH gates, so the fixture carries `reviewed` too —
      // "Mark done" now refuses a lesson that never passed the corpus review.
      meta: {
        targetLanguage: "ja",
        chapterNumber: 1,
        chapterLabel: "Lesson One",
        reviewed: true,
        done: true,
      },
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
  // Stubbed so these end-to-end tests neither shell out to ffmpeg nor depend on it being installed.
  // Prefixing rather than replacing keeps each clip's bytes traceable to the take it came from.
  trim: async (bytes) => Buffer.from("CUT:" + bytes.toString()),
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
      // A built single-unit deck: the whole block is the link into the (always-editable) review.
      assert.match(home, /class="dblock single" href="\/review\/book\/mybook\/0"/);
      assert.doesNotMatch(home, /home-reopen/); // reopen is gone — done lessons are editable directly
      assert.doesNotMatch(home, />Open</); // no separate Open button — the block itself is clickable
      assert.doesNotMatch(home, /\/deck\/book\/mybook/); // Browse is consolidated into the review view
      assert.doesNotMatch(home, /class="dball"/); // no all-cards link — the block IS the whole deck
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("multi-lesson deck heading links to the deck-level review (all cards on one page); single-unit decks don't", async () => {
  const root = fixture(); // mybook: single unit → no heading link (the block itself is the link)
  try {
    // second chapter → mybook becomes multi-unit, so its heading gains the all-cards link
    const ch = join(root, "epubs", "mybook", "chapter-1");
    mkdirSync(ch, { recursive: true });
    writeFileSync(
      join(ch, "cards.json"),
      JSON.stringify({
        meta: {
          targetLanguage: "ja",
          chapterNumber: 2,
          chapterLabel: "Lesson Two",
          reviewed: true,
          done: true,
        },
        items: [{ id: "c", english: "three", target: "さん", pronunciation: "san" }],
      }),
    );
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.match(home, /<a class="dt" href="\/review\/book\/mybook"/); // title is the link
      assert.match(home, /class="dball" href="\/review\/book\/mybook">All cards/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("home page splits decks into 'Not finished' / 'In review' / 'Built' with different actions", async () => {
  const root = fixture(); // mybook is all-audio → Built
  try {
    // an in-review book: cards.json, no audio yet → the corpus review
    const wip = join(root, "epubs", "wipbook");
    mkdirSync(join(wip, "chapter-0"), { recursive: true });
    writeFileSync(
      join(wip, "book.json"),
      JSON.stringify({ title: "WIP Book", targetLanguage: "ja" }),
    );
    writeFileSync(
      join(wip, "chapter-0", "cards.json"),
      JSON.stringify({
        meta: {
          targetLanguage: "ja",
          chapterNumber: 1,
          chapterLabel: "C1",
          enriched: true,
          notesEnhanced: true,
        },
        items: [
          { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
        ],
      }),
    );
    // an UNFINISHED book: corpus.json only, so its build never produced anything reviewable
    const half = join(root, "epubs", "halfbook");
    mkdirSync(join(half, "chapter-0"), { recursive: true });
    writeFileSync(
      join(half, "book.json"),
      JSON.stringify({ title: "Half Book", targetLanguage: "ja" }),
    );
    writeFileSync(
      join(half, "chapter-0", "corpus.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "H1" },
        items: [{ id: "a", english: "one", category: "Numbers", notes: null, target: null }],
      }),
    );
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.match(home, /Not finished/);
      assert.match(home, /In review/);
      assert.match(home, /Built · ready to study/);
      // the unfinished lesson is listed under "Not finished", NOT counted as in review, and its badge
      // names the state rather than a review it hasn't reached
      const unfinishedSection = home.slice(
        home.indexOf('class="grp grp-unfinished"'),
        home.indexOf('class="grp grp-review"'),
      );
      assert.match(unfinishedSection, /Half Book/);
      assert.match(unfinishedSection, /incomplete/);
      assert.doesNotMatch(unfinishedSection, /WIP Book/);
      // …and the section says how to finish it
      assert.match(home, /anki-builder prepare --run/);
      // in-review lesson → its row links to the unit-scoped /review (whole row is the link now)
      assert.match(home, /href="\/review\/book\/wipbook\/0"/);
      assert.doesNotMatch(home, /\/deck\/book\/wipbook/);
      // built lesson → its row links to the unit-scoped edit-audio view
      assert.match(home, /href="\/review\/book\/mybook\/0"/);
      // …with no Reopen button anywhere: done lessons open straight into the editable review
      assert.doesNotMatch(home, /home-reopen/);
      // no separate Open/Review buttons — the split is conveyed by the sections above
      assert.doesNotMatch(home, />Open</);
      assert.doesNotMatch(home, />Review →</);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("shared chrome: every page carries the topbar, and an editable server the Deliver button (both bars)", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const home = await (await fetch(`${url}/`)).text();
        // Home topbar: page title, NO back link (it is the root).
        assert.match(home, /<div class="topbar"><span class="tb-title">Your decks<\/span>/);
        // Deliver renders twice — once in the full header's deliverbar, once in the topbar.
        assert.equal((home.match(/class="deliver-anki"/g) || []).length, 2);
        assert.match(home, /IntersectionObserver/); // the sticky-bar script is wired

        const review = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.match(
          review,
          /<div class="topbar"><a class="back" href="\/">← All decks<\/a><span class="tb-title">My Book<\/span>/,
        );
        assert.equal((review.match(/class="deliver-anki"/g) || []).length, 2);
        assert.match(review, /IntersectionObserver/);

        const browse = await (await fetch(`${url}/deck/book/mybook`)).text();
        assert.match(browse, /<div class="topbar"><a class="back" href="\/">/);
        assert.equal((browse.match(/class="deliver-anki"/g) || []).length, 2);
        assert.match(browse, /IntersectionObserver/);
      },
      editDeps,
    );
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

test("server binds loopback only and refuses writes with a foreign Host header", async () => {
  const root = fixture();
  try {
    const { server, url } = await startDeckServer({ port: 0, outputRoot: root, ...fontDeps });
    try {
      // Loopback bind: the dashboard can write into a live Anki collection, so it must not
      // be reachable from the LAN.
      assert.equal(server.address().address, "127.0.0.1");

      // A DNS-rebinding page reaches 127.0.0.1 but carries the attacker's hostname in Host.
      // fetch() refuses to override Host (a forbidden header), so issue the raw request.
      const reboundStatus = await new Promise((resolvePromise, reject) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port: server.address().port,
            path: "/",
            method: "POST",
            headers: { host: "evil.example.com" },
          },
          (res) => {
            res.resume();
            resolvePromise(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.equal(reboundStatus, 403);

      // Same-machine requests (Host: localhost/127.0.0.1, any port) still route normally —
      // this unknown write route falls through to 404, not 403.
      assert.equal((await fetch(`${url}/`, { method: "POST" })).status, 404);
      const viaIp = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: "POST" });
      assert.equal(viaIp.status, 404);
    } finally {
      server.close();
    }
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

test("a book mixing an unfinished lesson with a corpus-review lesson renders both read-only (no edit UI until all-audio)", async () => {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-wip-"));
  try {
    const book = join(root, "epubs", "wip");
    mkdirSync(book, { recursive: true });
    writeFileSync(join(book, "book.json"), JSON.stringify({ title: "WIP", targetLanguage: "ja" }));
    mkdirSync(join(book, "chapter-0"), { recursive: true });
    writeFileSync(
      join(book, "chapter-0", "corpus.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 1, chapterLabel: "Unfinished Ch" },
        items: [{ id: "a", english: "one", category: "Numbers", target: "いち", ttsText: "いち" }],
      }),
    );
    mkdirSync(join(book, "chapter-1"), { recursive: true });
    writeFileSync(
      join(book, "chapter-1", "cards.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 2, chapterLabel: "Corpus Ch" },
        items: [
          { id: "b", english: "two", category: "Numbers", target: "に", pronunciation: "ni" },
        ],
      }),
    );

    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/wip`)).text();
        // the unfinished lesson lists READ-ONLY English + Note + provenance ticks (no Target, no Exclude)
        assert.match(
          html,
          /<th>English<\/th><th>Category<\/th><th>Hint<\/th><th>Note<\/th><th class="ctr">AI-suggested<\/th><th class="ctr">Uncertain<\/th>/,
        );
        assert.match(html, /data-stage="incomplete"/);
        // Corpus review section: English-first, Category, then Target + Pronunciation, Note, flags
        assert.match(
          html,
          /<th>English<\/th><th>Category<\/th><th>Target<\/th><th>Pronunciation<\/th><th>Hint<\/th><th>Note<\/th>/,
        );
        assert.match(html, /data-stage="corpus"/);
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

test("an unfinished lesson is read-only: no exclude, no Mark reviewed, and names the command that finishes it", async () => {
  const { root } = corpusFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/cbook`)).text();
        assert.match(html, /data-stage="incomplete"/);
        assert.doesNotMatch(html, /class="excl-btn"/); // nothing to exclude — there are no cards yet
        assert.doesNotMatch(html, /Mark reviewed/); // neither review gate has been reached
        assert.match(html, /anki-builder prepare --run/); // names the command that completes the build
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
        // A lesson at the corpus gate has been through `prepare`; without these markers it is
        // correctly held back as unfinished (see the readiness tests below).
        enriched: true,
        notesEnhanced: true,
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
        assert.match(html, /data-stage="corpus"/);
        assert.match(html, /data-field="target"/);
        assert.match(html, /data-field="pronunciation"/);
        assert.match(html, /class="excl-btn"/);
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
        assert.doesNotMatch(html, /class="excl-btn"/);
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
        // A done lesson opens straight into the editable review — no reopen step.
        const html = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.doesNotMatch(html, /Rebuild deck/); // no manual rebuild button
        assert.match(html, /id="deckctx"[^>]*data-done="1"/); // done → edits auto-rebuild the package
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
        const card = cards.items.find((i) => i.id === "b");
        assert.equal(card.audio, up.body.audio);

        // The card ships the trimmed take…
        const media = await fetch(`${url}${up.body.mediaUrl}`);
        assert.equal(media.status, 200);
        assert.equal(await media.text(), "CUT:NEW-BYTES");

        // …while the upload itself is kept verbatim, so the review can play it and a hand trim can
        // re-cut the full-length recording.
        const original = await fetch(
          `${url}/media/book/mybook/0/${encodeURIComponent(card.audioOriginal)}`,
        );
        assert.equal(original.status, 200);
        assert.equal(await original.text(), "NEW-BYTES");
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
        // A plain card has nothing to choose between now the with-。 / no-。 pair is gone.
        assert.equal(gen.body.variants.length, 1);
        assert.equal(ttsCalls, 1); // one fresh ElevenLabs call per variant
        // fresh clips are named distinctly (never the built hash(text).mp3), so they can't clobber it
        assert.match(gen.body.variants[0].audio, /-gen-[0-9a-f]{8}\.mp3$/);
        // a second generate calls TTS again — no cache reuse
        await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/generate`, { method: "POST" });
        assert.equal(ttsCalls, 2);
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
        // The Generate (kanji) button renders directly — a done lesson is editable like any other.
        const html = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.match(html, /class="gen-kanji"/);

        const gen = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/generate-kanji`, {
            method: "POST",
          }),
        );
        assert.equal(gen.status, 200);
        assert.equal(gen.body.variants.length, 1); // one kanji take, no dot pair
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

test("rebuild writes the single named group package (no per-lesson file, no download route)", async () => {
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
        assert.match(rb.body.apkgPath, /mybook[/\\]mybook\.apkg$/);
        assert.equal(rb.body.downloadUrl, undefined); // download removed entirely

        // the group package lands at the book root, and NO per-lesson file is written
        assert.ok(statSync(join(root, "epubs/mybook/mybook.apkg")).size > 0);
        assert.equal(existsSync(join(root, "epubs/mybook/chapter-0/mybook-chapter-0.apkg")), false);

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
        // No Deliver button either — but the topbar chrome still renders.
        assert.doesNotMatch(html, /class="deliver-anki"/);
        assert.match(html, /class="topbar"/);
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

test("audio review: Mark done sets meta.done and shows the done badge; the reopen route is gone", async () => {
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
        assert.doesNotMatch(html, /class="done-badge"/);

        const done = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/done`, { method: "POST" }),
        );
        assert.equal(done.status, 200);
        assert.equal(JSON.parse(readFileSync(p, "utf-8")).meta.done, true);

        // Done shows as a badge — no Reopen button, and the edit controls stay.
        const html2 = await (await fetch(`${url}/review/book/mybook`)).text();
        assert.match(html2, /class="done-badge"/);
        assert.doesNotMatch(html2, /class="reopen"/);
        assert.match(html2, /class="repl"/);

        // The reopen endpoint no longer exists, and hitting it changes nothing.
        const gone = await fetch(`${url}/api/deck/book/mybook/unit/0/reopen`, { method: "POST" });
        assert.equal(gone.status, 404);
        assert.equal(JSON.parse(readFileSync(p, "utf-8")).meta.done, true);
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

test("unit-scoped review: a DONE lesson stays fully editable; out-of-range unit 404s", async () => {
  const root = fixture();
  addTranslateChapter(root); // ch1 is translate-stage — mixing stages
  try {
    await withServer(
      root,
      async (url) => {
        // A DONE lesson opens straight into the editable review: Replace/Generate, trim editor,
        // exclude, Review-note column — the done badge just marks its delivery state.
        const one = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.match(one, /Lesson One/);
        assert.doesNotMatch(one, /Lesson Two/); // filtered to the single unit
        assert.match(one, /Review · anki-builder/); // always the review, never a read-only View
        assert.match(one, /class="done-badge"/); // done state is shown…
        assert.doesNotMatch(one, /class="reopen"/); // …but there is nothing to reopen
        assert.match(one, /class="repl"/); // Replace/Generate present
        assert.match(one, /class="gen"/);
        assert.match(one, /class="excl-btn"/); // exclude present
        assert.match(one, /Review note/); // the internal review column shows too
        assert.match(one, /id="trim-modal"/); // trim editor available
        assert.match(one, /button\.excl-btn/); // the client script that wires exclude is loaded
        assert.match(one, /id="deckctx"[^>]*data-done="1"/); // done → edits auto-rebuild
        assert.match(one, /<details class="lesson" open>/); // still expanded
        assert.doesNotMatch(one, /Expand all/);

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
        assert.equal(existsSync(join(root, "epubs/mybook/mybook.apkg")), false);
        const done = await fetch(`${url}/api/deck/book/mybook/unit/0/done`, { method: "POST" });
        assert.equal(done.status, 200);
        // the group package now exists (the newly-done lesson was folded in server-side)
        assert.ok(statSync(join(root, "epubs/mybook/mybook.apkg")).size > 0);
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

// --- a lesson being built by a CLI stage is read-only ----------------------------------
// Hiding the controls is only half of it: a browser tab opened before the build started will
// still POST, so the server must refuse too. That refusal is what actually prevents the write.

function writeClaimFile(root, claim) {
  writeFileSync(
    join(root, "epubs", "mybook", "chapter-0", "claim.json"),
    JSON.stringify({ host: hostname(), startedAt: new Date().toISOString(), ...claim }),
  );
}

test("a lesson with a LIVE claim renders read-only, badged, and refuses writes", async () => {
  const root = fixture();
  // The fixture's lesson is done — which no longer blocks editing — so a live claim is the only
  // thing locking it here: building must override the always-editable rule.
  writeClaimFile(root, { stage: "audio", pid: process.pid });

  await withServer(
    root,
    async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.match(home, /building \(audio\)/, "the home page must say which stage is running");

      const page = await (await fetch(`${url}/review/book/mybook/0`)).text();
      assert.match(page, /is being built \(audio/, "the review page must explain why it is locked");
      assert.doesNotMatch(
        page,
        /<button[^>]*class="excl-btn/,
        "no Exclude control while a stage is writing",
      );

      const res = await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/review/exclude`, {
        method: "POST",
      });
      assert.equal(res.status, 409, "a stale tab's write must be refused, not silently applied");
    },
    editDeps,
  );
});

test("a STALE claim leaves the lesson editable and offers to clear it", async () => {
  const root = fixture();
  const cardsPath = join(root, "epubs", "mybook", "chapter-0", "cards.json");
  const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
  delete cards.meta.done;
  writeFileSync(cardsPath, JSON.stringify(cards));
  writeClaimFile(root, { stage: "assemble", pid: 999999 });

  await withServer(
    root,
    async (url) => {
      const page = await (await fetch(`${url}/review/book/mybook/0`)).text();
      assert.match(page, /was interrupted/, "a crashed build must say so");
      assert.match(page, /clear-claim/, "and offer a way to clear it");

      const cleared = await fetch(`${url}/api/deck/book/mybook/unit/0/claim/clear`, {
        method: "POST",
      });
      assert.equal(cleared.status, 200);
      assert.equal(
        existsSync(join(root, "epubs", "mybook", "chapter-0", "claim.json")),
        false,
        "a crash must never leave a lesson permanently locked",
      );
    },
    editDeps,
  );
});

test("clearing a LIVE claim is refused", async () => {
  const root = fixture();
  writeClaimFile(root, { stage: "audio", pid: process.pid });
  await withServer(
    root,
    async (url) => {
      const res = await fetch(`${url}/api/deck/book/mybook/unit/0/claim/clear`, { method: "POST" });
      assert.equal(res.status, 409, "clearing a live claim would hand a second writer the lesson");
    },
    editDeps,
  );
});

// ---------------------------------------------------------------------------
// The readiness gate. A cards.json alone used to be enough to sign a lesson off, so a bare
// `translate`, a `prepare` that died after translate, and a lesson built before a pass existed all
// presented as final card sets. These pin the state check that replaced trusting the route.
// ---------------------------------------------------------------------------

function unpreparedFixture(meta = {}) {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-unprep-"));
  const book = join(root, "epubs", "ubook");
  mkdirSync(join(book, "chapter-0"), { recursive: true });
  writeFileSync(join(book, "book.json"), JSON.stringify({ title: "U Book", targetLanguage: "ja" }));
  writeFileSync(
    join(book, "chapter-0", "cards.json"),
    JSON.stringify({
      // Exactly what `anki-builder translate --run <dir>` writes: real cards, no pass markers.
      meta: {
        targetLanguage: "ja",
        sourceType: "epub",
        epubHash: "h1",
        chapterNumber: 2,
        chapterLabel: "Uch",
        ...meta,
      },
      items: [
        { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
      ],
    }),
  );
  return { root, book };
}

test("an unprepared lesson is refused at Mark reviewed, naming what still has to run", async () => {
  const { root, book } = unpreparedFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const res = await asJson(
          await fetch(`${url}/api/deck/book/ubook/unit/0/review/reviewed`, { method: "POST" }),
        );
        assert.equal(res.status, 409);
        assert.match(res.body.error, /not ready to review/);
        assert.match(res.body.error, /fill-in-the-blank/);
        assert.match(res.body.error, /anki-builder prepare/);
        // …and it really didn't sign it off.
        const cards = JSON.parse(readFileSync(join(book, "chapter-0", "cards.json"), "utf-8"));
        assert.notEqual(cards.meta.reviewed, true);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unprepared lesson offers no Mark reviewed button at all", async () => {
  const { root } = unpreparedFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/ubook`)).text();
        assert.doesNotMatch(html, /Mark reviewed/);
        assert.match(html, /Not ready to review/);
        assert.match(html, /anki-builder prepare --run/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unprepared lesson is listed under 'Not finished', not 'In review'", async () => {
  const { root } = unpreparedFixture();
  try {
    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      const unfinished = home.slice(
        home.indexOf('class="grp grp-unfinished"'),
        home.indexOf('class="grp grp-review"') === -1
          ? home.length
          : home.indexOf('class="grp grp-review"'),
      );
      assert.match(unfinished, /U Book/);
      assert.match(unfinished, /prepare unfinished/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a prepared lesson passes the gate and signs off normally", async () => {
  const { root, book } = unpreparedFixture({ enriched: true, notesEnhanced: true });
  try {
    await withServer(
      root,
      async (url) => {
        const res = await asJson(
          await fetch(`${url}/api/deck/book/ubook/unit/0/review/reviewed`, { method: "POST" }),
        );
        assert.equal(res.status, 200);
        const cards = JSON.parse(readFileSync(join(book, "chapter-0", "cards.json"), "utf-8"));
        assert.equal(cards.meta.reviewed, true);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Readiness gates the FIRST review only — a lesson at the audio stage is past it by definition.
test("an audio-stage lesson is never held back by the readiness gate", async () => {
  const { root, book } = unpreparedFixture();
  try {
    const cardsPath = join(book, "chapter-0", "cards.json");
    const data = JSON.parse(readFileSync(cardsPath, "utf-8"));
    data.items[0].audio = "a.mp3";
    writeFileSync(cardsPath, JSON.stringify(data));

    await withServer(root, async (url) => {
      const home = await (await fetch(`${url}/`)).text();
      assert.doesNotMatch(home, /prepare unfinished/);
      assert.match(home, /In review/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Held at the REVIEW gate, not the audio stage. The old placement meant the reviewer read wrong romaji
// all the way through the lesson and only found out when the voice said the digits out loud.
test("a lesson with a numeral and no ttsText is held out of review, naming the cards", async () => {
  const root = mkdtempSync(join(tmpdir(), "deck-srv-num-"));
  try {
    const book = join(root, "epubs", "nbook");
    mkdirSync(join(book, "chapter-0"), { recursive: true });
    writeFileSync(
      join(book, "book.json"),
      JSON.stringify({ title: "N Book", targetLanguage: "ja" }),
    );
    writeFileSync(
      join(book, "chapter-0", "cards.json"),
      JSON.stringify({
        meta: {
          targetLanguage: "ja",
          sourceType: "epub",
          chapterNumber: 2,
          chapterLabel: "Nch",
          enriched: true,
          notesEnhanced: true,
        },
        items: [
          {
            id: "y",
            english: "In 2025",
            category: "Other",
            target: "2025ねんに",
            pronunciation: "2025-nen ni",
          },
        ],
      }),
    );

    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/nbook`)).text();
        assert.doesNotMatch(html, /Mark reviewed/);
        assert.match(html, /numeral that needs spelling out/);
        assert.match(html, /2025ねんに/);
        // …and signing off is refused even by a direct request.
        const res = await asJson(
          await fetch(`${url}/api/deck/book/nbook/unit/0/review/reviewed`, { method: "POST" }),
        );
        assert.equal(res.status, 409);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- the manual trim editor -----------------------------------------------------------------------

// The fixture's lesson, un-done and given an original take — the richest editing setup (a done
// lesson is just as editable; this one also exercises the Original column's fallback-free path).
function reviewableFixture() {
  const root = fixture();
  const path = join(root, "epubs/mybook/chapter-0/cards.json");
  const cards = JSON.parse(readFileSync(path, "utf-8"));
  cards.meta.done = false;
  Object.assign(cards.items[0], {
    audio: "a.mp3",
    audioOriginal: "a.orig.mp3",
    audioAuto: "a.mp3",
  });
  writeFileSync(path, JSON.stringify(cards));
  writeFileSync(
    join(root, "epubs/mybook/chapter-0/audio/a.orig.mp3"),
    Buffer.from("FULL-LENGTH-A"),
  );
  return root;
}

test("the audio review shows Original and In use columns, and offers Trim on a card with audio", async () => {
  const root = reviewableFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.match(html, /<th>Original<\/th><th>In use<\/th>/);
        // Replace/Generate mint a new recording, so they belong to the Original column; Trim re-cuts
        // an existing one, so it belongs to the clip it produces.
        assert.match(html, /class="au au-orig"[^]*?Replace[^]*?<td class="au">/);
        assert.match(html, /<button type="button" class="trim">/);
        assert.match(html, /id="trim-modal"/);
        assert.match(html, /data-original-url="[^"]*a\.orig\.mp3"/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The read-only views are about what the deck sounds like, not how it got there.
test("Browse stays a single audio column with no trim controls", async () => {
  const root = reviewableFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/deck/book/mybook/0`)).text();
        assert.match(html, /<th>Audio<\/th>/);
        assert.equal(/<th>Original<\/th>/.test(html), false);
        assert.equal(/class="trim"/.test(html), false);
        assert.equal(/id="trim-modal"/.test(html), false);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a done lesson still offers the trim editor — done no longer locks editing", async () => {
  const root = fixture(); // still done
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.equal(/class="trim"/.test(html), true);
        assert.equal(/id="trim-modal"/.test(html), true);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("POST audio/trim cuts the original and points the card at the result; revert undoes it", async () => {
  const root = reviewableFixture();
  const cardsPath = join(root, "epubs/mybook/chapter-0/cards.json");
  try {
    const cut = [];
    await withServer(
      root,
      async (url) => {
        const trimmed = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/trim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: 0.2, end: 1.4 }),
          }),
        );
        assert.equal(trimmed.status, 200);
        assert.match(trimmed.body.audio, /^a-manual-[0-9a-f]{8}\.mp3$/);
        assert.deepEqual(cut, [{ source: "FULL-LENGTH-A", start: 0.2, end: 1.4 }]);

        const card = JSON.parse(readFileSync(cardsPath, "utf-8")).items[0];
        assert.equal(card.audio, trimmed.body.audio);
        assert.deepEqual(card.audioTrim, { start: 0.2, end: 1.4 });

        const media = await fetch(`${url}${trimmed.body.mediaUrl}`);
        assert.equal(await media.text(), "CUT:FULL-LENGTH-A");

        // Reopening the page now pre-fills the editor with the range that was applied.
        const html = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.match(html, /data-trim-start="0\.2" data-trim-end="1\.4"/);

        const reverted = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/trim/revert`, {
            method: "POST",
          }),
        );
        assert.equal(reverted.status, 200);
        assert.equal(reverted.body.audio, "a.mp3", "back to the automatic take");
        assert.equal("audioTrim" in JSON.parse(readFileSync(cardsPath, "utf-8")).items[0], false);
      },
      {
        ...editDeps,
        trimToRange: (bytes, start, end) => {
          cut.push({ source: bytes.toString(), start, end });
          return Buffer.from("CUT:" + bytes.toString());
        },
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a cut that can't be applied answers with the reason, not a silent success", async () => {
  const root = reviewableFixture();
  try {
    await withServer(
      root,
      async (url) => {
        const res = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/trim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: 1.5, end: 0.5 }),
          }),
        );
        assert.equal(res.status, 422);
        assert.match(res.body.error, /too short/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the trim routes are refused on a read-only server", async () => {
  const root = reviewableFixture();
  try {
    await withServer(
      root,
      async (url) => {
        for (const path of ["/audio/trim", "/audio/trim/revert"]) {
          const res = await fetch(`${url}/api/deck/book/mybook/unit/0/card/a${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ start: 0, end: 1 }),
          });
          assert.equal(res.status, 403);
        }
      },
      { ...editDeps, editable: false },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the trim modal offers the cleanup chains, and POST audio/clean switches one", async () => {
  const root = reviewableFixture();
  const cardsPath = join(root, "epubs/mybook/chapter-0/cards.json");
  try {
    await withServer(
      root,
      async (url) => {
        const html = await (await fetch(`${url}/review/book/mybook/0`)).text();
        for (const chain of ["standard", "gentle", "aggressive"]) {
          assert.match(html, new RegExp(`data-filter="${chain}"`), `${chain} button rendered`);
        }

        const res = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/clean`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filter: "aggressive" }),
          }),
        );
        assert.equal(res.status, 200);
        assert.equal(
          JSON.parse(readFileSync(cardsPath, "utf-8")).items[0].audioFilter,
          "aggressive",
        );
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Chain names reach an ffmpeg command line. They're looked up in a fixed table and a raw filter string
// is never accepted, so a request can't inject arbitrary ffmpeg filters (or shell metacharacters).
test("audio/clean refuses anything that isn't a known chain name", async () => {
  const root = reviewableFixture();
  try {
    await withServer(
      root,
      async (url) => {
        for (const bad of ["asubcut=cutoff=1", "; rm -rf /", "", null, 42]) {
          const res = await asJson(
            await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/clean`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filter: bad }),
            }),
          );
          assert.equal(res.status, 400, `rejected: ${JSON.stringify(bad)}`);
          assert.match(res.body.error, /unknown cleanup filter/);
        }
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The editor cuts from whatever `data-original-url` points at, so a write that installs a new
// recording has to hand back the new original — not just the clip that ships.
test("Replace and Generate-select both report the new original, and clear a stale hand trim", async () => {
  const root = reviewableFixture();
  const cardsPath = join(root, "epubs/mybook/chapter-0/cards.json");
  try {
    // Start from a card that already carries a hand cut against the OLD recording.
    const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
    Object.assign(cards.items[0], {
      audioManual: "a-manual-old.mp3",
      audioTrim: { start: 0.1, end: 1.0 },
      audio: "a-manual-old.mp3",
    });
    writeFileSync(cardsPath, JSON.stringify(cards));
    writeFileSync(join(root, "epubs/mybook/chapter-0/audio/a-manual-old.mp3"), "OLD-CUT");

    await withServer(
      root,
      async (url) => {
        const up = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio?ext=mp3`, {
            method: "POST",
            body: Buffer.from("BRAND-NEW"),
          }),
        );
        assert.equal(up.status, 200);
        assert.ok(up.body.originalUrl, "the new original is reported so the row can be repointed");
        assert.match(up.body.originalUrl, /a-user-[0-9a-f]{8}\.orig\.mp3$/);
        assert.notEqual(up.body.originalUrl, up.body.mediaUrl);
        assert.equal(up.body.audioTrim, null, "the old hand trim is gone");
        assert.equal(up.body.audioFilter, "standard", "the chain actually applied is recorded");

        // …and the original URL really serves the uploaded bytes, not the previous recording.
        assert.equal(await (await fetch(`${url}${up.body.originalUrl}`)).text(), "BRAND-NEW");

        const card = JSON.parse(readFileSync(cardsPath, "utf-8")).items[0];
        assert.equal("audioManual" in card, false);
        assert.equal("audioTrim" in card, false);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The audio review's only exit from a "text changed" badge. It writes a decision, not a recording:
// the clip on disk is untouched, and who accepted it and when are on the card afterwards.
test("keeping a clip for the card's current text records the decision and changes no audio", async () => {
  const root = fixture();
  const cardsPath = join(root, "epubs", "mybook", "chapter-0", "cards.json");
  try {
    // A clip generated from text the card no longer has: the badge case.
    const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
    cards.items[0].audioTextHash = "0000000000000000";
    writeFileSync(cardsPath, JSON.stringify(cards));

    await withServer(
      root,
      async (url) => {
        const before = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.match(
          before,
          /class="badge badge-stale"/,
          "the row is badged before it is accepted",
        );
        assert.match(before, /button type="button" class="keep-clip"/);

        const res = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/a/audio/accept-text`, {
            method: "POST",
          }),
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.acceptedBy, "human");
        assert.match(res.body.audioTextHash, /^[0-9a-f]{16}$/);

        const card = JSON.parse(readFileSync(cardsPath, "utf-8")).items[0];
        assert.equal(card.audio, "a.mp3", "the clip is exactly the one that was there");
        assert.equal(card.audioTextHash, res.body.audioTextHash);
        assert.equal(card.audioTextHashAcceptedBy, "human");
        assert.match(card.audioTextHashAcceptedAt, /^\d{4}-\d{2}-\d{2}T/);

        const after = await (await fetch(`${url}/review/book/mybook/0`)).text();
        assert.doesNotMatch(
          after,
          /class="badge badge-stale"/,
          "and the badge is gone on the next render",
        );
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepting a card that has no audio says so rather than inventing a hash", async () => {
  const root = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const res = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/b/audio/accept-text`, {
            method: "POST",
          }),
        );
        assert.equal(res.status, 422);
        assert.match(res.body.error, /no audio to accept/);
      },
      editDeps,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

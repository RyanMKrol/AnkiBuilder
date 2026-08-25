import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { startDeckServer } from "../../src/server/index.js";
import { buildBookDeck } from "../../src/deck/index.js";

// The ADDITIONS review: the third review type, and the only one not scoped to a unit.
//
// The property that matters and that every test here is about: a retrofitted card is invisible to
// the deck until it is approved, and approving it does NOT disturb the sign-off of the unit it
// landed in. The whole reason the feature exists is to stop a dozen new cards re-opening hundreds of
// approved ones.

const fontDeps = {
  getLanguageFont: () => ({ family: "X" }),
  readFontBytes: () => Buffer.from("FONTBYTES"),
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

/** A DONE, signed-off lesson with one ordinary card and two retrofitted ones. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "additions-"));
  const book = join(root, "epubs", "mybook");
  mkdirSync(join(book, "chapter-0", "audio"), { recursive: true });
  writeFileSync(
    join(book, "book.json"),
    JSON.stringify({ title: "My Book", targetLanguage: "ja" }),
  );
  writeFileSync(
    join(book, "chapter-0", "cards.json"),
    JSON.stringify({
      meta: {
        targetLanguage: "ja",
        sourceType: "epub",
        chapterNumber: 1,
        chapterLabel: "Lesson 1: Meeting",
        reviewed: true,
        done: true,
      },
      items: [
        {
          id: "old",
          english: "one",
          target: "いち",
          pronunciation: "ichi",
          category: "Numbers",
          audio: "a.mp3",
        },
        {
          id: "new-pending",
          english: "gym",
          target: "ジム",
          pronunciation: "jimu",
          category: "Sports & Hobbies",
          addition: "notes-2026-08",
        },
        {
          id: "new-approved",
          english: "office",
          target: "かいしゃ",
          pronunciation: "kaisha",
          category: "Work & Occupations",
          addition: "notes-2026-08",
          additionReviewed: true,
        },
      ],
    }),
  );
  writeFileSync(join(book, "chapter-0", "audio", "a.mp3"), Buffer.from("CLIP"));
  return { root, book };
}

const readCards = (book) =>
  JSON.parse(readFileSync(join(book, "chapter-0", "cards.json"), "utf-8"));

test("a pending addition never reaches the built package; an approved one does", () => {
  const { root, book } = fixture();
  try {
    const out = join(root, "out.apkg");
    const built = buildBookDeck([{ name: "Lesson 1: Meeting", cards: readCards(book) }], {
      bookName: "My Book",
      outPath: out,
    });
    // Two of the three cards, and it is the pending one that is missing.
    assert.equal(built.noteCount, 2, "the pending addition is not packaged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the additions page lists the retrofit and names the deck each card is going into", async () => {
  const { root } = fixture();
  try {
    await withServer(root, async (url) => {
      const html = await (await fetch(`${url}/additions/book/mybook`)).text();
      assert.match(html, /gym/, "a pending addition is listed");
      assert.match(html, /office/, "an approved addition is listed too, so it can be re-judged");
      assert.ok(!/one<\/td>/.test(html), "an ordinary card of the same unit is NOT listed");
      // The question this review exists to answer.
      assert.match(html, /My Book › Lesson 01 › Meeting/, "the destination Anki deck is named");
      assert.match(html, /1<\/b> card waiting/, "the lede counts only what is pending");
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("approving a card clears the gate on disk and leaves the unit's own sign-off alone", async () => {
  const { root, book } = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const before = readCards(book).meta;
        const res = await asJson(
          await fetch(`${url}/api/deck/book/mybook/unit/0/card/new-pending/addition/approve`, {
            method: "POST",
          }),
        );
        assert.equal(res.status, 200);
        assert.equal(res.body.approved, true);

        const after = readCards(book);
        assert.equal(after.items.find((i) => i.id === "new-pending").additionReviewed, true);
        // The point of the whole design.
        assert.equal(after.meta.reviewed, before.reviewed, "unit stays reviewed");
        assert.equal(after.meta.done, before.done, "unit stays done");
        // Provenance survives approval: which batch a card arrived in stays answerable.
        assert.equal(after.items.find((i) => i.id === "new-pending").addition, "notes-2026-08");
      },
      { ...fontDeps, getDefaultVoice: () => "v1" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("approving a card that is not an addition is refused, not silently written", async () => {
  const { root, book } = fixture();
  try {
    await withServer(root, async (url) => {
      const res = await asJson(
        await fetch(`${url}/api/deck/book/mybook/unit/0/card/old/addition/approve`, {
          method: "POST",
        }),
      );
      assert.equal(res.status, 409);
      assert.match(res.body.error, /carries no `addition` batch/);
      assert.ok(
        !("additionReviewed" in readCards(book).items.find((i) => i.id === "old")),
        "nothing was written to the ordinary card",
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a batch filter narrows the page, and an unknown batch or deck is a 404", async () => {
  const { root } = fixture();
  try {
    await withServer(root, async (url) => {
      const hit = await fetch(`${url}/additions/book/mybook/notes-2026-08`);
      assert.equal(hit.status, 200);
      assert.match(await hit.text(), /gym/);

      assert.equal((await fetch(`${url}/additions/book/mybook/no-such-batch`)).status, 404);
      assert.equal((await fetch(`${url}/additions/book/nosuchdeck`)).status, 404);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the home page surfaces the pending batch, so it is findable without knowing the URL", async () => {
  const { root } = fixture();
  try {
    await withServer(root, async (url) => {
      const html = await (await fetch(`${url}/`)).text();
      assert.match(html, /Additions waiting/);
      assert.match(html, /1 pending/);
      assert.match(html, /notes-2026-08/);
      assert.match(html, /\/additions\/book\/mybook/);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a deck with no additions shows no additions section and 404s the page", async () => {
  const root = mkdtempSync(join(tmpdir(), "additions-none-"));
  const book = join(root, "epubs", "plain");
  try {
    mkdirSync(join(book, "chapter-0"), { recursive: true });
    writeFileSync(
      join(book, "book.json"),
      JSON.stringify({ title: "Plain", targetLanguage: "ja" }),
    );
    writeFileSync(
      join(book, "chapter-0", "cards.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", sourceType: "epub", chapterNumber: 1, reviewed: true },
        items: [
          { id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" },
        ],
      }),
    );
    await withServer(root, async (url) => {
      const html = await (await fetch(`${url}/`)).text();
      assert.ok(!/Additions waiting/.test(html), "no empty section on a deck with no retrofits");
      assert.equal((await fetch(`${url}/additions/book/plain`)).status, 404);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a read-only server refuses to approve", async () => {
  const { root, book } = fixture();
  try {
    await withServer(
      root,
      async (url) => {
        const res = await fetch(
          `${url}/api/deck/book/mybook/unit/0/card/new-pending/addition/approve`,
          { method: "POST" },
        );
        assert.equal(res.status, 403);
        assert.ok(
          !readCards(book).items.find((i) => i.id === "new-pending").additionReviewed,
          "still pending",
        );
      },
      { ...fontDeps, editable: false },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

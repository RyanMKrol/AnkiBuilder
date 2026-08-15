import test from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import os from "os";
import { Buffer } from "buffer";
import { inflateRawSync } from "zlib";
import { DatabaseSync } from "node:sqlite";
import {
  buildDeck as buildDeckImpl,
  buildBookDeck as buildBookDeckImpl,
} from "../../src/deck/index.js";

// These tests exercise audio/zip/collection mechanics; the per-language font (embedded for `ja` by
// default) would add a media entry and shift every count. Default it off here — dedicated tests for
// the font live in fontLibrary/restyleFont/collection tests.
const NO_FONT = { getFont: () => undefined };
function buildDeck(cards, opts = {}) {
  return buildDeckImpl(cards, { ...NO_FONT, ...opts });
}
function buildBookDeck(chapterDecks, opts = {}) {
  return buildBookDeckImpl(chapterDecks, { ...NO_FONT, ...opts });
}

function baseCards(items) {
  return {
    meta: { targetLanguage: "ja", sourceType: "manual" },
    items,
  };
}

async function withTempDir(fn) {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "deck-test-"));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function readZipEntryNames(zipBuffer) {
  // Minimal EOCD/central-directory scan sufficient for asserting entries exist.
  const EOCD_SIGNATURE = 0x06054b50;
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, "zip must contain an end-of-central-directory record");

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  const names = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    assert.strictEqual(zipBuffer.readUInt32LE(offset), 0x02014b50);
    const nameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const name = zipBuffer.toString("utf-8", offset + 46, offset + 46 + nameLength);
    names.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

// Extracts one named entry's decompressed bytes from a zip, via its local file
// header — used to inspect the "media" manifest and (for the multi-chapter merge
// tests) collection.anki2 without relying on entry ORDER, unlike the single-chapter
// test above which reads the always-first local header directly.
function extractZipEntry(zipBuffer, entryName) {
  const EOCD_SIGNATURE = 0x06054b50;
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0);

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const nameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const name = zipBuffer.toString("utf-8", offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      const localNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);
      return inflateRawSync(compressed);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`zip entry not found: ${entryName}`);
}

test("buildDeck writes a valid .apkg zip with collection.anki2 and media entries", async () => {
  await withTempDir(async (tmpDir) => {
    const audioDir = join(tmpDir, "audio");
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(join(audioDir, "hello.mp3"), Buffer.from("fake mp3 bytes"));

    const cards = baseCards([
      {
        id: "c1",
        english: "Hello",
        category: "Greetings",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        hint: "informal too",
        audio: "hello.mp3",
      },
      {
        id: "c2",
        english: "Goodbye",
        category: "Greetings",
        target: "さようなら",
        pronunciation: "sayounara",
        // no audio field — must still produce valid cards
      },
    ]);

    const outPath = join(tmpDir, "out", "deck.apkg");
    const result = buildDeck(cards, { outPath, audioDir, now: 1700000000000 });

    assert.strictEqual(result.noteCount, 2);
    assert.strictEqual(result.mediaCount, 1);

    const zipBuffer = await fs.readFile(outPath);
    const names = readZipEntryNames(zipBuffer);
    assert.ok(names.includes("collection.anki2"));
    assert.ok(names.includes("media"));
    assert.ok(names.includes("0"), "attached audio should be present as media entry 0");
    assert.strictEqual(names.length, 3);
  });
});

test("buildDeck produces a collection.anki2 with expected notes, cards, templates, and round-tripped fields", async () => {
  await withTempDir(async (tmpDir) => {
    const cards = baseCards([
      {
        id: "c1",
        english: "Hello",
        category: "Greetings",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        hint: "informal too",
        scene: "greeting a colleague in the morning",
      },
      {
        id: "c2",
        english: "Goodbye",
        category: "Greetings",
        target: "さようなら",
        pronunciation: "sayounara",
      },
      {
        id: "c3",
        english: "Thanks",
        category: "Greetings",
        target: "ありがとう",
        pronunciation: "arigatou",
      },
    ]);

    const outPath = join(tmpDir, "deck.apkg");
    buildDeck(cards, { outPath, now: 1700000000000 });

    // Extract collection.anki2 from the zip manually (no unzip dependency in scope).
    const zipBuffer = await fs.readFile(outPath);
    const { inflateRawSync } = await import("zlib");

    const LOCAL_SIGNATURE = 0x04034b50;
    assert.strictEqual(zipBuffer.readUInt32LE(0), LOCAL_SIGNATURE);
    const nameLength = zipBuffer.readUInt16LE(26);
    const extraLength = zipBuffer.readUInt16LE(28);
    const compressedSize = zipBuffer.readUInt32LE(18);
    const name = zipBuffer.toString("utf-8", 30, 30 + nameLength);
    assert.strictEqual(name, "collection.anki2");
    const dataStart = 30 + nameLength + extraLength;
    const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);
    const collectionBytes = inflateRawSync(compressed);

    const dbPath = join(tmpDir, "extracted-collection.anki2");
    await fs.writeFile(dbPath, collectionBytes);

    const db = new DatabaseSync(dbPath);
    try {
      const noteRows = db.prepare("SELECT * FROM notes ORDER BY id").all();
      assert.strictEqual(noteRows.length, 3);

      const cardRows = db.prepare("SELECT * FROM cards ORDER BY id").all();
      assert.strictEqual(cardRows.length, 6, "two cards per note");

      const colRow = db.prepare("SELECT models FROM col").get();
      const models = JSON.parse(colRow.models);
      const model = Object.values(models)[0];
      const templateNames = model.tmpls.map((t) => t.name);
      assert.deepStrictEqual(templateNames, ["Recognition", "Production"]);
      // The category chip is on the PRODUCTION front only. On a Recognition front it is an
      // uncontrolled answer cue ("Shopping" over a bare デパート) — stronger than any scene the
      // collision doctrine would permit, on a front that 86% of the time has no scene at all.
      const chip = /\{\{#Category\}\}<div class="cat-chip">\{\{Category\}\}<\/div>/;
      const byName = Object.fromEntries(model.tmpls.map((t) => [t.name, t]));
      assert.doesNotMatch(
        byName.Recognition.qfmt,
        chip,
        "Recognition front must not cue the answer",
      );
      assert.match(byName.Production.qfmt, chip, "Production front keeps the chip");
      // The string to be decoded is wrapped on both fronts, so it can be sized like the answer.
      for (const t of model.tmpls) {
        assert.match(t.qfmt, /<div class="prompt">/, `${t.name} front wraps its prompt`);
      }
      assert.match(model.css, /\.cat-chip/); // …and the chip is styled
      assert.deepStrictEqual(
        model.flds.map((f) => f.name),
        [
          "Target",
          "Pronunciation",
          "English",
          "Category",
          "Hint",
          "Note",
          "Image",
          "Audio",
          "Reading",
          "Scene",
        ],
      );
      // Hint fronts only the Production card — on Recognition (Target→English) an English hint is
      // part of the answer, so there it shows on the back. Scene (the situation cue) fronts BOTH
      // directions. Note is on the back of both.
      // Scene and hint carry DIFFERENT classes: on the Production front they stack, and two
      // identical unlabelled grey lines is exactly where the learner cannot tell them apart.
      for (const t of model.tmpls) {
        assert.match(
          t.qfmt,
          /\{\{#Scene\}\}<div class="scene">\{\{Scene\}\}<\/div>/,
          `${t.name} front shows the scene`,
        );
        if (t.name === "Production") {
          assert.match(
            t.qfmt,
            /\{\{#Hint\}\}<div class="hint">\{\{Hint\}\}<\/div>/,
            `${t.name} front`,
          );
        } else {
          assert.doesNotMatch(t.qfmt, /\{\{Hint\}\}/, `${t.name} front must not leak the hint`);
          assert.match(t.afmt, /\{\{#Hint\}\}/, `${t.name} back shows the hint as context`);
        }
        assert.match(t.afmt, /\{\{#Note\}\}.*\{\{Note\}\}/s, `${t.name} back shows Note`);
      }

      const firstNote = noteRows[0];
      const fields = firstNote.flds.split("\x1f");
      assert.strictEqual(fields[0], "こんにちは");
      assert.strictEqual(fields[1], "konnichiwa");
      assert.strictEqual(fields[2], "Hello");
      assert.strictEqual(fields[3], "Greetings");
      assert.strictEqual(fields[4], "informal too"); // Hint field ← card.hint
      assert.strictEqual(fields[5], ""); // Note field ← card.note (none here)
      assert.strictEqual(fields[9], "greeting a colleague in the morning"); // Scene field ← card.scene

      const ords = cardRows
        .filter((c) => c.nid === firstNote.id)
        .map((c) => c.ord)
        .sort();
      assert.deepStrictEqual(ords, [0, 1]);
    } finally {
      db.close();
    }
  });
});

test("a card with no audio still produces valid cards and no dangling media reference", async () => {
  await withTempDir(async (tmpDir) => {
    const cards = baseCards([
      {
        id: "c1",
        english: "Hello",
        category: "Greetings",
        target: "こんにちは",
        pronunciation: "konnichiwa",
        audio: "missing.mp3", // references a file that doesn't exist on disk
      },
    ]);

    const outPath = join(tmpDir, "deck.apkg");
    const result = buildDeck(cards, {
      outPath,
      audioDir: join(tmpDir, "no-such-audio-dir"),
      now: 1700000000000,
    });

    assert.strictEqual(result.noteCount, 1);
    assert.strictEqual(result.mediaCount, 0);

    const zipBuffer = await fs.readFile(outPath);
    const names = readZipEntryNames(zipBuffer);
    assert.ok(!names.includes("0"), "no media entry should be produced for a missing audio file");
  });
});

test("buildBookDeck merges 2 chapters' cards + audio into one .apkg", async () => {
  await withTempDir(async (tmpDir) => {
    const chapter0AudioDir = join(tmpDir, "chapter-0", "audio");
    const chapter1AudioDir = join(tmpDir, "chapter-1", "audio");
    await fs.mkdir(chapter0AudioDir, { recursive: true });
    await fs.mkdir(chapter1AudioDir, { recursive: true });
    await fs.writeFile(join(chapter0AudioDir, "hello.mp3"), Buffer.from("chapter 0 hello"));
    await fs.writeFile(join(chapter1AudioDir, "pen.mp3"), Buffer.from("chapter 1 pen"));

    const chapterDecks = [
      {
        name: "Lesson 1: Meeting",
        cards: baseCards([
          {
            id: "c1",
            english: "Hello",
            category: "Greetings",
            target: "こんにちは",
            pronunciation: "konnichiwa",
            audio: "hello.mp3",
          },
        ]),
        audioDir: chapter0AudioDir,
      },
      {
        name: "Lesson 2: Possession",
        cards: baseCards([
          {
            id: "c2",
            english: "Pen",
            category: "Objects",
            target: "ペン",
            pronunciation: "pen",
            audio: "pen.mp3",
          },
        ]),
        audioDir: chapter1AudioDir,
      },
    ];

    const outPath = join(tmpDir, "output", "deck.apkg");
    const result = buildBookDeck(chapterDecks, {
      outPath,
      bookName: "Japanese for Busy People",
      now: 1700000000000,
    });

    assert.strictEqual(result.noteCount, 2);
    assert.strictEqual(result.chapterCount, 2);
    assert.strictEqual(result.mediaCount, 2);

    const zipBuffer = await fs.readFile(outPath);
    const names = readZipEntryNames(zipBuffer);
    assert.ok(names.includes("collection.anki2"));
    assert.ok(names.includes("media"));

    const media = JSON.parse(extractZipEntry(zipBuffer, "media").toString("utf-8"));
    // Media manifest keys MUST be plain sequential integers — Anki's own .apkg format
    // constraint, not a style choice (a chapter-prefixed scheme like "0-0"/"1-0" is
    // rejected outright by Anki's importer).
    assert.deepStrictEqual(media, { 0: "hello.mp3", 1: "pen.mp3" });
  });
});

test("buildBookDeck keeps identical audio filenames across two different chapters from colliding in the merged media map", async () => {
  await withTempDir(async (tmpDir) => {
    const chapter0AudioDir = join(tmpDir, "chapter-0", "audio");
    const chapter1AudioDir = join(tmpDir, "chapter-1", "audio");
    await fs.mkdir(chapter0AudioDir, { recursive: true });
    await fs.mkdir(chapter1AudioDir, { recursive: true });
    await fs.writeFile(join(chapter0AudioDir, "word.mp3"), Buffer.from("chapter 0 word"));
    await fs.writeFile(join(chapter1AudioDir, "word.mp3"), Buffer.from("chapter 1 word"));

    const chapterDecks = [
      {
        name: "Lesson 1",
        cards: baseCards([
          { id: "c1", english: "One", category: "Other", target: "一", audio: "word.mp3" },
        ]),
        audioDir: chapter0AudioDir,
      },
      {
        name: "Lesson 2",
        cards: baseCards([
          { id: "c2", english: "Two", category: "Other", target: "二", audio: "word.mp3" },
        ]),
        audioDir: chapter1AudioDir,
      },
    ];

    const outPath = join(tmpDir, "deck.apkg");
    buildBookDeck(chapterDecks, { outPath, bookName: "Book", now: 1700000000000 });

    const zipBuffer = await fs.readFile(outPath);
    const media = JSON.parse(extractZipEntry(zipBuffer, "media").toString("utf-8"));
    // Same real filename in two different chapters must still get two distinct,
    // plain-sequential-integer keys — never chapter-prefixed (see the note on the
    // previous test).
    assert.deepStrictEqual(media, { 0: "word.mp3", 1: "word.mp3" });

    const names = readZipEntryNames(zipBuffer);
    assert.ok(names.includes("0"));
    assert.ok(names.includes("1"));

    const chapter0Bytes = extractZipEntry(zipBuffer, "0");
    const chapter1Bytes = extractZipEntry(zipBuffer, "1");
    assert.strictEqual(chapter0Bytes.toString("utf-8"), "chapter 0 word");
    assert.strictEqual(chapter1Bytes.toString("utf-8"), "chapter 1 word");
  });
});

test("buildBookDeck's noteCount is the sum across chapters", async () => {
  await withTempDir(async (tmpDir) => {
    const chapterDecks = [
      {
        name: "Lesson 1",
        cards: baseCards([
          { id: "a", english: "A", category: "Other", target: "a" },
          { id: "b", english: "B", category: "Other", target: "b" },
        ]),
        audioDir: null,
      },
      {
        name: "Lesson 2",
        cards: baseCards([{ id: "c", english: "C", category: "Other", target: "c" }]),
        audioDir: null,
      },
      {
        name: "Lesson 3",
        cards: baseCards([
          { id: "d", english: "D", category: "Other", target: "d" },
          { id: "e", english: "E", category: "Other", target: "e" },
          { id: "f", english: "F", category: "Other", target: "f" },
        ]),
        audioDir: null,
      },
    ];

    const outPath = join(tmpDir, "deck.apkg");
    const result = buildBookDeck(chapterDecks, { outPath, bookName: "Book", now: 1700000000000 });

    assert.strictEqual(result.noteCount, 6);
    assert.strictEqual(result.chapterCount, 3);
  });
});

test("buildBookDeck's media manifest keys are always plain sequential integers, never chapter-prefixed", async () => {
  await withTempDir(async (tmpDir) => {
    const audioDirs = [0, 1, 2].map((i) => join(tmpDir, `chapter-${i}`, "audio"));
    for (const dir of audioDirs) {
      await fs.mkdir(dir, { recursive: true });
    }
    // Give each chapter more than one audio file, so a chapter-prefixed scheme
    // ("0-0", "0-1", "1-0", ...) and a globally-sequential one ("0", "1", "2", ...)
    // would actually produce visibly different keys, not just coincidentally equal
    // single-item ones.
    await fs.writeFile(join(audioDirs[0], "a1.mp3"), Buffer.from("a1"));
    await fs.writeFile(join(audioDirs[0], "a2.mp3"), Buffer.from("a2"));
    await fs.writeFile(join(audioDirs[1], "b1.mp3"), Buffer.from("b1"));
    await fs.writeFile(join(audioDirs[2], "c1.mp3"), Buffer.from("c1"));
    await fs.writeFile(join(audioDirs[2], "c2.mp3"), Buffer.from("c2"));

    const chapterDecks = [
      {
        name: "Lesson 1",
        cards: baseCards([
          { id: "a1", english: "A1", category: "Other", target: "a1", audio: "a1.mp3" },
          { id: "a2", english: "A2", category: "Other", target: "a2", audio: "a2.mp3" },
        ]),
        audioDir: audioDirs[0],
      },
      {
        name: "Lesson 2",
        cards: baseCards([
          { id: "b1", english: "B1", category: "Other", target: "b1", audio: "b1.mp3" },
        ]),
        audioDir: audioDirs[1],
      },
      {
        name: "Lesson 3",
        cards: baseCards([
          { id: "c1", english: "C1", category: "Other", target: "c1", audio: "c1.mp3" },
          { id: "c2", english: "C2", category: "Other", target: "c2", audio: "c2.mp3" },
        ]),
        audioDir: audioDirs[2],
      },
    ];

    const outPath = join(tmpDir, "deck.apkg");
    buildBookDeck(chapterDecks, { outPath, bookName: "Book", now: 1700000000000 });

    const zipBuffer = await fs.readFile(outPath);
    const media = JSON.parse(extractZipEntry(zipBuffer, "media").toString("utf-8"));

    const keys = Object.keys(media);
    assert.equal(keys.length, 5);
    for (const key of keys) {
      assert.match(key, /^\d+$/, `media key "${key}" must be a plain non-negative integer string`);
    }
    // Globally sequential across chapters, in chapter order — not reset per chapter.
    assert.deepStrictEqual(
      keys.map(Number).sort((a, b) => a - b),
      [0, 1, 2, 3, 4],
    );
  });
});

test("buildDeck drops cards marked excluded (translate-review exclusion)", async () => {
  await withTempDir(async (tmpDir) => {
    const outPath = join(tmpDir, "deck.apkg");
    const cards = baseCards([
      { id: "a", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" },
      {
        id: "b",
        english: "two",
        target: "に",
        pronunciation: "ni",
        category: "Numbers",
        excluded: true,
      },
    ]);
    const result = buildDeck(cards, { outPath, now: 1700000000000 });
    assert.strictEqual(result.noteCount, 1);
  });
});

test("buildDeck HTML-escapes text fields so & and < render literally in Anki", async () => {
  await withTempDir(async (tmpDir) => {
    const outPath = join(tmpDir, "deck.apkg");
    const cards = baseCards([
      {
        id: "amp",
        english: "Bread & butter <daily>",
        target: "パン&バター",
        pronunciation: "pan & bataa",
        category: "Food",
        note: "a < b",
      },
    ]);
    buildDeck(cards, { outPath });

    const dbBytes = extractZipEntry(await fs.readFile(outPath), "collection.anki2");
    const dbPath = join(tmpDir, "escaped.anki2");
    await fs.writeFile(dbPath, dbBytes);
    const db = new DatabaseSync(dbPath);
    try {
      const { flds } = db.prepare("SELECT flds FROM notes").get();
      assert.match(flds, /Bread &amp; butter &lt;daily&gt;/);
      assert.match(flds, /パン&amp;バター/);
      assert.match(flds, /a &lt; b/);
      assert.doesNotMatch(flds, /<daily>/);
    } finally {
      db.close();
    }
  });
});

test("buildDeck refuses duplicate card ids (guids collapse to one note at import)", async () => {
  await withTempDir(async (tmpDir) => {
    const outPath = join(tmpDir, "deck.apkg");
    const cards = baseCards([
      { id: "dup", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" },
      { id: "dup", english: "won", target: "かち", pronunciation: "kachi", category: "Other" },
    ]);
    assert.throws(() => buildDeck(cards, { outPath }), /duplicate card ids/);
  });
});

test("buildDeck allows a duplicate id when one copy is excluded (it never ships)", async () => {
  await withTempDir(async (tmpDir) => {
    const outPath = join(tmpDir, "deck.apkg");
    const cards = baseCards([
      { id: "dup", english: "one", target: "いち", pronunciation: "ichi", category: "Numbers" },
      {
        id: "dup",
        english: "one (old)",
        target: "いち",
        pronunciation: "ichi",
        category: "Numbers",
        excluded: true,
      },
    ]);
    const result = buildDeck(cards, { outPath });
    assert.strictEqual(result.noteCount, 1);
  });
});

test("buildDeck namespaces note guids too — a template deck is a collection like any other", async () => {
  await withTempDir(async (tmpDir) => {
    const cards = baseCards([
      { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
    ]);
    const outPath = join(tmpDir, "template.apkg");
    buildDeck(cards, { outPath, deckName: "Numbers", guidNamespace: "numbers-ja" });

    const dbBytes = extractZipEntry(await fs.readFile(outPath), "collection.anki2");
    const dbPath = join(tmpDir, "template.anki2");
    await fs.writeFile(dbPath, dbBytes);
    const db = new DatabaseSync(dbPath);
    try {
      const guids = db
        .prepare("SELECT guid FROM notes")
        .all()
        .map((r) => r.guid);
      assert.deepEqual(guids, ["numbers-ja/hello"]);
    } finally {
      db.close();
    }
  });
});

test("buildBookDeck namespaces note guids when asked; bare card ids otherwise", async () => {
  await withTempDir(async (tmpDir) => {
    const chapterDecks = [
      {
        name: "Lesson 1",
        cards: baseCards([
          { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
        ]),
        audioDir: null,
      },
    ];
    let guidRead = 0;
    const readGuids = async (apkgPath) => {
      const bytes = await fs.readFile(apkgPath);
      const dbBytes = extractZipEntry(bytes, "collection.anki2");
      const dbPath = join(tmpDir, `guids-${guidRead++}.anki2`);
      await fs.writeFile(dbPath, dbBytes);
      const db = new DatabaseSync(dbPath);
      try {
        return db
          .prepare("SELECT guid FROM notes")
          .all()
          .map((r) => r.guid);
      } finally {
        db.close();
      }
    };

    const bare = join(tmpDir, "bare.apkg");
    buildBookDeck(chapterDecks, { outPath: bare, bookName: "My Book" });
    assert.deepEqual(await readGuids(bare), ["hello"]);

    const spaced = join(tmpDir, "spaced.apkg");
    buildBookDeck(chapterDecks, {
      outPath: spaced,
      bookName: "My Book",
      guidNamespace: "my-book",
    });
    // Anki matches guids collection-wide: the namespace keeps a second book's "hello"
    // from overwriting this one's note at import.
    assert.deepEqual(await readGuids(spaced), ["my-book/hello"]);
  });
});

test("buildBookDeck refuses card ids that repeat across chapters, naming both", async () => {
  await withTempDir(async (tmpDir) => {
    const outPath = join(tmpDir, "book.apkg");
    const chapterDecks = [
      {
        name: "Lesson 1",
        cards: baseCards([
          { id: "hello", english: "Hello", target: "こんにちは", category: "Greetings" },
        ]),
        audioDir: null,
      },
      {
        name: "Lesson 2",
        cards: baseCards([
          { id: "hello", english: "Hello again", target: "こんにちは", category: "Greetings" },
        ]),
        audioDir: null,
      },
    ];
    assert.throws(
      () => buildBookDeck(chapterDecks, { outPath, bookName: "My Book" }),
      (e) => {
        assert.match(e.message, /duplicate card ids/);
        assert.match(e.message, /hello \(Lesson 1, Lesson 2\)/);
        return true;
      },
    );
  });
});

test("buildDeck embeds only the default audio, never altAudio", async () => {
  await withTempDir(async (tmpDir) => {
    const audioDir = join(tmpDir, "audio");
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(join(audioDir, "default.mp3"), Buffer.from("default clip"));
    await fs.writeFile(join(audioDir, "alt.mp3"), Buffer.from("alt clip"));

    const cards = baseCards([
      {
        id: "c1",
        english: "eight",
        category: "Time",
        target: "はちじ",
        pronunciation: "hachiji",
        audio: "default.mp3",
        altAudio: "alt.mp3", // present on the card but must NOT be embedded
      },
    ]);

    const outPath = join(tmpDir, "deck.apkg");
    const result = buildDeck(cards, { outPath, audioDir, now: 1700000000000 });

    assert.strictEqual(result.mediaCount, 1, "exactly one media file embedded (the default)");

    const zipBuffer = await fs.readFile(outPath);
    const media = JSON.parse(extractZipEntry(zipBuffer, "media").toString("utf-8"));
    assert.deepStrictEqual(media, { 0: "default.mp3" }, "only the default clip is in the manifest");
    assert.ok(
      !Object.values(media).includes("alt.mp3"),
      "the alt clip is never embedded in the deck",
    );
  });
});

test("buildDeck embeds the per-language font file into the deck media (ja)", async () => {
  await withTempDir(async (tmpDir) => {
    const outPath = join(tmpDir, "deck.apkg");
    buildDeckImpl(
      {
        meta: { targetLanguage: "ja", sourceType: "manual" },
        items: [
          { id: "a", english: "one", category: "Numbers", target: "いち", pronunciation: "ichi" },
        ],
      },
      { outPath, now: 1700000000000, readFont: () => Buffer.from("FONTBYTES") },
    );
    const zip = await fs.readFile(outPath);
    const media = JSON.parse(extractZipEntry(zip, "media").toString("utf-8"));
    const fontKey = Object.entries(media).find(([, n]) => n === "_KleeOne-Regular.woff2")?.[0];
    assert.ok(fontKey, "font file registered in media");
    assert.strictEqual(
      extractZipEntry(zip, fontKey).toString(),
      "FONTBYTES",
      "font bytes embedded",
    );
  });
});

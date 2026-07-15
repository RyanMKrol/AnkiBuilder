import test from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import os from "os";
import { Buffer } from "buffer";
import { inflateRawSync } from "zlib";
import { DatabaseSync } from "node:sqlite";
import { buildDeck, buildBookDeck } from "../../src/deck/index.js";

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
      assert.deepStrictEqual(
        model.flds.map((f) => f.name),
        ["Target", "Pronunciation", "English", "Category", "Hint", "Image", "Audio"],
      );

      const firstNote = noteRows[0];
      const fields = firstNote.flds.split("\x1f");
      assert.strictEqual(fields[0], "こんにちは");
      assert.strictEqual(fields[1], "konnichiwa");
      assert.strictEqual(fields[2], "Hello");
      assert.strictEqual(fields[3], "Greetings");
      assert.strictEqual(fields[4], "informal too");

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

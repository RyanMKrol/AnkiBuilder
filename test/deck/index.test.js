import test from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import os from "os";
import { Buffer } from "buffer";
import { DatabaseSync } from "node:sqlite";
import { buildDeck } from "../../src/deck/index.js";

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

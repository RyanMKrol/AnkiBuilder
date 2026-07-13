import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";
import { extractEpub } from "../../src/corpus/epub.js";

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, content } of files) {
    const nameBuffer = Buffer.from(name, "utf-8");
    const contentBuffer = Buffer.from(content, "utf-8");
    const compressed = deflateRawSync(contentBuffer);
    const crc = crc32(contentBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function createFixtureEpub() {
  const dir = mkdtempSync(join(tmpdir(), "epub-fixture-"));
  const epubPath = join(dir, "sample.epub");

  const page1 = `<html><body>
    <p>Hello — Hola</p>
    <p>Goodbye - Adios</p>
  </body></html>`;

  const page2 = `<html><body>
    <p>Thank you: Gracias</p>
    <li>Excuse me</li>
  </body></html>`;

  const zipBuffer = buildZip([
    { name: "OEBPS/page1.xhtml", content: page1 },
    { name: "OEBPS/page2.xhtml", content: page2 },
  ]);

  writeFileSync(epubPath, zipBuffer);
  return { dir, epubPath };
}

test("extractEpub() extracts candidate terms with translations from EPUB pages", () => {
  const { dir, epubPath } = createFixtureEpub();
  try {
    const corpus = extractEpub(epubPath, { targetLanguage: "Spanish" });

    assert.strictEqual(corpus.meta.targetLanguage, "Spanish");
    assert.strictEqual(corpus.meta.sourceType, "epub");
    assert(Array.isArray(corpus.items));
    assert.strictEqual(corpus.items.length, 4);

    const hello = corpus.items.find((item) => item.english === "Hello");
    assert(hello, "expected a Hello item");
    assert.strictEqual(hello.notes, "Hola");
    assert.strictEqual(hello.category, "General");

    const goodbye = corpus.items.find((item) => item.english === "Goodbye");
    assert(goodbye);
    assert.strictEqual(goodbye.notes, "Adios");

    const thankYou = corpus.items.find((item) => item.english === "Thank you");
    assert(thankYou);
    assert.strictEqual(thankYou.notes, "Gracias");

    const excuseMe = corpus.items.find((item) => item.english === "Excuse me");
    assert(excuseMe, "expected a standalone candidate with no translation");
    assert.strictEqual(excuseMe.notes, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("extractEpub() result validates against the corpus schema", async () => {
  const { validateCorpus } = await import("../../src/model/index.js");
  const { dir, epubPath } = createFixtureEpub();
  try {
    const corpus = extractEpub(epubPath, { targetLanguage: "French" });
    assert.strictEqual(validateCorpus(corpus), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("extractEpub() requires a targetLanguage", () => {
  const { epubPath, dir } = createFixtureEpub();
  try {
    assert.throws(() => {
      extractEpub(epubPath, {});
    }, /targetLanguage is required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

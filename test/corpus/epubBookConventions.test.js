import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";
import {
  renderBookConventionsPrompt,
  analyzeBookConventions,
} from "../../src/corpus/epubBookConventions.js";
import { hashEpubFile, chapterCachePath } from "../../src/corpus/epubLibrary.js";

// --- Synthetic .epub fixture builder (mirrors test/corpus/epubArchive.test.js) ---

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

function containerXml(opfPath) {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function opfXml(manifestItems, spineIdrefs) {
  const manifest = manifestItems
    .map((i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spine = spineIdrefs.map((id) => `<itemref idref="${id}"/>`).join("\n    ");
  return `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`;
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-conventions-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildFixtureEpub(dir, chapterCount) {
  const manifestItems = [];
  const spineIdrefs = [];
  const extraFiles = [];

  for (let i = 1; i <= chapterCount; i++) {
    const id = `ch${i}`;
    const href = `text/ch${i}.xhtml`;
    manifestItems.push({ id, href });
    spineIdrefs.push(id);
    extraFiles.push({ name: `OEBPS/${href}`, content: `<html><body>Chapter ${i}</body></html>` });
  }

  const epubPath = join(dir, "book.epub");
  const zipBuffer = buildZip([
    { name: "META-INF/container.xml", content: containerXml("OEBPS/content.opf") },
    { name: "OEBPS/content.opf", content: opfXml(manifestItems, spineIdrefs) },
    ...extraFiles,
  ]);
  writeFileSync(epubPath, zipBuffer);
  return epubPath;
}

// --- renderBookConventionsPrompt ---

test("renderBookConventionsPrompt() substitutes every placeholder", () => {
  const rendered = renderBookConventionsPrompt({
    targetLanguage: "Japanese",
    chapterFilePaths: ["/tmp/ch1.xhtml", "/tmp/ch2.xhtml", "/tmp/ch3.xhtml"],
  });

  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
  assert.match(rendered, /Japanese/);
  assert.match(rendered, /3 chapter files/);
  assert.match(rendered, /\/tmp\/ch1\.xhtml/);
  assert.match(rendered, /\/tmp\/ch2\.xhtml/);
  assert.match(rendered, /\/tmp\/ch3\.xhtml/);
});

test("renderBookConventionsPrompt() requires targetLanguage", () => {
  assert.throws(() => {
    renderBookConventionsPrompt({ chapterFilePaths: ["/tmp/ch1.xhtml"] });
  }, /targetLanguage is required/);
});

test("renderBookConventionsPrompt() requires a non-empty chapterFilePaths", () => {
  assert.throws(() => {
    renderBookConventionsPrompt({ targetLanguage: "Japanese", chapterFilePaths: [] });
  }, /chapterFilePaths is required/);
});

// --- analyzeBookConventions ---

test("analyzeBookConventions() asks the model to read every chapter, not a subset", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 5);
    let capturedPrompt = null;

    analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: (prompt) => {
        capturedPrompt = prompt;
        return "# Japanese Book Conventions\n\n## Placeholder Notation\nNone found.\n";
      },
    });

    for (let i = 1; i <= 5; i++) {
      assert.match(capturedPrompt, new RegExp(`${i}\\.xhtml`));
    }
    assert.match(capturedPrompt, /5 chapter files/);
  });
});

test("analyzeBookConventions() returns the model's raw markdown unchanged", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const markdown = "# Japanese Book Conventions\n\n## Placeholder Notation\nUses 〜.\n";

    const result = analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => markdown,
    });

    assert.equal(result, markdown);
  });
});

test("analyzeBookConventions() materializes every chapter to the shared extraction cache", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 3);

    analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => "# conventions",
    });

    const epubHash = hashEpubFile(epubPath);
    for (let i = 1; i <= 3; i++) {
      const cachePath = chapterCachePath(epubHash, i, { libraryHomeDir: dir });
      assert.ok(existsSync(cachePath), `expected chapter ${i} to be cached at ${cachePath}`);
    }
  });
});

import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";
import { listChapters, readChapter, extractChapterToFile } from "../../src/corpus/epubArchive.js";

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

// manifestItems: [{ id, href }]; spineIdrefs: [id, ...] in reading order — deliberately
// NOT required to match manifestItems' order, so tests can prove spine order wins.
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
  const dir = mkdtempSync(join(tmpdir(), "epub-archive-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildFixtureEpub(
  dir,
  { opfPath = "OEBPS/content.opf", manifestItems, spineIdrefs, extraFiles = [] },
) {
  const epubPath = join(dir, "book.epub");
  const zipBuffer = buildZip([
    { name: "META-INF/container.xml", content: containerXml(opfPath) },
    { name: opfPath, content: opfXml(manifestItems, spineIdrefs) },
    ...extraFiles,
  ]);
  writeFileSync(epubPath, zipBuffer);
  return epubPath;
}

test("listChapters() returns chapters in spine order, not manifest declaration order", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch2", href: "text/ch02.xhtml" },
        { id: "ch1", href: "text/ch01.xhtml" },
      ],
      spineIdrefs: ["ch1", "ch2"],
      extraFiles: [
        { name: "text/ch01.xhtml", content: "<html><body>Chapter One</body></html>" },
        { name: "text/ch02.xhtml", content: "<html><body>Chapter Two</body></html>" },
      ],
    });

    const { chapters } = listChapters(epubPath);

    assert.deepEqual(
      chapters.map((c) => ({ number: c.number, href: c.href })),
      [
        { number: 1, href: "OEBPS/text/ch01.xhtml" },
        { number: 2, href: "OEBPS/text/ch02.xhtml" },
      ],
    );
  });
});

test("listChapters() resolves manifest hrefs relative to the OPF's own directory", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      opfPath: "EPUB/package.opf",
      manifestItems: [{ id: "ch1", href: "chapters/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "EPUB/chapters/ch01.xhtml", content: "<html><body>One</body></html>" }],
    });

    const { chapters, opfDir } = listChapters(epubPath);

    assert.equal(opfDir, "EPUB");
    assert.equal(chapters[0].href, "EPUB/chapters/ch01.xhtml");
  });
});

test("readChapter() returns the raw content at the given 1-indexed spine position", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>Hello</body></html>" }],
    });

    const content = readChapter(epubPath, 1);

    assert.equal(content, "<html><body>Hello</body></html>");
  });
});

test("readChapter() throws a descriptive error for an out-of-range chapter number", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "text/ch01.xhtml", content: "<html></html>" }],
    });

    assert.throws(() => readChapter(epubPath, 5), /Chapter 5 not found — book has 1 chapter\(s\)/);
  });
});

test("extractChapterToFile() writes real bytes to disk and creates parent directories", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>Content</body></html>" }],
    });

    const destPath = join(dir, "nested", "cache", "1.xhtml");
    const returned = extractChapterToFile(epubPath, 1, destPath);

    assert.equal(returned, destPath);
    assert.ok(existsSync(destPath));
    assert.equal(readFileSync(destPath, "utf-8"), "<html><body>Content</body></html>");
  });
});

test("listChapters() throws on a malformed zip (no end-of-central-directory record)", () => {
  withTempDir((dir) => {
    const epubPath = join(dir, "not-a-zip.epub");
    writeFileSync(epubPath, Buffer.from("this is not a zip file at all"));

    assert.throws(() => listChapters(epubPath), /end of central directory not found/);
  });
});

test("listChapters() throws when META-INF/container.xml is missing", () => {
  withTempDir((dir) => {
    const epubPath = join(dir, "no-container.epub");
    writeFileSync(
      epubPath,
      buildZip([{ name: "OEBPS/content.opf", content: "<package></package>" }]),
    );

    assert.throws(() => listChapters(epubPath), /META-INF\/container\.xml not found/);
  });
});

test("readEntryData throws on an unsupported compression method", () => {
  withTempDir((dir) => {
    // Hand-build a single stored-then-corrupted entry claiming an unsupported method (e.g. 99).
    const epubPath = join(dir, "bad-method.epub");
    const name = Buffer.from("META-INF/container.xml", "utf-8");
    const content = Buffer.from(containerXml("OEBPS/content.opf"), "utf-8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(99, 8); // unsupported method
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(99, 10); // unsupported method
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(0, 42);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(centralHeader.length + name.length, 12);
    eocd.writeUInt32LE(localHeader.length + name.length + content.length, 16);
    eocd.writeUInt16LE(0, 20);

    writeFileSync(epubPath, Buffer.concat([localHeader, name, content, centralHeader, name, eocd]));

    assert.throws(() => listChapters(epubPath), /Unsupported zip compression method: 99/);
  });
});

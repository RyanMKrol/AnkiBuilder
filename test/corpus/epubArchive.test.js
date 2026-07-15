import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Buffer } from "buffer";
import {
  listChapters,
  readChapter,
  extractChapterToFile,
  describeChapter,
  getBookTitle,
} from "../../src/corpus/epubArchive.js";
import { buildFixtureEpub, buildZip, containerXml } from "../support/epubFixtures.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-archive-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("extractChapterToFile() also extracts images the chapter references, at the path its own relative <img src> resolves to from destPath", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content: '<html><body><img src="../images/pic.jpg"/></body></html>',
        },
        { name: "OEBPS/images/pic.jpg", content: "fake-jpeg-bytes" },
      ],
    });

    const destPath = join(dir, "cache", "chapters", "1.xhtml");
    extractChapterToFile(epubPath, 1, destPath);

    const expectedImagePath = join(dir, "cache", "images", "pic.jpg");
    assert.ok(existsSync(expectedImagePath));
    assert.equal(readFileSync(expectedImagePath, "utf-8"), "fake-jpeg-bytes");
  });
});

test("extractChapterToFile() skips image references that don't resolve to a real archive entry", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content:
            "<html><body>" +
            '<img src="../images/missing.jpg"/>' +
            '<img src="https://example.com/remote.jpg"/>' +
            '<img src="data:image/png;base64,abcd"/>' +
            "</body></html>",
        },
      ],
    });

    const destPath = join(dir, "cache", "chapters", "1.xhtml");

    // Should not throw despite none of the referenced images existing/being local.
    extractChapterToFile(epubPath, 1, destPath);

    assert.ok(existsSync(destPath));
    assert.ok(!existsSync(join(dir, "cache", "images", "missing.jpg")));
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

test("describeChapter() shortens a two-colon <title> to its label plus first title segment", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content:
            "<html><head><title>Lesson 1: Meeting: Nice to Meet You, Japanese for Busy People Book 1: Kana</title></head><body></body></html>",
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Lesson 1: Meeting");
  });
});

test("describeChapter() keeps a single-colon <title> intact once the book-title suffix is dropped", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content:
            "<html><head><title>Unit 1: At the Office, Japanese for Busy People Book 1: Kana</title></head><body></body></html>",
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Unit 1: At the Office");
  });
});

test("describeChapter() keeps a no-colon <title> as-is", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content:
            "<html><head><title>Hiragana, Japanese for Busy People Book 1: Kana</title></head><body></body></html>",
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Hiragana");
  });
});

test("describeChapter() decodes HTML entities in the title", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content:
            "<html><head><title>Rock &amp; Roll, Some Book</title></head><body></body></html>",
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Rock & Roll");
  });
});

test("describeChapter() falls back to a plain 'chapter N' phrase when there's no <title> tag", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        { name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>No title here</body></html>" },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "chapter 1");
  });
});

test("describeChapter() falls back to a plain 'chapter N' phrase for an empty <title> tag", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content: "<html><head><title></title></head><body></body></html>",
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "chapter 1");
  });
});

test("getBookTitle() returns the OPF's <dc:title> text", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>One</body></html>" }],
      dcTitles: ["Japanese for Busy People: Book 1"],
    });

    assert.equal(getBookTitle(epubPath), "Japanese for Busy People: Book 1");
  });
});

test("getBookTitle() returns null when there's no <dc:title>", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>One</body></html>" }],
    });

    assert.equal(getBookTitle(epubPath), null);
  });
});

test("getBookTitle() decodes HTML entities in the title", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>One</body></html>" }],
      dcTitles: ["Kana &amp; Kanji"],
    });

    assert.equal(getBookTitle(epubPath), "Kana & Kanji");
  });
});

test("getBookTitle() uses only the first <dc:title> when several are present", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>One</body></html>" }],
      dcTitles: ["Main Title", "Subtitle"],
    });

    assert.equal(getBookTitle(epubPath), "Main Title");
  });
});

test("getBookTitle() returns null for a blank <dc:title>", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>One</body></html>" }],
      dcTitles: ["   "],
    });

    assert.equal(getBookTitle(epubPath), null);
  });
});

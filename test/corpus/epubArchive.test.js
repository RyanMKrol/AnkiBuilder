import test from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Buffer } from "buffer";
import {
  listChapters,
  readChapter,
  extractChapterToFile,
  extractChapterRangeToFile,
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

test("extractChapterToFile() extracts SVG-wrapped images (<image xlink:href> and plain href)", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content:
            "<html><body>" +
            '<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="../images/page.jpg" width="100" height="100"/></svg>' +
            '<svg><image href="../images/chart.png"/></svg>' +
            "</body></html>",
        },
        { name: "OEBPS/images/page.jpg", content: "fake-page-bytes" },
        { name: "OEBPS/images/chart.png", content: "fake-chart-bytes" },
      ],
    });

    const destPath = join(dir, "cache", "chapters", "1.xhtml");
    extractChapterToFile(epubPath, 1, destPath);

    assert.equal(
      readFileSync(join(dir, "cache", "images", "page.jpg"), "utf-8"),
      "fake-page-bytes",
    );
    assert.equal(
      readFileSync(join(dir, "cache", "images", "chart.png"), "utf-8"),
      "fake-chart-bytes",
    );
  });
});

test("extractChapterToFile() logs each image reference it cannot resolve, instead of silence", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch01.xhtml",
          content: '<html><body><img src="../images/missing.jpg"/>text</body></html>',
        },
      ],
    });

    const logged = [];
    const destPath = join(dir, "cache", "chapters", "1.xhtml");
    extractChapterToFile(epubPath, 1, destPath, { log: (msg) => logged.push(msg) });

    assert.equal(logged.length, 1);
    assert.match(logged[0], /missing\.jpg/);
    assert.match(logged[0], /skipped/);
  });
});

test("extractChapterRangeToFile() concatenates an inclusive spine range in reading order, one marker per file", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "text/ch01.xhtml" },
        { id: "ch2", href: "text/ch02.xhtml" },
        { id: "ch3", href: "text/ch03.xhtml" },
      ],
      spineIdrefs: ["ch1", "ch2", "ch3"],
      extraFiles: [
        { name: "OEBPS/text/ch01.xhtml", content: "<html><body>One</body></html>" },
        { name: "OEBPS/text/ch02.xhtml", content: "<html><body>Two</body></html>" },
        { name: "OEBPS/text/ch03.xhtml", content: "<html><body>Three</body></html>" },
      ],
    });

    const destPath = join(dir, "cache", "chapters", "2-3.xhtml");
    const returned = extractChapterRangeToFile(epubPath, 2, 3, destPath);
    const written = readFileSync(destPath, "utf-8");

    assert.equal(returned, destPath);
    // Only files 2 and 3, in order, each preceded by its own marker; file 1 excluded.
    assert.ok(written.includes("spine chapter 2"));
    assert.ok(written.includes("spine chapter 3"));
    assert.ok(!written.includes("spine chapter 1"));
    assert.ok(written.indexOf("Two") < written.indexOf("Three"));
    assert.ok(!written.includes("One"));
  });
});

test("extractChapterRangeToFile() with a one-file range is a single chapter plus a marker", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>Only</body></html>" }],
    });

    const destPath = join(dir, "cache", "chapters", "1-1.xhtml");
    extractChapterRangeToFile(epubPath, 1, 1, destPath);
    const written = readFileSync(destPath, "utf-8");

    assert.ok(written.includes("spine chapter 1"));
    assert.ok(written.includes("Only"));
  });
});

test("extractChapterRangeToFile() extracts images referenced by any file in the range", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch01.xhtml" },
        { id: "ch2", href: "xhtml/ch02.xhtml" },
      ],
      spineIdrefs: ["ch1", "ch2"],
      extraFiles: [
        { name: "OEBPS/xhtml/ch01.xhtml", content: "<html><body>One</body></html>" },
        {
          name: "OEBPS/xhtml/ch02.xhtml",
          content: '<html><body><img src="../images/two.jpg"/></body></html>',
        },
        { name: "OEBPS/images/two.jpg", content: "fake-jpeg-two" },
      ],
    });

    const destPath = join(dir, "cache", "chapters", "1-2.xhtml");
    extractChapterRangeToFile(epubPath, 1, 2, destPath);

    const expectedImagePath = join(dir, "cache", "images", "two.jpg");
    assert.ok(existsSync(expectedImagePath));
    assert.equal(readFileSync(expectedImagePath, "utf-8"), "fake-jpeg-two");
  });
});

test("extractChapterRangeToFile() throws when the range is inverted", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "text/ch01.xhtml" },
        { id: "ch2", href: "text/ch02.xhtml" },
      ],
      spineIdrefs: ["ch1", "ch2"],
      extraFiles: [
        { name: "OEBPS/text/ch01.xhtml", content: "<html><body>One</body></html>" },
        { name: "OEBPS/text/ch02.xhtml", content: "<html><body>Two</body></html>" },
      ],
    });

    assert.throws(() => extractChapterRangeToFile(epubPath, 2, 1, join(dir, "x.xhtml")), /range/i);
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

// --- chapter cache: write-once, and the publish ORDER that makes it safe ----------------
// The cache lives in one shared directory that three concurrent lesson builds all write to
// (the forward-flag pass materializes every later chapter; the book-conventions pass every
// chapter) while `claude -p` reads those same paths. The reader is an external process that
// cannot be made to retry, so a half-published unit is unrecoverable.

test("extractChapterToFile reuses an already-cached chapter instead of re-extracting", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      opfPath: "OEBPS/content.opf",
      manifestItems: [{ id: "c1", href: "c1.xhtml" }],
      spineIdrefs: ["c1"],
      extraFiles: [{ name: "OEBPS/c1.xhtml", content: "<html><body>original</body></html>" }],
    });
    const dest = join(dir, "cache", "1.xhtml");

    extractChapterToFile(epubPath, 1, dest);
    writeFileSync(dest, "SENTINEL — must not be overwritten");
    extractChapterToFile(epubPath, 1, dest);

    assert.equal(
      readFileSync(dest, "utf-8"),
      "SENTINEL — must not be overwritten",
      "a cached chapter must be reused, not re-extracted",
    );
  });
});

test("extractChapterToFile re-extracts a zero-length cache file", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      opfPath: "OEBPS/content.opf",
      manifestItems: [{ id: "c1", href: "c1.xhtml" }],
      spineIdrefs: ["c1"],
      extraFiles: [{ name: "OEBPS/c1.xhtml", content: "<html><body>real content</body></html>" }],
    });
    const dest = join(dir, "cache", "1.xhtml");
    mkdirSync(join(dir, "cache"), { recursive: true });
    writeFileSync(dest, ""); // as an interrupted pre-atomic write could leave it

    extractChapterToFile(epubPath, 1, dest);
    assert.match(readFileSync(dest, "utf-8"), /real content/);
  });
});

// The ordering guarantee the skip depends on: if the chapter file is there, its images are too.
test("extractChapterToFile publishes referenced images before the chapter file", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      opfPath: "OEBPS/content.opf",
      manifestItems: [
        { id: "c1", href: "c1.xhtml" },
        { id: "img1", href: "images/fig.png", mediaType: "image/png" },
      ],
      spineIdrefs: ["c1"],
      extraFiles: [
        {
          name: "OEBPS/c1.xhtml",
          content: '<html><body><img src="images/fig.png"/>text</body></html>',
        },
        { name: "OEBPS/images/fig.png", content: "PNG BYTES" },
      ],
    });
    const dest = join(dir, "cache", "1.xhtml");
    extractChapterToFile(epubPath, 1, dest);

    const imagePath = join(dir, "cache", "images", "fig.png");
    assert.ok(existsSync(dest), "chapter file published");
    assert.ok(existsSync(imagePath), "image published");
    assert.equal(readFileSync(imagePath, "utf-8"), "PNG BYTES");

    // The actual invariant: the chapter file must land LAST, so its existence means the whole
    // unit is complete. Written the other way round, a concurrent process could see the
    // chapter file and hand `claude -p` a path whose images were not on disk yet.
    const imageAt = statSync(imagePath, { bigint: true }).mtimeNs;
    const chapterAt = statSync(dest, { bigint: true }).mtimeNs;
    assert.ok(
      imageAt <= chapterAt,
      `images must be published before the chapter file (image ${imageAt} vs chapter ${chapterAt})`,
    );
  });
});

test("extractChapterToFile leaves no temp files in the cache directory", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      opfPath: "OEBPS/content.opf",
      manifestItems: [{ id: "c1", href: "c1.xhtml" }],
      spineIdrefs: ["c1"],
      extraFiles: [{ name: "OEBPS/c1.xhtml", content: "<html><body>x</body></html>" }],
    });
    const cacheDir = join(dir, "cache");
    extractChapterToFile(epubPath, 1, join(cacheDir, "1.xhtml"));
    assert.deepEqual(
      readdirSync(cacheDir).filter((n) => n.includes(".tmp.")),
      [],
    );
  });
});

test("listChapters() parses an EPUB whose XML uses single-quoted attributes", () => {
  withTempDir((dir) => {
    const container = `<?xml version='1.0'?>
<container version='1.0' xmlns='urn:oasis:names:tc:opendocument:xmlns:container'>
  <rootfiles>
    <rootfile full-path='OEBPS/content.opf' media-type='application/oebps-package+xml'/>
  </rootfiles>
</container>`;
    const opf = `<?xml version='1.0'?>
<package version='3.0' xmlns='http://www.idpf.org/2007/opf'>
  <manifest>
    <item id='ch1' href='text/ch01.xhtml' media-type='application/xhtml+xml'/>
  </manifest>
  <spine>
    <itemref idref='ch1'/>
  </spine>
</package>`;
    const epubPath = join(dir, "single-quoted.epub");
    writeFileSync(
      epubPath,
      buildZip([
        { name: "META-INF/container.xml", content: container },
        { name: "OEBPS/content.opf", content: opf },
        {
          name: "OEBPS/text/ch01.xhtml",
          content: "<html><body><img src='../images/pic.jpg'/>One</body></html>",
        },
        { name: "OEBPS/images/pic.jpg", content: "fake-jpeg" },
      ]),
    );

    const { chapters } = listChapters(epubPath);
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].href, "OEBPS/text/ch01.xhtml");

    // Single-quoted <img src> resolves too.
    const destPath = join(dir, "cache", "chapters", "1.xhtml");
    extractChapterToFile(epubPath, 1, destPath);
    assert.equal(readFileSync(join(dir, "cache", "images", "pic.jpg"), "utf-8"), "fake-jpeg");
  });
});

function findEocdOffset(zipBuffer) {
  for (let i = zipBuffer.length - 22; i >= 0; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("no EOCD in fixture zip");
}

test("listChapters() rejects an encrypted (DRM) entry with a clear error, not an inflate failure", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>One</body></html>" }],
    });

    // Flip general-purpose bit 0 (encrypted) on the first central-directory entry.
    const bytes = readFileSync(epubPath);
    const centralDirOffset = bytes.readUInt32LE(findEocdOffset(bytes) + 16);
    bytes.writeUInt16LE(bytes.readUInt16LE(centralDirOffset + 8) | 0x1, centralDirOffset + 8);
    const patched = join(dir, "encrypted.epub");
    writeFileSync(patched, bytes);

    assert.throws(() => listChapters(patched), /encrypted/);
  });
});

test("listChapters() rejects a ZIP64 archive with a clear error instead of misparsing", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [{ name: "OEBPS/text/ch01.xhtml", content: "<html><body>One</body></html>" }],
    });

    // A ZIP64 EOCD stores 0xFFFF in the 16-bit entry count as a "look elsewhere" sentinel.
    const bytes = readFileSync(epubPath);
    bytes.writeUInt16LE(0xffff, findEocdOffset(bytes) + 10);
    const patched = join(dir, "zip64.epub");
    writeFileSync(patched, bytes);

    assert.throws(() => listChapters(patched), /ZIP64/);
  });
});

test("loadEpub memo: repeated calls reuse the parsed book until the file changes on disk", () => {
  withTempDir((dir) => {
    const build = (bodyText) =>
      buildFixtureEpub(dir, {
        manifestItems: [{ id: "ch1", href: "text/ch01.xhtml" }],
        spineIdrefs: ["ch1"],
        extraFiles: [
          { name: "OEBPS/text/ch01.xhtml", content: `<html><body>${bodyText}</body></html>` },
        ],
        dcTitles: [bodyText],
      });

    const epubPath = build("First");
    const first = listChapters(epubPath);
    const second = listChapters(epubPath);
    // Same underlying parsed book — the archive was not re-read/re-inflated.
    assert.strictEqual(first.chapters, second.chapters);
    assert.equal(getBookTitle(epubPath), "First");

    // Rewrite the file (content + size change): the memo must notice and re-parse.
    build("Second edition");
    assert.equal(getBookTitle(epubPath), "Second edition");
  });
});

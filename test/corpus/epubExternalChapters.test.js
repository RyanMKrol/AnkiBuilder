import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";
import { listExternalChapters, describeChapter } from "../../src/corpus/epubArchive.js";

// --- Synthetic .epub fixture builder (mirrors test/corpus/epubArchive.test.js), extended
// with manifest `properties`/`media-type` and a <spine toc="..."> attribute, both needed
// to locate a nav.xhtml or toc.ncx navigation document. Kept self-contained in this file
// rather than shared, matching this codebase's existing per-test-file fixture-builder
// convention (see epubDedup.test.js / epubForwardFlags.test.js). ---

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

// manifestItems: [{ id, href, properties?, mediaType? }]
function opfXml(manifestItems, spineIdrefs, { spineToc } = {}) {
  const manifest = manifestItems
    .map((i) => {
      const props = i.properties ? ` properties="${i.properties}"` : "";
      const mediaType = i.mediaType || "application/xhtml+xml";
      return `<item id="${i.id}" href="${i.href}" media-type="${mediaType}"${props}/>`;
    })
    .join("\n    ");
  const spine = spineIdrefs.map((id) => `<itemref idref="${id}"/>`).join("\n    ");
  const tocAttr = spineToc ? ` toc="${spineToc}"` : "";
  return `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <manifest>
    ${manifest}
  </manifest>
  <spine${tocAttr}>
    ${spine}
  </spine>
</package>`;
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-external-chapters-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildFixtureEpub(
  dir,
  { opfPath = "OEBPS/content.opf", manifestItems, spineIdrefs, spineToc, extraFiles = [] },
) {
  const epubPath = join(dir, "book.epub");
  const zipBuffer = buildZip([
    { name: "META-INF/container.xml", content: containerXml(opfPath) },
    { name: opfPath, content: opfXml(manifestItems, spineIdrefs, { spineToc }) },
    ...extraFiles,
  ]);
  writeFileSync(epubPath, zipBuffer);
  return epubPath;
}

// entries: [{ href, label }]
function navXhtml(entries, { extraNav = "" } = {}) {
  const items = entries
    .map((e) => `<li><a href="${e.href}">${e.label}</a></li>`)
    .join("\n        ");
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    ${extraNav}
    <nav epub:type="toc">
      <ol>
        ${items}
      </ol>
    </nav>
  </body>
</html>`;
}

// point: { label, href, children?: point[] }
function navPointXml(point, index) {
  const children = (point.children || []).map((child, i) => navPointXml(child, i)).join("\n");
  return `<navPoint id="np-${index}-${point.href}" playOrder="${index + 1}">
    <navLabel><text>${point.label}</text></navLabel>
    <content src="${point.href}"/>
    ${children}
  </navPoint>`;
}

function ncxXml(navPoints) {
  const points = navPoints.map((p, i) => navPointXml(p, i)).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    ${points}
  </navMap>
</ncx>`;
}

function chapterFile(name, title) {
  return { name, content: `<html><head><title>${title}</title></head><body>x</body></html>` };
}

// --- listExternalChapters() / describeChapter(), nav.xhtml-sourced ---

test("listExternalChapters() resolves a normal 1:1 nav-to-spine mapping", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "ch2", href: "xhtml/ch2.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      spineIdrefs: ["ch1", "ch2"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        chapterFile("OEBPS/xhtml/ch2.xhtml", "Two"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          content: navXhtml([
            { href: "ch1.xhtml", label: "Lesson 1: Meeting" },
            { href: "ch2.xhtml", label: "Lesson 2: Possession" },
          ]),
        },
      ],
    });

    const chapters = listExternalChapters(epubPath);

    assert.deepEqual(chapters, [
      { label: "Lesson 1: Meeting", firstChapterNumber: 1, lastChapterNumber: 1, source: "nav" },
      { label: "Lesson 2: Possession", firstChapterNumber: 2, lastChapterNumber: 2, source: "nav" },
    ]);
    assert.equal(describeChapter(epubPath, 1), "Lesson 1: Meeting");
    assert.equal(describeChapter(epubPath, 2), "Lesson 2: Possession");
  });
});

test("listExternalChapters() ranges a nav entry that spans multiple spine files", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "ch2", href: "xhtml/ch2.xhtml" },
        { id: "ch3", href: "xhtml/ch3.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      spineIdrefs: ["ch1", "ch2", "ch3"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        chapterFile("OEBPS/xhtml/ch2.xhtml", "Two"),
        chapterFile("OEBPS/xhtml/ch3.xhtml", "Three"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          // Only one nav entry, but three spine files — the chapter spans all three.
          content: navXhtml([{ href: "ch1.xhtml", label: "Lesson 1: A Long Lesson" }]),
        },
      ],
    });

    const chapters = listExternalChapters(epubPath);

    assert.deepEqual(chapters, [
      {
        label: "Lesson 1: A Long Lesson",
        firstChapterNumber: 1,
        lastChapterNumber: 3,
        source: "nav",
      },
    ]);
    assert.equal(describeChapter(epubPath, 1), "Lesson 1: A Long Lesson");
    assert.equal(describeChapter(epubPath, 2), "Lesson 1: A Long Lesson");
    assert.equal(describeChapter(epubPath, 3), "Lesson 1: A Long Lesson");
  });
});

test("listExternalChapters() collapses consecutive nav entries resolving to the same spine file, keeping the first label", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "ch2", href: "xhtml/ch2.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      spineIdrefs: ["ch1", "ch2"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        chapterFile("OEBPS/xhtml/ch2.xhtml", "Two"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          content: navXhtml([
            { href: "ch1.xhtml", label: "Part One" },
            { href: "ch1.xhtml", label: "Chapter One" },
            { href: "ch2.xhtml", label: "Chapter Two" },
          ]),
        },
      ],
    });

    const chapters = listExternalChapters(epubPath);

    assert.deepEqual(
      chapters.map((c) => c.label),
      ["Part One", "Chapter Two"],
    );
    assert.equal(describeChapter(epubPath, 1), "Part One");
  });
});

test("listExternalChapters() falls back to NCX when there's no nav.xhtml", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "ch2", href: "xhtml/ch2.xhtml" },
        { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
      ],
      spineIdrefs: ["ch1", "ch2"],
      spineToc: "ncx",
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        chapterFile("OEBPS/xhtml/ch2.xhtml", "Two"),
        {
          name: "OEBPS/toc.ncx",
          content: ncxXml([
            { label: "Lesson 1: Meeting", href: "xhtml/ch1.xhtml" },
            { label: "Lesson 2: Possession", href: "xhtml/ch2.xhtml" },
          ]),
        },
      ],
    });

    const chapters = listExternalChapters(epubPath);

    assert.deepEqual(chapters, [
      { label: "Lesson 1: Meeting", firstChapterNumber: 1, lastChapterNumber: 1, source: "ncx" },
      { label: "Lesson 2: Possession", firstChapterNumber: 2, lastChapterNumber: 2, source: "ncx" },
    ]);
  });
});

test("listExternalChapters() falls back to a media-type match for the NCX when <spine> has no toc attribute", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "my-ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
      ],
      spineIdrefs: ["ch1"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        {
          name: "OEBPS/toc.ncx",
          content: ncxXml([{ label: "Lesson 1: Meeting", href: "xhtml/ch1.xhtml" }]),
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Lesson 1: Meeting");
  });
});

test("listExternalChapters() flattens nested NCX navPoints into one list, in document order", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "ch2", href: "xhtml/ch2.xhtml" },
        { id: "ch3", href: "xhtml/ch3.xhtml" },
        { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
      ],
      spineIdrefs: ["ch1", "ch2", "ch3"],
      spineToc: "ncx",
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        chapterFile("OEBPS/xhtml/ch2.xhtml", "Two"),
        chapterFile("OEBPS/xhtml/ch3.xhtml", "Three"),
        {
          name: "OEBPS/toc.ncx",
          content: ncxXml([
            {
              label: "Unit 1",
              href: "xhtml/ch1.xhtml",
              children: [
                { label: "Lesson 1", href: "xhtml/ch1.xhtml" },
                { label: "Lesson 2", href: "xhtml/ch2.xhtml" },
              ],
            },
            { label: "Unit 2", href: "xhtml/ch3.xhtml" },
          ]),
        },
      ],
    });

    const chapters = listExternalChapters(epubPath);

    // "Unit 1" and "Lesson 1" both resolve to ch1.xhtml (spine 1) — collapsed to the
    // first (parent) label, per the same-spine-file collapse rule.
    assert.deepEqual(
      chapters.map((c) => ({
        label: c.label,
        first: c.firstChapterNumber,
        last: c.lastChapterNumber,
      })),
      [
        { label: "Unit 1", first: 1, last: 1 },
        { label: "Lesson 2", first: 2, last: 2 },
        { label: "Unit 2", first: 3, last: 3 },
      ],
    );
  });
});

test("listExternalChapters() returns [] when there's no navigation document at all", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch1.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [chapterFile("OEBPS/xhtml/ch1.xhtml", "One")],
    });

    assert.deepEqual(listExternalChapters(epubPath), []);
  });
});

test("describeChapter() falls back to the <title>-tag heuristic when there's no navigation document", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "ch1", href: "xhtml/ch1.xhtml" }],
      spineIdrefs: ["ch1"],
      extraFiles: [chapterFile("OEBPS/xhtml/ch1.xhtml", "Lesson 1: Meeting, Some Book")],
    });

    assert.equal(describeChapter(epubPath, 1), "Lesson 1: Meeting");
  });
});

test("describeChapter() falls back to the <title>-tag heuristic for a chapter number outside every nav range", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "cover", href: "xhtml/cover.xhtml" },
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      // cover.xhtml is front matter before the book's first real nav entry.
      spineIdrefs: ["cover", "ch1"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/cover.xhtml", "Cover, Some Book"),
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          content: navXhtml([{ href: "ch1.xhtml", label: "Lesson 1: Meeting" }]),
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Cover");
    assert.equal(describeChapter(epubPath, 2), "Lesson 1: Meeting");
  });
});

test("listExternalChapters() skips a nav entry whose href doesn't resolve to any spine file, logging a warning", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      spineIdrefs: ["ch1"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          content: navXhtml([
            { href: "does-not-exist.xhtml", label: "Ghost Chapter" },
            { href: "ch1.xhtml", label: "Lesson 1: Meeting" },
          ]),
        },
      ],
    });

    const logs = [];
    const chapters = listExternalChapters(epubPath, { log: (msg) => logs.push(msg) });

    assert.deepEqual(
      chapters.map((c) => c.label),
      ["Lesson 1: Meeting"],
    );
    assert.ok(logs.some((msg) => msg.includes("Ghost Chapter") && msg.includes("did not resolve")));
  });
});

test("listExternalChapters() only parses the toc <nav>, ignoring a sibling landmarks/page-list <nav>", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/ch1.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      spineIdrefs: ["ch1"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/ch1.xhtml", "One"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          content: navXhtml([{ href: "ch1.xhtml", label: "Lesson 1: Meeting" }], {
            extraNav:
              '<nav epub:type="landmarks"><ol><li><a href="ch1.xhtml">Should Not Appear</a></li></ol></nav>',
          }),
        },
      ],
    });

    const chapters = listExternalChapters(epubPath);

    assert.deepEqual(
      chapters.map((c) => c.label),
      ["Lesson 1: Meeting"],
    );
  });
});

test("listExternalChapters() decodes a URL-encoded nav href before matching it to a spine file", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "ch1", href: "xhtml/lesson one.xhtml" },
        { id: "nav", href: "xhtml/nav.xhtml", properties: "nav" },
      ],
      spineIdrefs: ["ch1"],
      extraFiles: [
        chapterFile("OEBPS/xhtml/lesson one.xhtml", "One"),
        {
          name: "OEBPS/xhtml/nav.xhtml",
          content: navXhtml([{ href: "lesson%20one.xhtml", label: "Lesson 1: Meeting" }]),
        },
      ],
    });

    assert.equal(describeChapter(epubPath, 1), "Lesson 1: Meeting");
  });
});

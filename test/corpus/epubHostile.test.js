import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { buildFixtureEpub, buildZip, containerXml } from "../support/epubFixtures.js";
import { listExternalChapters, extractChapterToFile } from "../../src/corpus/epubArchive.js";
import { listLessons, resolveLesson } from "../../src/corpus/epubLessons.js";
import { buildShapeReport } from "../../src/corpus/epubShapeReport.js";

// The hostile-EPUB suite. Every case here is a shape a real book in the wild has, that the
// parser used to accept SILENTLY — producing a plausible-looking lesson list that did not
// describe the book. The two adversarial cases that already existed (ZIP64, an encrypted
// entry) both fail LOUDLY, which is why they were never the risk; these are the quiet ones.

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-hostile-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function page(title, body = "<p>text</p>") {
  return `<html><head><title>${title}</title></head><body>${body}</body></html>`;
}

function ncxDoc(navPoints) {
  return `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>${navPoints.join("")}</navMap>
</ncx>`;
}

// The standard shape a real EPUB2 toolchain emits: attributes on navLabel/text, and inline
// markup around the label itself.
function navPoint(id, label, src, { attrs = "", inner = null } = {}) {
  const text = inner ?? label;
  return `<navPoint id="${id}" playOrder="1"><navLabel${attrs}><text${attrs}>${text}</text></navLabel><content src="${src}"/></navPoint>`;
}

function ncxBook(dir, navPoints, chapterFiles) {
  return buildFixtureEpub(dir, {
    manifestItems: [
      { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
      ...chapterFiles.map((file, i) => ({ id: `c${i + 1}`, href: file })),
    ],
    spineIdrefs: chapterFiles.map((_, i) => `c${i + 1}`),
    spineToc: "ncx",
    extraFiles: [
      { name: "OEBPS/toc.ncx", content: ncxDoc(navPoints) },
      ...chapterFiles.map((file) => ({
        name: `OEBPS/${file}`,
        content: page(file),
      })),
    ],
  });
}

test("hostile: an NCX navLabel/text carrying attributes still parses (the live EPUB2 path)", () => {
  withTempDir((dir) => {
    const epubPath = ncxBook(
      dir,
      [
        navPoint("n1", "Lesson 1: Greetings", "ch1.xhtml", { attrs: ' xml:lang="en" class="toc"' }),
        navPoint("n2", "Lesson 2: Numbers", "ch2.xhtml", { attrs: ' id="t2"' }),
      ],
      ["ch1.xhtml", "ch2.xhtml"],
    );

    assert.deepEqual(
      listExternalChapters(epubPath).map((c) => c.label),
      ["Lesson 1: Greetings", "Lesson 2: Numbers"],
    );
  });
});

test("hostile: an NCX label wrapped in inline markup keeps its text instead of being dropped", () => {
  withTempDir((dir) => {
    const epubPath = ncxBook(
      dir,
      [
        navPoint("n1", "Lesson 1: Greetings", "ch1.xhtml", {
          inner: "<span>Lesson 1: Greetings</span>",
        }),
      ],
      ["ch1.xhtml"],
    );

    assert.deepEqual(
      listExternalChapters(epubPath).map((c) => c.label),
      ["Lesson 1: Greetings"],
    );
  });
});

test("hostile: a navPoint with no <content src> is logged, never silently dropped", () => {
  withTempDir((dir) => {
    const epubPath = ncxBook(
      dir,
      [
        navPoint("n1", "Lesson 1: Greetings", "ch1.xhtml"),
        '<navPoint id="n2"><navLabel><text>Lesson 2: Numbers</text></navLabel></navPoint>',
      ],
      ["ch1.xhtml", "ch2.xhtml"],
    );

    const logs = [];
    listExternalChapters(epubPath, { log: (m) => logs.push(m) });
    assert.ok(logs.some((m) => m.includes("navPoint #2 skipped")));
    assert.ok(logs.some((m) => m.includes("shifts every --lesson ordinal")));

    const report = buildShapeReport(epubPath);
    assert.equal(report.nav.unparsed, 1);
    assert.ok(
      report.warnings.some((w) => w.includes("more entr(ies) than this parser could read")),
    );
  });
});

test("hostile: a commented-out nav anchor does not become a phantom lesson", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
        { id: "c2", href: "ch2.xhtml" },
      ],
      spineIdrefs: ["c1", "c2"],
      extraFiles: [
        {
          name: "OEBPS/nav.xhtml",
          content:
            '<html><body><nav epub:type="toc"><ol>' +
            '<!-- <li><a href="ch1.xhtml">Cut Lesson</a></li> -->' +
            '<li><a href="ch1.xhtml">Lesson 1: Greetings</a></li>' +
            '<li><a href="ch2.xhtml">Lesson 2: Numbers</a></li>' +
            "</ol></nav></body></html>",
        },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1") },
        { name: "OEBPS/ch2.xhtml", content: page("Lesson 2") },
      ],
    });

    const lessons = listLessons(epubPath);
    // A phantom entry would not just add a row: it would shift every ordinal after it, so
    // --lesson 2 would build lesson 1.
    assert.deepEqual(
      lessons.map((l) => `${l.number}:${l.label}`),
      ["1:Lesson 1: Greetings", "2:Lesson 2: Numbers"],
    );
  });
});

test("hostile: a CDATA section in the nav document contributes no entries", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["c1"],
      extraFiles: [
        {
          name: "OEBPS/nav.xhtml",
          content:
            '<html><body><nav epub:type="toc"><ol>' +
            "<script><![CDATA[ var tpl = '<a href=\"ch1.xhtml\">Injected</a>'; ]]></script>" +
            '<li><a href="ch1.xhtml">Lesson 1: Greetings</a></li>' +
            "</ol></nav></body></html>",
        },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1") },
      ],
    });

    assert.deepEqual(
      listExternalChapters(epubPath).map((c) => c.label),
      ["Lesson 1: Greetings"],
    );
  });
});

test("hostile: a commented-out manifest item cannot be selected as the navigation document", () => {
  withTempDir((dir) => {
    // The OPF is hand-written here because the fixture builder never emits comments.
    const opf = `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <manifest>
    <!-- <item id="oldnav" href="old-nav.xhtml" media-type="application/xhtml+xml" properties="nav"/> -->
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`;
    const epubPath = join(dir, "book.epub");
    writeFileSync(
      epubPath,
      buildZip([
        { name: "META-INF/container.xml", content: containerXml("OEBPS/content.opf") },
        { name: "OEBPS/content.opf", content: opf },
        {
          name: "OEBPS/old-nav.xhtml",
          content:
            '<html><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Stale Label</a></li></ol></nav></body></html>',
        },
        {
          name: "OEBPS/nav.xhtml",
          content:
            '<html><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Lesson 1: Greetings</a></li></ol></nav></body></html>',
        },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1") },
      ]),
    );

    assert.deepEqual(
      listExternalChapters(epubPath).map((c) => c.label),
      ["Lesson 1: Greetings"],
    );
  });
});

test("hostile: a non-monotonic nav clamps the inverted range and says so", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
        { id: "c2", href: "ch2.xhtml" },
        { id: "c3", href: "ch3.xhtml" },
        { id: "c4", href: "ch4.xhtml" },
        { id: "c5", href: "ch5.xhtml" },
      ],
      spineIdrefs: ["c1", "c2", "c3", "c4", "c5"],
      extraFiles: [
        {
          name: "OEBPS/nav.xhtml",
          content:
            '<html><body><nav epub:type="toc"><ol>' +
            // Points at spine 5, then back at spine 2: the range arithmetic yields 5-1.
            '<li><a href="ch5.xhtml">Lesson 5: Later</a></li>' +
            '<li><a href="ch2.xhtml">Lesson 2: Earlier</a></li>' +
            "</ol></nav></body></html>",
        },
        ...[1, 2, 3, 4, 5].map((n) => ({
          name: `OEBPS/ch${n}.xhtml`,
          content: page(`Chapter ${n}`),
        })),
      ],
    });

    const logs = [];
    const chapters = listExternalChapters(epubPath, { log: (m) => logs.push(m) });

    assert.equal(chapters[0].firstChapterNumber, 5);
    assert.equal(chapters[0].lastChapterNumber, 5, "clamped to the entry's own file");
    assert.ok(logs.some((m) => m.includes("INVERTED spine range 5-1")));

    const report = buildShapeReport(epubPath);
    assert.equal(report.lessons[0].monotonic, false);
    assert.ok(report.warnings.some((w) => w.includes("INVERTED spine range")));

    // And the selector path never hands a caller a backwards range.
    const lesson = resolveLesson(epubPath, "Later");
    assert.ok(lesson.lastChapterNumber >= lesson.firstChapterNumber);
  });
});

test("hostile: a nav block with more anchors than parsed entries is reported", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["c1"],
      extraFiles: [
        {
          name: "OEBPS/nav.xhtml",
          content:
            '<html><body><nav epub:type="toc"><ol>' +
            '<li><a href="ch1.xhtml">Lesson 1: Greetings</a></li>' +
            // No href: a real entry in the book's contents that this parser cannot follow.
            "<li><a>Lesson 2: Numbers</a></li>" +
            "</ol></nav></body></html>",
        },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1") },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.equal(report.nav.unparsed, 1);
    assert.ok(
      report.warnings.some((w) => w.includes("more entr(ies) than this parser could read")),
    );
  });
});

test("hostile: two chapters writing different bytes to one cached image path is logged as a collision", () => {
  withTempDir((dir) => {
    // The standard Sigil/InDesign layout: chapters in their own directories, each with its
    // own images beside it. Both reference "fig.png"; both land on chapters/fig.png.
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "c1", href: "one/ch1.xhtml" },
        { id: "c2", href: "two/ch2.xhtml" },
      ],
      spineIdrefs: ["c1", "c2"],
      extraFiles: [
        { name: "OEBPS/one/ch1.xhtml", content: page("One", '<img src="fig.png"/>') },
        { name: "OEBPS/two/ch2.xhtml", content: page("Two", '<img src="fig.png"/>') },
        { name: "OEBPS/one/fig.png", content: "first-image-bytes" },
        { name: "OEBPS/two/fig.png", content: "second-image-bytes" },
      ],
    });

    const logged = [];
    const log = (msg) => logged.push(msg);
    extractChapterToFile(epubPath, 1, join(dir, "cache", "chapters", "1.xhtml"), { log });
    extractChapterToFile(epubPath, 2, join(dir, "cache", "chapters", "2.xhtml"), { log });

    const collision = logged.find((m) => m.includes("IMAGE COLLISION"));
    assert.ok(collision, "the second write must name the collision");
    // Both sides and the shared destination, or the log cannot be acted on.
    assert.match(collision, /OEBPS\/one\/fig\.png/);
    assert.match(collision, /OEBPS\/two\/fig\.png/);
    assert.match(collision, /fig\.png/);
  });
});

test("hostile: identical bytes on a shared image path are not reported as a collision", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "c1", href: "one/ch1.xhtml" },
        { id: "c2", href: "two/ch2.xhtml" },
      ],
      spineIdrefs: ["c1", "c2"],
      extraFiles: [
        { name: "OEBPS/one/ch1.xhtml", content: page("One", '<img src="fig.png"/>') },
        { name: "OEBPS/two/ch2.xhtml", content: page("Two", '<img src="fig.png"/>') },
        { name: "OEBPS/one/fig.png", content: "same-bytes" },
        { name: "OEBPS/two/fig.png", content: "same-bytes" },
      ],
    });

    const logged = [];
    const log = (msg) => logged.push(msg);
    extractChapterToFile(epubPath, 1, join(dir, "cache", "chapters", "1.xhtml"), { log });
    extractChapterToFile(epubPath, 2, join(dir, "cache", "chapters", "2.xhtml"), { log });

    assert.ok(!logged.some((m) => m.includes("IMAGE COLLISION")));
  });
});

test("hostile: an image src escaping the book's cache directory is refused, not written", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "c1", href: "xhtml/ch1.xhtml" }],
      spineIdrefs: ["c1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch1.xhtml",
          content: page("One", '<img src="../../../escaped.png"/>'),
        },
        // A zip may name an entry anything at all, including a traversal path.
        { name: "../escaped.png", content: "hostile-bytes" },
      ],
    });

    const logged = [];
    extractChapterToFile(epubPath, 1, join(dir, "cache", "chapters", "1.xhtml"), {
      log: (msg) => logged.push(msg),
    });

    assert.ok(logged.some((m) => m.includes("REFUSED image")));
    assert.ok(!existsSync(join(dir, "escaped.png")));
    assert.ok(!existsSync(join(dirname(dir), "escaped.png")));
  });
});

test("hostile: an SVG wrapper's own referenced image is copied too, and the SVG is announced", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [{ id: "c1", href: "xhtml/ch1.xhtml" }],
      spineIdrefs: ["c1"],
      extraFiles: [
        {
          name: "OEBPS/xhtml/ch1.xhtml",
          content: page("One", '<img src="../images/page.svg"/>'),
        },
        {
          name: "OEBPS/images/page.svg",
          content:
            '<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="scan.jpg" width="100"/></svg>',
        },
        { name: "OEBPS/images/scan.jpg", content: "real-page-bytes" },
      ],
    });

    const logged = [];
    extractChapterToFile(epubPath, 1, join(dir, "cache", "chapters", "1.xhtml"), {
      log: (msg) => logged.push(msg),
    });

    // Copying the wrapper alone would leave the model reading XML that points at nothing.
    assert.ok(existsSync(join(dir, "cache", "images", "page.svg")));
    assert.equal(
      readFileSync(join(dir, "cache", "images", "scan.jpg"), "utf-8"),
      "real-page-bytes",
    );
    assert.ok(logged.some((m) => m.includes("copied SVG") && m.includes("page.svg")));
  });
});

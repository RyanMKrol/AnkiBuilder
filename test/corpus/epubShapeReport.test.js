import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildFixtureEpub } from "../support/epubFixtures.js";
import { buildShapeReport, formatShapeReport } from "../../src/corpus/epubShapeReport.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-shape-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function page(title, body = "<p>text</p>") {
  return `<html><head><title>${title}</title></head><body>${body}</body></html>`;
}

function navDoc(entries) {
  const items = entries.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
  return `<html><body><nav epub:type="toc"><ol>${items}</ol></nav></body></html>`;
}

// A well-behaved book: every spine file is named by exactly one nav entry, in order.
function cleanBook(dir) {
  return buildFixtureEpub(dir, {
    manifestItems: [
      { id: "nav", href: "nav.xhtml", properties: "nav" },
      { id: "c1", href: "ch1.xhtml" },
      { id: "c2", href: "ch2.xhtml" },
    ],
    spineIdrefs: ["c1", "c2"],
    extraFiles: [
      {
        name: "OEBPS/nav.xhtml",
        content: navDoc([
          ["ch1.xhtml", "Lesson 1: Greetings"],
          ["ch2.xhtml", "Lesson 2: Numbers"],
        ]),
      },
      { name: "OEBPS/ch1.xhtml", content: page("Lesson 1", "<p>" + "a".repeat(400) + "</p>") },
      { name: "OEBPS/ch2.xhtml", content: page("Lesson 2", "<p>" + "b".repeat(400) + "</p>") },
    ],
  });
}

test("buildShapeReport() reports the nav source, spine size and image totals", () => {
  withTempDir((dir) => {
    const report = buildShapeReport(cleanBook(dir));

    assert.equal(report.nav.source, "nav");
    assert.equal(report.totals.spineCount, 2);
    assert.equal(report.totals.imageRefs, 0);
    assert.equal(report.lessons.length, 2);
    assert.deepEqual(
      report.lessons.map((l) => l.type),
      ["lesson", "lesson"],
    );
  });
});

test("buildShapeReport() emits no warnings for a book whose nav names every spine file", () => {
  withTempDir((dir) => {
    const report = buildShapeReport(cleanBook(dir));
    assert.deepEqual(report.warnings, []);
    assert.ok(formatShapeReport(report).some((line) => line.includes("no shape warnings")));
  });
});

test("buildShapeReport() annotates every label with the Anki deck path it produces", () => {
  withTempDir((dir) => {
    const report = buildShapeReport(cleanBook(dir));
    // The label is not cosmetic — unitDeckSegments turns it into the live deck path, and a
    // grouped label splits into two segments with a zero-padded number.
    assert.deepEqual(report.lessons[0].deckSegments, ["Lesson 01", "Greetings"]);
  });
});

test("buildShapeReport() flags spine files before the first nav entry as unreachable via --lesson", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "cover", href: "cover.xhtml" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["cover", "c1"],
      extraFiles: [
        { name: "OEBPS/nav.xhtml", content: navDoc([["ch1.xhtml", "Lesson 1: Greetings"]]) },
        { name: "OEBPS/cover.xhtml", content: page("Cover") },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1") },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.deepEqual(
      report.unreachable.map((f) => f.number),
      [1],
    );
    assert.ok(report.warnings.some((w) => w.includes("UNREACHABLE via --lesson")));
  });
});

test("buildShapeReport() reports a nav label colliding with a <title>-tag fallback label", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "cover", href: "cover.xhtml" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["cover", "c1"],
      extraFiles: [
        {
          name: "OEBPS/nav.xhtml",
          content: navDoc([["ch1.xhtml", "Cover"]]),
        },
        // Spine 1 is not named by the nav, so describeChapter(1) falls back to its <title>
        // tag — which is the same string nav entry [1] carries.
        { name: "OEBPS/cover.xhtml", content: page("Cover") },
        { name: "OEBPS/ch1.xhtml", content: page("Chapter One") },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.deepEqual(
      report.labelCollisions.map((c) => c.label),
      ["Cover"],
    );
    assert.ok(report.warnings.some((w) => w.includes("label collision")));
  });
});

test("buildShapeReport() counts the spine files a nav entry swallows without naming them", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
        { id: "c2", href: "ch2.xhtml" },
        { id: "c3", href: "ch3.xhtml" },
      ],
      spineIdrefs: ["c1", "c2", "c3"],
      extraFiles: [
        { name: "OEBPS/nav.xhtml", content: navDoc([["ch1.xhtml", "Lesson 1: Greetings"]]) },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1") },
        { name: "OEBPS/ch2.xhtml", content: page("Continued") },
        { name: "OEBPS/ch3.xhtml", content: page("Continued") },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.equal(report.lessons[0].filesInRange, 3);
    assert.equal(report.lessons[0].namedInRange, 1);
    assert.equal(report.lessons[0].swallowed, 2);
    assert.ok(report.warnings.some((w) => w.includes("the nav never named")));
  });
});

test("buildShapeReport() warns when no nav entry classifies as a lesson or unit", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["c1"],
      extraFiles: [
        { name: "OEBPS/nav.xhtml", content: navDoc([["ch1.xhtml", "Twenty-Three"]]) },
        { name: "OEBPS/ch1.xhtml", content: page("Twenty-Three") },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.ok(report.warnings.some((w) => w.includes("classify as a lesson or unit")));
  });
});

test("buildShapeReport() counts image filenames from different archive directories colliding in the shared cache", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "one/ch1.xhtml" },
        { id: "c2", href: "two/ch2.xhtml" },
      ],
      spineIdrefs: ["c1", "c2"],
      extraFiles: [
        {
          name: "OEBPS/nav.xhtml",
          content: navDoc([
            ["one/ch1.xhtml", "Lesson 1: Greetings"],
            ["two/ch2.xhtml", "Lesson 2: Numbers"],
          ]),
        },
        { name: "OEBPS/one/ch1.xhtml", content: page("One", '<img src="fig.png"/>') },
        { name: "OEBPS/two/ch2.xhtml", content: page("Two", '<img src="fig.png"/>') },
        { name: "OEBPS/one/fig.png", content: "first-image-bytes" },
        { name: "OEBPS/two/fig.png", content: "second-image-bytes" },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.equal(report.imageCollisions.length, 1);
    assert.equal(report.imageCollisions[0].dest, "fig.png");
    assert.deepEqual(report.imageCollisions[0].archivePaths, [
      "OEBPS/one/fig.png",
      "OEBPS/two/fig.png",
    ]);
    assert.ok(report.warnings.some((w) => w.includes("image filename collision")));
  });
});

test("buildShapeReport() reports per-file text length against image count, and flags picture-only pages", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["c1"],
      extraFiles: [
        { name: "OEBPS/nav.xhtml", content: navDoc([["ch1.xhtml", "Lesson 1: Greetings"]]) },
        {
          name: "OEBPS/ch1.xhtml",
          content: page("Lesson 1", '<img src="a.png"/><img src="b.png"/>Hi'),
        },
        { name: "OEBPS/a.png", content: "a-bytes" },
        { name: "OEBPS/b.png", content: "b-bytes" },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.equal(report.spine[0].images.length, 2);
    assert.ok(report.spine[0].textLength < 200);
    assert.ok(report.warnings.some((w) => w.includes("characters of text but do")));
  });
});

test("buildShapeReport() flags image references that are not in the archive at all", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, {
      manifestItems: [
        { id: "nav", href: "nav.xhtml", properties: "nav" },
        { id: "c1", href: "ch1.xhtml" },
      ],
      spineIdrefs: ["c1"],
      extraFiles: [
        { name: "OEBPS/nav.xhtml", content: navDoc([["ch1.xhtml", "Lesson 1: Greetings"]]) },
        { name: "OEBPS/ch1.xhtml", content: page("Lesson 1", '<img src="missing.png"/>') },
      ],
    });

    const report = buildShapeReport(epubPath);
    assert.equal(report.totals.missingImages, 1);
    assert.ok(report.warnings.some((w) => w.includes("not in the archive")));
  });
});

test("formatShapeReport() prints per-entry and per-file detail only when asked", () => {
  withTempDir((dir) => {
    const report = buildShapeReport(cleanBook(dir));

    const summary = formatShapeReport(report).join("\n");
    assert.ok(summary.includes("nav source: nav"));
    assert.ok(!summary.includes("spine files:"));

    const detail = formatShapeReport(report, { detail: true }).join("\n");
    assert.ok(detail.includes("spine files:"));
    assert.ok(detail.includes("Lesson 01 :: Greetings"));
  });
});

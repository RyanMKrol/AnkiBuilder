import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Buffer } from "buffer";
import { buildFixtureEpub } from "../support/epubFixtures.js";
import { readZip } from "../../src/deck/zip.js";
import { assessEpubEligibility, judgeShape } from "../../src/corpus/epubEligibility.js";
import { listLessons } from "../../src/corpus/epubLessons.js";
import { listPageImages, extractPageImages } from "../../src/remaster/sourcePages.js";
import { parseOutline, contentsLikePages } from "../../src/remaster/outline.js";
import { parsePageReply, xhtmlProblems } from "../../src/remaster/pageTranscribe.js";
import { crossCheckPage, transcriptParts } from "../../src/remaster/ocrCrossCheck.js";
import { buildRemasteredEpub } from "../../src/remaster/epubWriter.js";
import { remasterRoot } from "../../src/remaster/workspace.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-remaster-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A Calibre-style reflow: one spine file, one <img> per page, next to no text.
function pageImageBook(dir, pageCount = 12) {
  const imgs = Array.from(
    { length: pageCount },
    (_, i) => `<p id="page_${i + 1}"><img src="index-${i + 1}_1.jpg" alt=""/></p>`,
  );
  return buildFixtureEpub(dir, {
    manifestItems: [
      { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
      { id: "html", href: "index.html" },
    ],
    spineIdrefs: ["html"],
    spineToc: "ncx",
    extraFiles: [
      { name: "OEBPS/index.html", content: `<html><body>${imgs.join("")}</body></html>` },
      {
        name: "OEBPS/toc.ncx",
        content:
          `<ncx><navMap><navPoint id="a" playOrder="1"><navLabel><text>Start</text></navLabel>` +
          `<content src="index.html"/></navPoint></navMap></ncx>`,
      },
      ...Array.from({ length: pageCount }, (_, i) => ({
        name: `OEBPS/index-${i + 1}_1.jpg`,
        content: Buffer.from(`jpeg bytes for page ${i + 1}`),
      })),
    ],
  });
}

// Every field judgeShape reads, and nothing else, so a test states the shape it means.
function shape({ text, images, lessons, navSource = "nav", contentBytes = 500000 }) {
  return {
    spine: [{ textLength: text }],
    totals: { distinctImages: images, contentBytes },
    nav: { source: navSource },
    lessons: Array.from({ length: lessons }, (_, i) => ({ label: `Lesson ${i + 1}` })),
  };
}

// ---------------------------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------------------------

test("a reflowed page-image book is sent to the remaster, with both reasons", () => {
  withTempDir((dir) => {
    const result = assessEpubEligibility(pageImageBook(dir));
    assert.equal(result.verdict, "remaster");
    assert.match(result.reasons[0], /pictures of pages/);
    assert.match(result.reasons[1], /names 1 section/);
  });
});

test("a text book with plenty of pictures stays native (Japanese for Busy People's real ratio)", () => {
  // 291,660 characters over 727 images, about 400 per image, measured 2026-09-21.
  const verdict = judgeShape(shape({ text: 291660, images: 727, lessons: 56 }));
  assert.deepEqual(verdict, { verdict: "native", reasons: [] });
});

test("a text book with no table of contents is blocked, not sent to the remaster", () => {
  const verdict = judgeShape(shape({ text: 300000, images: 50, lessons: 0, navSource: null }));
  assert.equal(verdict.verdict, "blocked");
  assert.match(verdict.reasons[0], /no table of contents/);
});

test("a big text book whose TOC names one section is blocked", () => {
  const verdict = judgeShape(shape({ text: 300000, images: 50, lessons: 1 }));
  assert.equal(verdict.verdict, "blocked");
  assert.match(verdict.reasons[0], /built as one lesson/);
});

test("a tiny picture book is not mistaken for a page-image book", () => {
  const verdict = judgeShape(shape({ text: 20, images: 3, lessons: 2, contentBytes: 2000 }));
  assert.equal(verdict.verdict, "native");
});

test("a file the parser rejects is blocked with the parser's reason", () => {
  withTempDir((dir) => {
    const path = join(dir, "broken.epub");
    writeFileSync(path, "not a zip");
    const result = assessEpubEligibility(path);
    assert.equal(result.verdict, "blocked");
    assert.match(result.reasons[0], /parser rejects/);
  });
});

// ---------------------------------------------------------------------------------------------
// Pages, workspace
// ---------------------------------------------------------------------------------------------

test("page images come out in reading order, numbered from 1, each once", () => {
  withTempDir((dir) => {
    const epub = pageImageBook(dir, 3);
    const { pages } = listPageImages(epub);
    assert.deepEqual(
      pages.map((p) => [p.number, p.archivePath]),
      [
        [1, "OEBPS/index-1_1.jpg"],
        [2, "OEBPS/index-2_1.jpg"],
        [3, "OEBPS/index-3_1.jpg"],
      ],
    );
    const extracted = extractPageImages(epub, join(dir, "images"));
    assert.equal(readFileSync(extracted[1].localPath, "utf-8"), "jpeg bytes for page 2");
    assert.match(extracted[1].localPath, /page-002\.jpg$/);
  });
});

test("the remaster workspace never resolves into the real library under the test runner", () => {
  assert.ok(!remasterRoot("abc").includes(join(process.cwd(), ".anki-builder")));
});

// ---------------------------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------------------------

function outlineReply(entries) {
  return "```json\n" + JSON.stringify({ printedPageOffset: 9, entries }) + "\n```";
}

const entry = (label, firstPage, lastPage, kind = "lesson") => ({
  label,
  kind,
  firstPage,
  lastPage,
});

test("an outline covering every page once, in order, parses", () => {
  const outline = parseOutline(
    outlineReply([entry("Front", 1, 3, "front-matter"), entry("Lesson 1: New Friends", 4, 10)]),
    { pageCount: 10 },
  );
  assert.equal(outline.printedPageOffset, 9);
  assert.deepEqual(
    outline.entries.map((e) => [e.number, e.label, e.firstPage, e.lastPage]),
    [
      [1, "Front", 1, 3],
      [2, "Lesson 1: New Friends", 4, 10],
    ],
  );
});

test("an outline with a gap, an overlap, a repeated label or a short end is refused", () => {
  const cases = [
    [[entry("A", 1, 3), entry("B", 5, 10)], /starts at page 5/],
    [[entry("A", 1, 5), entry("B", 4, 10)], /starts at page 4/],
    [[entry("Lesson 1", 1, 5), entry("Lesson 1", 6, 10)], /repeats a label/],
    [[entry("A", 1, 5), entry("B", 6, 9)], /end at page 9, but the book has 10/],
    [[entry("A", 1, 10, "chapter")], /unknown kind/],
  ];
  for (const [entries, message] of cases) {
    assert.throws(() => parseOutline(outlineReply(entries), { pageCount: 10 }), message);
  }
});

test("a part's own contents page, deep in the book, is found by the lessons it names", () => {
  const ocrOf = (text) => ({ lines: [{ text, x: 0.2, y: 0.5, w: 0.5, h: 0.02 }] });
  const ocrByPage = new Map();
  for (let page = 1; page <= 40; page++) ocrByPage.set(page, ocrOf("本文"));
  ocrByPage.set(30, ocrOf("第1課 ひらがな 第2課 カタカナ 第3課 まいにちのせいかつ"));
  ocrByPage.set(31, ocrOf("第3課 だけ"));
  assert.deepEqual(contentsLikePages(ocrByPage, 40), [30]);
});

// ---------------------------------------------------------------------------------------------
// Page transcription
// ---------------------------------------------------------------------------------------------

test("a page reply parses into its attributes and body", () => {
  const page = parsePageReply(
    'Here it is:\n<page number="60" printed="51" header="第1課" tab="会 L1">\n' +
      "<p><ruby>ロバート<rt>ろばあと</rt></ruby>さん</p>\n</page>",
    { pageNumber: 60 },
  );
  assert.deepEqual(
    [page.printed, page.header, page.tab, page.problems],
    ["51", "第1課", "会 L1", []],
  );
  assert.equal(page.body, "<p><ruby>ロバート<rt>ろばあと</rt></ruby>さん</p>");
});

test("a reply for the wrong page, or without a page element, is not accepted silently", () => {
  const wrong = parsePageReply('<page number="61" printed="">x</page>', { pageNumber: 60 });
  assert.match(wrong.problems[0], /says page 61, expected 60/);
  assert.throws(
    () => parsePageReply("I could not open the image.", { pageNumber: 60 }),
    /no <page>/,
  );
});

test("a reply that corrects itself is read from its last page element (Genki page 53)", () => {
  const page = parsePageReply(
    '<page number="53" printed="44"><h2>表現ノート 表現ノート</h2></page>\n\n' +
      "Wait, that heading duplicates the text. Corrected answer:\n\n" +
      '<page number="53" printed="44"><h2><ruby>表現<rt>ひょうげん</rt></ruby>ノート</h2></page>',
    { pageNumber: 53 },
  );
  assert.deepEqual(page.problems, []);
  assert.equal(page.body, "<h2><ruby>表現<rt>ひょうげん</rt></ruby>ノート</h2>");
});

test("markup that would swallow the rest of a lesson is reported", () => {
  assert.deepEqual(xhtmlProblems("<table><tr><td>a</td></tr>"), ["unclosed: <table>"]);
  assert.deepEqual(xhtmlProblems("<p>a</div>"), ["</div> closes <p>", "unclosed: <p>"]);
  assert.deepEqual(xhtmlProblems("<p>Q&A</p>"), ["unescaped & in text"]);
  assert.deepEqual(xhtmlProblems("<ruby>日本</ruby>"), ["1 <ruby> without an <rt>"]);
  assert.deepEqual(xhtmlProblems("<p>a<br/>b &amp; c</p><hr>"), []);
});

// ---------------------------------------------------------------------------------------------
// OCR cross-check
// ---------------------------------------------------------------------------------------------

// OCR lines in the body of the page (away from the margins the transcript leaves out).
const ocr = (...texts) => ({
  lines: texts.map((text, i) => ({ text, x: 0.2, y: 0.8 - i * 0.05, w: 0.5, h: 0.02 })),
});

test("furigana split into its parts, readings apart from the printed text", () => {
  const parts = transcriptParts("<p><ruby>日本<rt>にほん</rt></ruby>です</p>");
  assert.equal(parts.base.replace(/\s+/g, ""), "日本です");
  assert.equal(parts.readings, "にほん");
});

test("furigana the OCR missed is expected, not a disagreement (Genki page 60)", () => {
  const body =
    "<p>1. <ruby>メアリー<rt>めありい</rt></ruby>さんの せんこうは <ruby>ビジネス<rt>びじねす</rt></ruby>ですか。</p>";
  const check = crossCheckPage({ body, ocr: ocr("1. メアリーさんの せんこうは ビジネスですか。") });
  assert.equal(check.disagreeingChars, 0);
  assert.equal(check.furiganaChars, 8);
  assert.equal(check.flagged, false);
});

test("a dropped line is flagged, and names what was dropped", () => {
  const body = "<p>おはようございます。</p>";
  const check = crossCheckPage({
    body,
    ocr: ocr("おはようございます。", "ありがとうございます。", "すみません。"),
  });
  assert.equal(check.flagged, true);
  assert.match(check.onlyInOcr, /り/);
  assert.equal(check.onlyInTranscript, "");
});

test("printed text the OCR never saw is flagged as possibly invented", () => {
  const check = crossCheckPage({
    body: "<p>こんにちは。</p><p>きょうは いい てんきですね。</p>",
    ocr: ocr("こんにちは。"),
  });
  assert.equal(check.flagged, true);
  assert.match(check.onlyInTranscript, /て/);
});

test("an illustration's description is not invented text, but words inside it still count", () => {
  const body =
    "<p>いちじです。</p><figure><figcaption>[Illustration: a clock showing one o’clock, " +
    "with a sign reading えき]</figcaption></figure>";
  const check = crossCheckPage({ body, ocr: ocr("いちじです。", "えき") });
  assert.equal(check.disagreeingWords, 0);
  assert.equal(check.disagreeingChars, 0);
});

test("look-alike glyphs and dashes are not disagreements", () => {
  // ロ (katakana) read as 口 (kanji), small ゃ read as や, and a phone number's hyphen.
  const check = crossCheckPage({
    body: "<p>ロンドンの じゃ 283-9547</p>",
    ocr: ocr("口ンドンの じや 283—9547"),
  });
  assert.equal(check.disagreeingChars, 0);
});

// ---------------------------------------------------------------------------------------------
// The written EPUB, read back by the real parser
// ---------------------------------------------------------------------------------------------

function writtenBook(dir) {
  const page = (number, body) => ({ number, printed: String(number - 9), body });
  const entries = [
    {
      number: 11,
      label: "Lesson 1: New Friends",
      firstPage: 45,
      lastPage: 46,
      pages: [page(45, "<h2>会話 Dialogue</h2>"), page(46, "<p>はじめまして。</p>")],
    },
    {
      number: 12,
      label: "Lesson 2: Shopping",
      firstPage: 47,
      lastPage: 47,
      pages: [page(47, "<h2>会話 Dialogue</h2><p>いらっしゃいませ。</p>")],
    },
  ];
  const bytes = buildRemasteredEpub(entries, {
    title: "Test Book (remastered)",
    language: "ja",
    sourceHash: "0123456789abcdef",
    modified: "2026-09-21T00:00:00Z",
  });
  const path = join(dir, "remastered.epub");
  writeFileSync(path, bytes);
  return { path, bytes };
}

test("the remastered EPUB stores its mimetype first and uncompressed, as the spec requires", () => {
  withTempDir((dir) => {
    const { bytes } = writtenBook(dir);
    // Local header of the first entry: method at offset 8 (0 = stored), name at offset 30.
    assert.equal(bytes.readUInt16LE(8), 0);
    assert.equal(bytes.toString("utf-8", 30, 38), "mimetype");
    assert.equal(bytes.toString("utf-8", 38, 58), "application/epub+zip");
    const entries = readZip(bytes);
    assert.equal(entries[0].data.toString(), "application/epub+zip");
  });
});

test("the pipeline reads the remastered EPUB's lessons from its own nav, and calls it native", () => {
  withTempDir((dir) => {
    const { path } = writtenBook(dir);
    assert.deepEqual(
      listLessons(path).map((l) => [l.label, l.firstChapterNumber, l.lastChapterNumber]),
      [
        ["Lesson 1: New Friends", 1, 1],
        ["Lesson 2: Shopping", 2, 2],
      ],
    );
    const eligibility = assessEpubEligibility(path);
    assert.equal(eligibility.verdict, "native");
  });
});

test("each page keeps its provenance in the chapter file", () => {
  withTempDir((dir) => {
    const { bytes } = writtenBook(dir);
    const chapter = readZip(bytes)
      .find((e) => e.name === "OEBPS/entry-11.xhtml")
      .data.toString();
    assert.match(
      chapter,
      /<section class="page" id="page-46" data-source-page="46" data-printed-page="37">/,
    );
    assert.match(chapter, /<title>Lesson 1: New Friends<\/title>/);
    assert.ok(!existsSync(join(dir, "OEBPS")), "nothing unpacked beside the book");
  });
});

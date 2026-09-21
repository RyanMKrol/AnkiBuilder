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
import {
  crossCheckPage,
  transcriptParts,
  unmatchedOcrLines,
  numberingGaps,
} from "../../src/remaster/ocrCrossCheck.js";
import { compareReadings } from "../../src/remaster/compareReadings.js";
import { settlePage, settleGuard } from "../../src/remaster/settle.js";
import { parseBox, pixelRect, attachFigureImages } from "../../src/remaster/figureCrops.js";
import { buildRemasteredEpub } from "../../src/remaster/epubWriter.js";
import { remasterRoot } from "../../src/remaster/workspace.js";
import { appendJournal, readJournal, loggedRunner } from "../../src/remaster/journal.js";
import { readRunLogs } from "../../src/agents/runLog.js";
import {
  transcribeWithRetries,
  MAX_TRANSCRIBE_ATTEMPTS,
} from "../../src/remaster/transcribeRetry.js";
import { verifyRemasteredEpub, formatVerification } from "../../src/remaster/verifyRemaster.js";

async function withTempDirAsync(fn) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-remaster-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
      .find((e) => e.name === "OEBPS/chapter-11.xhtml")
      .data.toString();
    assert.match(
      chapter,
      /<section class="page" id="page-46" data-source-page="46" data-printed-page="37">/,
    );
    assert.match(chapter, /<title>Lesson 1: New Friends<\/title>/);
    assert.ok(!existsSync(join(dir, "OEBPS")), "nothing unpacked beside the book");
  });
});

// ---------------------------------------------------------------------------------------------
// Retries
// ---------------------------------------------------------------------------------------------

const goodReply = (n) => `<page number="${n}" printed=""><p>はじめまして。</p></page>`;
const refusal =
  "I can't transcribe this page word for word, because it's a copyrighted textbook page.";

test("a refused page is asked again with the same prompt, and the refusal is kept", async () => {
  const prompts = [];
  const replies = [refusal, goodReply(46)];
  const result = await transcribeWithRetries({
    pageNumber: 46,
    prompt: "PROMPT",
    run: async (prompt) => {
      prompts.push(prompt);
      return replies.shift();
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.page.body, "<p>はじめまして。</p>");
  assert.deepEqual(prompts, ["PROMPT", "PROMPT"], "retrying is not rewording");
  assert.equal(result.failures[0].raw, refusal);
  assert.match(result.failures[0].reason, /no <page> element/);
});

test("a page that fails every attempt stops at the limit and says why each time", async () => {
  let calls = 0;
  const result = await transcribeWithRetries({
    pageNumber: 46,
    prompt: "P",
    run: async () => {
      calls++;
      if (calls === 2) throw new Error("claude -p timed out after 600000 ms");
      return calls === 3 ? '<page number="46"><table></page>' : refusal;
    },
  });
  assert.equal(calls, MAX_TRANSCRIBE_ATTEMPTS);
  assert.equal(result.page, null);
  assert.deepEqual(
    result.failures.map((f) => [f.attempt, f.raw === null]),
    [
      [1, false],
      [2, true],
      [3, false],
    ],
  );
  assert.match(result.failures[1].reason, /timed out/);
  assert.match(result.failures[2].reason, /unclosed: <table>/);
});

test("a usage-limit refusal is not retried: it ends the run", async () => {
  let calls = 0;
  const quota = Object.assign(new Error("usage limit appears to be reached"), {
    quotaExhausted: true,
  });
  await assert.rejects(
    () =>
      transcribeWithRetries({
        pageNumber: 46,
        prompt: "P",
        run: async () => {
          calls++;
          throw quota;
        },
      }),
    /usage limit/,
  );
  assert.equal(calls, 1);
});

// ---------------------------------------------------------------------------------------------
// End-to-end verification of the written book
// ---------------------------------------------------------------------------------------------

const lesson1 = { number: 11, label: "Lesson 1: New Friends", firstPage: 45, lastPage: 46 };
const lesson2 = { number: 12, label: "Lesson 2: Shopping", firstPage: 47, lastPage: 47 };

function bookOf(dir, entries, name = "book.epub") {
  const path = join(dir, name);
  writeFileSync(
    path,
    buildRemasteredEpub(entries, {
      title: "T",
      language: "ja",
      sourceHash: "0123456789abcdef",
      modified: "2000-01-01T00:00:00Z",
    }),
  );
  return path;
}

const pagesFor = (entry, body = (n) => `<p>ページ${n}</p>`) =>
  Array.from({ length: entry.lastPage - entry.firstPage + 1 }, (_, i) => ({
    number: entry.firstPage + i,
    printed: "",
    body: body(entry.firstPage + i),
  }));

test("verify passes a complete book and counts its pages", () => {
  withTempDir((dir) => {
    const path = bookOf(dir, [
      { ...lesson1, pages: pagesFor(lesson1) },
      { ...lesson2, pages: pagesFor(lesson2) },
    ]);
    const result = verifyRemasteredEpub(path, { expected: [lesson1, lesson2], bookPages: 3 });
    assert.deepEqual(result.problems, []);
    assert.equal(result.pagesPresent, 3);
    assert.match(formatVerification(result)[0], /ok.*every chapter of the book \(3 pages\)/);
  });
});

test("verify catches a page that is missing from a lesson", () => {
  withTempDir((dir) => {
    const pages = pagesFor(lesson1).filter((p) => p.number !== 46);
    const path = bookOf(dir, [{ ...lesson1, pages }]);
    const { problems } = verifyRemasteredEpub(path, { expected: [lesson1], bookPages: 2 });
    assert.deepEqual(problems, ['"Lesson 1: New Friends" is missing page(s) 46']);
  });
});

test("verify catches a placeholder, a repeated page and a page out of order", () => {
  withTempDir((dir) => {
    const placeholder = pagesFor(lesson1, (n) =>
      n === 46 ? '<p class="missing-page">[Page 46 was not transcribed.]</p>' : "<p>あ</p>",
    );
    const repeated = [...pagesFor(lesson1), pagesFor(lesson1)[0]];
    const reversed = [...pagesFor(lesson1)].reverse();
    for (const [pages, message] of [
      [placeholder, /page 46 is a placeholder/],
      [repeated, /appear more than once: 45/],
      [reversed, /out of order: 46, 45/],
    ]) {
      const path = bookOf(dir, [{ ...lesson1, pages }]);
      const { problems } = verifyRemasteredEpub(path, { expected: [lesson1], bookPages: 2 });
      assert.match(problems.join("\n"), message);
    }
  });
});

test("verify catches a whole lesson missing from a book that claims to be complete", () => {
  withTempDir((dir) => {
    const path = bookOf(dir, [{ ...lesson1, pages: pagesFor(lesson1) }]);
    const { problems } = verifyRemasteredEpub(path, { expected: [lesson1, lesson2], bookPages: 3 });
    assert.match(problems[0], /nav lists 1 lesson\(s\).*expected 2/);
    assert.equal(problems[1], '"Lesson 2: Shopping" has no chapter file');
  });
});

test("a page with no text is noted, not failed: books have blank pages", () => {
  withTempDir((dir) => {
    const pages = pagesFor(lesson1, (n) => (n === 46 ? "" : "<p>あ</p>"));
    const path = bookOf(dir, [{ ...lesson1, pages }]);
    const result = verifyRemasteredEpub(path, { expected: [lesson1], bookPages: 2 });
    assert.deepEqual(result.problems, []);
    assert.match(result.notes[0], /page 46 has no text/);
  });
});

// ---------------------------------------------------------------------------------------------
// Two readings, compared and settled
// ---------------------------------------------------------------------------------------------

test("two faithful readings agree despite markup, case, punctuation and ruby grouping", () => {
  const a =
    "<h2>ADDITIONAL VOCABULARY</h2><p>Mearii: Hajimemashite.</p>" +
    "<p><ruby>表現<rt>ひょうげん</rt></ruby>ノート</p>";
  const b =
    "<table><tr><td>Additional Vocabulary</td></tr></table><p>Mearii Hajimemashite</p>" +
    "<p><ruby>表<rt>ひょう</rt></ruby><ruby>現<rt>げん</rt></ruby>ノート</p>";
  assert.equal(compareReadings(a, b).agrees, true);
});

test("the same content in a different order is a move, not a disagreement (Genki page 64)", () => {
  const a = "<td>8 はっぷん／はちふん</td><td>18 じゅうはっぷん</td>";
  const b = "<td>8 はっぷん</td><td>18 じゅうはっぷん</td><td>はちふん</td>";
  const result = compareReadings(a, b);
  assert.equal(result.agrees, true);
  assert.ok(result.moved > 0);
});

test("an extra kana and a dropped line number are disagreements (Genki pages 56 and 45)", () => {
  const typo = compareReadings("<p>7 ななさい</p>", "<p>7 なななさい</p>");
  assert.equal(typo.agrees, false);
  assert.equal(typo.differences[0].b, "な");
  const dropped = compareReadings("<p>1 たけし：こんにちは。</p>", "<p>たけし：こんにちは。</p>");
  assert.equal(dropped.differences[0].a, "1");
});

test("a furigana difference is caught even when the printed text agrees", () => {
  const a = "<p><ruby>第1課<rt>だいか</rt></ruby></p>";
  const b = "<p><ruby>第1課<rt>だいいっか</rt></ruby></p>";
  const result = compareReadings(a, b);
  assert.equal(result.differences[0].stream, "furigana");
});

test("illustration descriptions differ between runs and are not compared", () => {
  const a = "<p>いちじです。</p><figure><figcaption>[Illustration: a clock]</figcaption></figure>";
  const b =
    '<p>いちじです。</p><figure data-box="0.1,0.1,0.2,0.2"><figcaption>[Illustration: ' +
    "an alarm clock at one]</figcaption></figure>";
  assert.equal(compareReadings(a, b).agrees, true);
});

test("pages that agree keep reading B without a model call", async () => {
  const readingB = { body: '<p>はい。</p><figure data-box="0.1,0.1,0.2,0.2"></figure>' };
  const result = await settlePage({
    pageNumber: 49,
    readingA: { body: "<p>はい。</p>" },
    readingB,
    prompt: () => "unused",
    run: async () => assert.fail("no call for a page that agrees"),
  });
  assert.equal(result.source, "agreed");
  assert.equal(result.page, readingB);
});

test("an adjudicated page is accepted when it only chooses between the readings", async () => {
  const result = await settlePage({
    pageNumber: 56,
    readingA: { body: "<p>7 ななさい。ろくさい。</p>" },
    readingB: { body: "<p>7 なななさい。ろくさい。</p>" },
    prompt: (differences) => `settle ${differences.length}`,
    run: async () => '<page number="56"><p>7 ななさい。ろくさい。</p></page>',
  });
  assert.equal(result.source, "settled");
  assert.equal(result.page.body, "<p>7 ななさい。ろくさい。</p>");
});

test("an adjudicator that rewrites the page is rejected, not trusted", async () => {
  const readingA = { body: "<p>たけし：こんにちは。きむら たけしです。</p>" };
  const readingB = { body: "<p>たけし：こんにちは。きむら たけしです</p>" };
  const invented = await settlePage({
    pageNumber: 45,
    readingA: { body: "<p>1 たけし：こんにちは。</p>" },
    readingB: { body: "<p>たけし：こんにちは。</p>" },
    prompt: () => "p",
    run: async () =>
      '<page number="45"><p>1 たけし：こんにちは。はじめまして、よろしく。</p></page>',
  });
  assert.equal(invented.source, "unsettled");
  assert.match(invented.problems[0], /adds \d+ text character\(s\) that neither reading has/);

  const dropped = settleGuard("<p>たけし：</p>", readingA.body, readingB.body);
  assert.match(dropped[0], /drops \d+ text character\(s\) both readings agreed on/);
});

// ---------------------------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------------------------

test("a figure box is parsed, padded and clamped to the page", () => {
  assert.deepEqual(parseBox("0.19,0.81,0.30,0.90"), [0.19, 0.81, 0.3, 0.9]);
  for (const bad of ["", "0.1,0.2,0.3", "0.3,0.1,0.2,0.4", "0.1,0.1,1.2,0.4", "a,b,c,d"]) {
    assert.equal(parseBox(bad), null, bad);
  }
  assert.deepEqual(pixelRect([0, 0.5, 0.5, 1], { width: 1000, height: 2000 }, 0.01), {
    x: 0,
    y: 980,
    width: 510,
    height: 1020,
  });
});

test("each boxed figure gets its cropped image; an unboxed one keeps only its caption", () => {
  withTempDir((dir) => {
    const crops = [];
    const body =
      '<figure data-box="0.1,0.1,0.3,0.3"><figcaption>[Illustration: a "clock" &amp; hands]</figcaption></figure>' +
      "<figure><figcaption>[Illustration: no box]</figcaption></figure>";
    const result = attachFigureImages(body, {
      pageNumber: 61,
      stem: (n) => `page-0${n}`,
      cropsDir: dir,
      pageSize: { width: 1000, height: 1000 },
      crop: (rect, dest) => {
        crops.push(rect);
        writeFileSync(dest, "jpeg");
      },
    });
    assert.equal(crops.length, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.images, [
      { name: "images/page-061-fig-1.jpg", path: join(dir, "page-061-fig-1.jpg") },
    ]);
    assert.match(
      result.body,
      /<figure data-box="[^"]*"><img src="images\/page-061-fig-1.jpg" alt="Illustration: a clock amp; hands"\/>/,
    );
    // A crop already on disk is reused, not cut again.
    attachFigureImages(body, {
      pageNumber: 61,
      stem: (n) => `page-0${n}`,
      cropsDir: dir,
      pageSize: { width: 1000, height: 1000 },
      crop: () => assert.fail("reused"),
    });
  });
});

test("images are packed into the book, and verify catches one that is not", () => {
  withTempDir((dir) => {
    const page = {
      number: 45,
      printed: "",
      body: '<figure><img src="images/page-045-fig-1.jpg" alt=""/></figure><p>あ</p>',
    };
    const lesson = { number: 11, label: "Lesson 1", firstPage: 45, lastPage: 45 };
    const withImage = bookOf(dir, [
      {
        ...lesson,
        pages: [page],
        images: [{ name: "images/page-045-fig-1.jpg", data: Buffer.from("jpeg") }],
      },
    ]);
    const packed = readZip(readFileSync(withImage));
    assert.ok(packed.some((e) => e.name === "OEBPS/images/page-045-fig-1.jpg"));
    assert.match(
      packed.find((e) => e.name === "OEBPS/content.opf").data.toString(),
      /href="images\/page-045-fig-1.jpg" media-type="image\/jpeg"/,
    );
    assert.deepEqual(
      verifyRemasteredEpub(withImage, { expected: [lesson], bookPages: 1 }).problems,
      [],
    );

    const withoutImage = bookOf(dir, [{ ...lesson, pages: [page] }], "no-image.epub");
    assert.deepEqual(
      verifyRemasteredEpub(withoutImage, { expected: [lesson], bookPages: 1 }).problems,
      ['"Lesson 1" shows images/page-045-fig-1.jpg, which is not in the book'],
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Line-level OCR check
// ---------------------------------------------------------------------------------------------

test("a dropped line the character counts cannot see is found by the line check", () => {
  const lines = [
    "たけし：こんにちは。きむら たけしです。",
    "メアリー：メアリー・ハートです。あのう、りゅうがくせいですか。",
    "たけし：いいえ、にほんじんです。",
    "メアリー：そうですか。なんねんせいですか。",
    "たけし：よねんせいです。",
  ];
  const full = lines.map((l) => `<p>${l}</p>`).join("");
  const ocrOfPage = ocr(...lines);
  assert.deepEqual(unmatchedOcrLines({ body: full, ocr: ocrOfPage }), []);
  const oneDropped = full.replace("<p>たけし：いいえ、にほんじんです。</p>", "");
  const missing = unmatchedOcrLines({ body: oneDropped, ocr: ocrOfPage });
  assert.deepEqual(
    missing.map((m) => m.text),
    ["たけし：いいえ、にほんじんです。"],
  );
  assert.equal(crossCheckPage({ body: oneDropped, ocr: ocrOfPage }).flagged, true);
});

test("an OCR misread of a line the transcript has is still found", () => {
  // The OCR read メアリー as メテリー and ハート as ハード (Genki page 63).
  const body = "<p>A：メアリー・ハートです。</p>";
  assert.deepEqual(unmatchedOcrLines({ body, ocr: ocr("A：メテリー・ハードです。") }), []);
});

test("a gap in numbered items is reported", () => {
  assert.deepEqual(numberingGaps("<h3>C</h3><p>1. a</p><p>2. b</p><p>4. d</p>"), [
    "2 is followed by 4",
  ]);
  assert.deepEqual(numberingGaps("<h3>C</h3><p>1. a</p><p>2. b</p><h3>D</h3><p>1. c</p>"), []);
});

// ---------------------------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------------------------

test("every call is logged in full, including one that throws, and the journal points at it", async () => {
  await withTempDirAsync(async (dir) => {
    let calls = 0;
    const logged = loggedRunner(dir, async () => (calls++ ? refusal : goodReply(46)), {
      role: "transcribe-a",
      model: "claude-sonnet-5",
      effort: "high",
      context: () => ({ page: 46, attempt: calls }),
    });
    await logged.run("PROMPT");
    const first = logged.lastLog();
    await logged.run("PROMPT");
    appendJournal(dir, { step: "transcribe", page: 46, agentLog: logged.lastLog() });

    const failing = loggedRunner(
      dir,
      async () => {
        throw new Error("claude -p timed out");
      },
      { role: "settle", model: "claude-opus-5", effort: "high", context: () => ({ page: 56 }) },
    );
    await assert.rejects(() => failing.run("P"), /timed out/);

    assert.equal(first, "01-transcribe-a.json");
    assert.equal(failing.lastLog(), "03-settle-FAILED.json");
    const refused = JSON.parse(readFileSync(join(dir, "agent-logs", "02-transcribe-a.json")));
    assert.equal(refused.response, refusal);
    assert.equal(refused.model, "claude-sonnet-5");
    assert.deepEqual(refused.context, { page: 46, attempt: 2 });
    assert.deepEqual(readJournal(dir)[0].agentLog, "02-transcribe-a.json");
    // The same format and place as a unit's agent transcripts, so the existing reader reads them.
    assert.deepEqual(
      readRunLogs(dir).map((l) => [l.file, l.ok]),
      [
        ["01-transcribe-a.json", true],
        ["02-transcribe-a.json", true],
        ["03-settle-FAILED.json", false],
      ],
    );
  });
});

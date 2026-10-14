import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Buffer } from "buffer";
import { buildFixtureEpub } from "../support/epubFixtures.js";
import { readZip } from "../../src/deck/zip.js";
import { listChapters } from "../../src/corpus/epubArchive.js";
import { findInlineGlyphImages } from "../../src/corpus/inlineGlyphs.js";
import { judgeShape } from "../../src/corpus/epubEligibility.js";
import { buildGlyphInventory } from "../../src/glyphs/inventory.js";
import {
  parseGlyphReply,
  ocrVerdict,
  acceptedWithoutSettle,
  foldSmallKana,
  renderReadPrompt,
  renderSettlePrompt,
} from "../../src/glyphs/glyphRead.js";
import { rewriteChapter, rewriteEpub, glyphMarkup } from "../../src/glyphs/rewriteEpub.js";
import { glyphPaths } from "../../src/glyphs/workspace.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "anki-builder-glyphs-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The shape of a real line from Japanese for Busy People Book 2 (4th edition): 食べもの with 食/た
// printed as a picture, so the text around it reads "べもの".
const DIALOGUE_LINE =
  '<p class="d"><span xml:lang="ja">にほんは　</span><img src="../images/ta.jpg" alt="" class="g"/>' +
  '<span xml:lang="ja">べものが　おいしい</span></p>';

// ---------------------------------------------------------------------------------------------
// Finding the pictures
// ---------------------------------------------------------------------------------------------

test("a picture inside a line of Japanese is found, with its exact tag and archive path", () => {
  const found = findInlineGlyphImages(DIALOGUE_LINE, { chapterHref: "OEBPS/text/c1.xhtml" });
  assert.equal(found.length, 1);
  assert.equal(found[0].archivePath, "OEBPS/images/ta.jpg");
  assert.equal(
    DIALOGUE_LINE.slice(found[0].index, found[0].index + found[0].tag.length),
    found[0].tag,
  );
});

test("a picture with no Japanese around it is found only in a lang=ja element", () => {
  const vocabCell =
    '<td><p><span lang="ja"><span><img src="ka.jpg" alt="jap431"/></span></span></p></td>';
  assert.equal(findInlineGlyphImages(vocabCell).length, 1);
  assert.equal(findInlineGlyphImages('<p>An English line <img src="x.jpg" alt=""/></p>').length, 0);
});

test("a picture whose alt already holds the Japanese is not a gap", () => {
  const html = '<p>きょうは <img src="x.jpg" alt="日曜日"/> です</p>';
  assert.equal(findInlineGlyphImages(html).length, 0);
});

test("anyText catches a speaker printed as a picture on a line of its own", () => {
  const speaker = '<p class="s"><span class="n"><img src="kato.jpg" alt=""/></span> :</p>';
  assert.equal(findInlineGlyphImages(speaker).length, 0);
  assert.equal(findInlineGlyphImages(speaker, { anyText: true }).length, 1);
});

test("a picture in a block with no text at all (an illustration) is never collected", () => {
  const figure =
    '<div class="f"><img src="drawing.jpg" alt=""/></div><p>ふたりは はなしています。</p>';
  assert.equal(findInlineGlyphImages(figure, { anyText: true }).length, 0);
});

test("a commented-out picture is ignored and offsets still match the real file", () => {
  const html = `<!-- <p>あ<img src="old.jpg"/></p> -->${DIALOGUE_LINE}`;
  const found = findInlineGlyphImages(html);
  assert.equal(found.length, 1);
  assert.equal(html.slice(found[0].index, found[0].index + found[0].tag.length), found[0].tag);
});

// ---------------------------------------------------------------------------------------------
// The eligibility verdict
// ---------------------------------------------------------------------------------------------

function shape({ glyphs, navSource = "nav", lessons = 20 }) {
  return {
    spine: [{ textLength: 400000 }],
    totals: {
      distinctImages: 2800,
      contentBytes: 2000000,
      distinctGlyphImages: glyphs,
      glyphImageRefs: glyphs * 3,
    },
    nav: { source: navSource },
    lessons: Array.from({ length: lessons }, (_, i) => ({ label: `Lesson ${i + 1}` })),
  };
}

test("a text book with hundreds of pictured words says glyphs, not native", () => {
  const verdict = judgeShape(shape({ glyphs: 1556 }));
  assert.equal(verdict.verdict, "glyphs");
  assert.match(verdict.reasons[0], /1556 distinct picture/);
});

test("a handful of inline pictures (bullets, stroke-order crops) stays native", () => {
  // Book 1 has 17 and the converted Genki books 75 and 82 (measured 2026-10-15).
  assert.equal(judgeShape(shape({ glyphs: 82 })).verdict, "native");
});

test("pictured words on top of a missing table of contents are blocked", () => {
  const verdict = judgeShape(shape({ glyphs: 1556, navSource: null, lessons: 0 }));
  assert.equal(verdict.verdict, "blocked");
  assert.equal(verdict.reasons.length, 2);
});

// ---------------------------------------------------------------------------------------------
// Reading replies
// ---------------------------------------------------------------------------------------------

test("a reply is parsed from its last <glyphs> block, with spaces stripped from readings", () => {
  const raw =
    '<glyphs>[{"id":"g-0001","kind":"text","text":"x","reading":"x"}]</glyphs> Wait, corrected:\n' +
    '<glyphs>[{"id":"g-0001","kind":"text","text":"六本木","reading":"ろっぽん ぎ","note":""},' +
    '{"id":"g-0002","kind":"other","text":"■","reading":"","note":"a bullet"}]</glyphs>';
  const { entries, problems } = parseGlyphReply(raw, ["g-0001", "g-0002"]);
  assert.deepEqual(problems, []);
  assert.deepEqual(entries.get("g-0001"), {
    kind: "text",
    text: "六本木",
    reading: "ろっぽんぎ",
    note: "",
  });
  assert.equal(entries.get("g-0002").text, "", "an 'other' picture carries no text");
});

test("a missing id, a duplicate and a reading that is not kana are all reported", () => {
  const raw =
    '<glyphs>[{"id":"g-0001","kind":"text","text":"食","reading":"ta"},' +
    '{"id":"g-0002","kind":"text","text":"飲","reading":"の"},' +
    '{"id":"g-0002","kind":"text","text":"飲","reading":"の"}]</glyphs>';
  const { entries, problems } = parseGlyphReply(raw, ["g-0001", "g-0002", "g-0003"]);
  assert.deepEqual([...entries.keys()], ["g-0002"]);
  assert.ok(problems.some((p) => /g-0001: the reading "ta" is not kana/.test(p)));
  assert.ok(problems.some((p) => /g-0002 appears twice/.test(p)));
  assert.ok(problems.some((p) => /g-0003 is missing/.test(p)));
});

test("a reply with no block, or a broken one, keeps nothing", () => {
  assert.equal(parseGlyphReply("I could not open the files.", ["g-0001"]).entries.size, 0);
  assert.equal(parseGlyphReply("<glyphs>[{</glyphs>", ["g-0001"]).entries.size, 0);
});

// ---------------------------------------------------------------------------------------------
// Three readers
// ---------------------------------------------------------------------------------------------

const ocrOf = (...lines) => ({
  lines: lines.map((text, i) => ({ text, x: 0, y: 1 - i * 0.5, w: 1, h: 0.4 })),
});

test("the OCR's full-size small kana still agree with a correct reading", () => {
  assert.equal(foldSmallKana("きょねん"), "きよねん");
  const reading = { kind: "text", text: "去年", reading: "きょねん" };
  assert.equal(ocrVerdict(ocrOf("去年", "きよねん"), reading), "agrees");
  assert.equal(ocrVerdict(ocrOf("去年", "きよねん"), { ...reading, text: "去月" }), "differs");
  assert.equal(ocrVerdict({ lines: [] }, reading), "silent");
});

test("a reading printed above the word reads reading-first and still agrees", () => {
  const reading = { kind: "text", text: "駅員", reading: "えきいん" };
  assert.equal(ocrVerdict(ocrOf("えきいん", "駅員"), reading), "agrees");
});

test("only a picture all three readers agree on skips the settle pass", () => {
  const a = { kind: "text", text: "会", reading: "あ" };
  assert.equal(acceptedWithoutSettle(a, { ...a }, ocrOf("会", "あ")), true);
  assert.equal(acceptedWithoutSettle(a, { ...a }, { lines: [] }), false, "OCR silent");
  assert.equal(acceptedWithoutSettle(a, { ...a, text: "合" }, ocrOf("会", "あ")), false);
  const other = { kind: "other", text: "", reading: "" };
  assert.equal(acceptedWithoutSettle(other, { ...other }, { lines: [] }), true);
});

test("the readers are not shown the sentence; the settle pass is", () => {
  const glyph = {
    id: "g-0005",
    imagePath: "/tmp/g-0005.jpg",
    uses: 4,
    contexts: [{ before: "にほんは ", after: "べものが おいしい" }],
  };
  const read = renderReadPrompt({ bookTitle: "Book", batch: [glyph] });
  assert.match(read, /g-0005: \/tmp\/g-0005\.jpg/);
  assert.doesNotMatch(read, /べものが/);
  const settle = renderSettlePrompt({
    bookTitle: "Book",
    items: [{ glyph, a: { kind: "text", text: "食", reading: "た" }, b: null, ocr: null }],
  });
  assert.match(settle, /にほんは \[\?\]べものが おいしい/);
  assert.match(settle, /B: \(none\)/);
  assert.match(settle, /OCR, top line first: \(nothing read\)/);
});

// ---------------------------------------------------------------------------------------------
// Writing the book back
// ---------------------------------------------------------------------------------------------

test("a pictured word becomes ruby where it stood, and nothing else changes", () => {
  const readingFor = (path) =>
    path === "OEBPS/images/ta.jpg" ? { kind: "text", text: "食", reading: "た" } : null;
  const { content, replaced, kept } = rewriteChapter(DIALOGUE_LINE, {
    chapterHref: "OEBPS/text/c1.xhtml",
    readingFor,
  });
  assert.equal(replaced, 1);
  assert.equal(kept, 0);
  assert.equal(content, DIALOGUE_LINE.replace(/<img[^>]*>/, "<ruby>食<rt>た</rt></ruby>"));
});

test("a picture read as not writing, or with no reading at all, stays a picture", () => {
  const line = '<p>CAN-DO <img src="icon.jpg" alt=""/> できます</p>';
  const other = rewriteChapter(line, { readingFor: () => ({ kind: "other" }) });
  assert.equal(other.content, line);
  assert.equal(other.kept, 1);
  assert.equal(rewriteChapter(line, { readingFor: () => null }).content, line);
});

test("a word printed with no reading is plain text, escaped", () => {
  assert.equal(glyphMarkup({ kind: "text", text: "A&B", reading: "" }), "A&amp;B");
});

test("the whole book: every use replaced, mimetype first and stored, no pictures left", () =>
  withTempDir((dir) => {
    const picture = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const sameBytes = Buffer.from(picture);
    // Enough pictured words to trip the check, all one picture used from two file names.
    const lines = Array.from(
      { length: 320 },
      (_, i) =>
        `<p>にほんは <img src="img/g${i}.jpg" alt=""/>べものが <img src="img/dup.jpg" alt=""/></p>`,
    ).join("\n");
    const chapter = `<html xmlns="http://www.w3.org/1999/xhtml"><body>${lines}</body></html>`;
    const images = Array.from({ length: 320 }, (_, i) => ({
      name: `OEBPS/img/g${i}.jpg`,
      content: Buffer.concat([picture, Buffer.from([i % 256, Math.floor(i / 256)])]),
    }));
    const epub = buildFixtureEpub(dir, {
      manifestItems: [{ id: "c1", href: "c1.xhtml" }],
      spineIdrefs: ["c1"],
      dcTitles: ["Fixture"],
      extraFiles: [
        { name: "mimetype", content: "application/epub+zip" },
        { name: "OEBPS/c1.xhtml", content: chapter },
        { name: "OEBPS/img/dup.jpg", content: sameBytes },
        ...images,
      ],
    });
    const inventory = buildGlyphInventory(epub);
    assert.equal(inventory.uses, 640);
    assert.equal(inventory.glyphs.length, 321, "one picture per distinct set of bytes");
    assert.deepEqual(inventory.glyphs[0].contexts[0], {
      href: "OEBPS/c1.xhtml",
      before: "にほんは ",
      after: "べものが □",
    });

    const readings = new Map(
      inventory.glyphs.map((g) => [g.sha, { kind: "text", text: "食", reading: "た" }]),
    );
    const entries = readZip(readFileSync(epub));
    const { buffer, files } = rewriteEpub(entries, listChapters(epub).chapters, readings);
    assert.deepEqual(files, [{ href: "OEBPS/c1.xhtml", replaced: 640, kept: 0 }]);
    const out = readZip(buffer);
    assert.equal(out[0].name, "mimetype");
    assert.equal(buffer.readUInt16LE(8), 0, "mimetype is stored, not deflated");
    const text = out.find((e) => e.name === "OEBPS/c1.xhtml").data.toString("utf-8");
    assert.doesNotMatch(text, /<img/);
    assert.equal(text.split("<ruby>食<rt>た</rt></ruby>").length - 1, 640);
    const fixed = join(dir, "fixed.epub");
    writeFileSync(fixed, buffer);
    assert.equal(buildGlyphInventory(fixed).uses, 0);
  }));

test("the workspace lives under the library, which tests redirect to scratch", () => {
  const paths = glyphPaths("abc123", { libraryHomeDir: "/scratch/lib" });
  assert.equal(paths.root, "/scratch/lib/glyphs/abc123");
  assert.equal(paths.reading("b"), "/scratch/lib/glyphs/abc123/reading-b.json");
});

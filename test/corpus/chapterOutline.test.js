import test from "node:test";
import assert from "node:assert/strict";
import {
  chapterOutline,
  parseHeadings,
  parseNumberedBlocks,
  countImages,
} from "../../src/corpus/chapterOutline.js";

test("parseHeadings reads a title nested inside other tags", () => {
  // This publisher writes <h2><span><b>EXERCISES</b></span></h2>. Matching `>([^<]*)<` gives an empty
  // title for every heading in the book, which reads as a chapter with no structure at all.
  const heads = parseHeadings(
    '<h2 class="x"><span><b>EXERCISES</b></span></h2><h3><b>VOCABULARY</b></h3>',
  );
  assert.deepEqual(
    heads.map((h) => [h.level, h.title]),
    [
      [2, "EXERCISES"],
      [3, "VOCABULARY"],
    ],
  );
});

test("parseNumberedBlocks finds markers INSIDE a filename, after an underscore", () => {
  // The bug this guards: `\benum` cannot match `_enum`, because `_` is a word character. It returned
  // zero blocks for a chapter holding twelve — a silent zero, in the check written to stop those.
  const blocks = parseNumberedBlocks(
    '<img src="../images/9781568366333_9781568366340_enum-VII.jpg"/><img src="x_wnum-II.jpg"/>',
  );
  assert.deepEqual(
    blocks.map((b) => [b.kind, b.numeral]),
    [
      ["EXERCISES", "VII"],
      ["WORD POWER", "II"],
    ],
  );
});

test("chapterOutline reports the full numbered run, which is what makes a short read visible", () => {
  const html =
    "<h2><b>EXERCISES</b></h2>" +
    ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
      .map((r) => `<img src="a_enum-${r}.jpg"/>`)
      .join("");
  const { groups } = chapterOutline(html);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].numerals, ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]);
  assert.deepEqual(groups[0].missing, []);
});

test("chapterOutline names a HOLE in the numbering — the block nobody read", () => {
  const html = ["I", "II", "III", "V"].map((r) => `<img src="a_enum-${r}.jpg"/>`).join("");
  const { groups } = chapterOutline(html);
  assert.deepEqual(groups[0].missing, ["IV"]);
});

test("chapterOutline attributes each block to the section holding it, and sizes each section", () => {
  const html =
    "<h2><b>GRAMMAR</b></h2><p>rules and more rules</p>" +
    '<h2><b>EXERCISES</b></h2><img src="a_enum-I.jpg"/><p>drill</p><img src="a_enum-II.jpg"/>';
  const { sections, chars } = chapterOutline(html);
  assert.deepEqual(
    sections.map((s) => [s.title, s.blocks]),
    [
      ["GRAMMAR", []],
      ["EXERCISES", ["I", "II"]],
    ],
  );
  assert.ok(sections[0].chars > 0 && chars > 0);
});

test("a chapter with no headings or blocks is reported as empty, not as an error", () => {
  const { sections, groups, chars } = chapterOutline("<p>a stub page</p>");
  assert.deepEqual(sections, []);
  assert.deepEqual(groups, []);
  assert.equal(chars, "a stub page".length);
});

test("countImages is generic — it is the signal for a chapter whose content is pictures", () => {
  // This book's kana tables are ~47 characters of text and a full-page figure. Without an image
  // count that reads as an empty chapter, which is the same miss in a different costume.
  assert.equal(countImages('<img src="a.jpg"/><p>hi</p><IMG SRC="b.png"/>'), 2);
  assert.equal(countImages("<p>no pictures here</p>"), 0);
});

test("a book that numbers nothing yields no groups, and that is not an error", () => {
  // The numbered runs are ONE publisher's convention. A novel, or this book's own front matter, has
  // none — and an empty `groups` must read as "this book does not number things", never as "there is
  // nothing to read here". The bounds of the file are the completeness guarantee, not the numbering.
  const novel = "<h1>Chapter One</h1><p>It was a dark and stormy night.</p>";
  const { groups, sections, chars, images } = chapterOutline(novel);
  assert.deepEqual(groups, []);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, "Chapter One");
  assert.ok(chars > 0);
  assert.equal(images, 0);
});

test("a chapter with no headings at all still reports its size and images", () => {
  // Headings are generic but not guaranteed: plenty of EPUBs style their titles with <p class=…>.
  // Everything the completeness guarantee rests on has to survive that.
  const { sections, chars, images } = chapterOutline('<p class="head">TITLE</p><img src="x.jpg"/>');
  assert.deepEqual(sections, []);
  assert.ok(chars > 0);
  assert.equal(images, 1);
});

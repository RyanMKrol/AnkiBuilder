import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  imageSrcsIn,
  resolveChapterImages,
  conventionsNotesFor,
} from "../../src/corpus/chapterImages.js";

test("it finds <img> and SVG-wrapped images, and ignores what is not a local file", () => {
  const html = `
    <img src="../images/a.jpg"/>
    <img src='../images/b.jpg'/>
    <svg><image xlink:href="../images/c.jpg"/></svg>
    <image href="../images/d.jpg"/>
    <img src="https://example.com/e.jpg"/>
    <img src="data:image/png;base64,AAAA"/>
    <img src="../images/a.jpg"/>
  `;
  assert.deepEqual(imageSrcsIn(html), [
    "../images/a.jpg",
    "../images/b.jpg",
    "../images/c.jpg",
    "../images/d.jpg",
  ]);
});

test("paths resolve against the CHAPTER file's directory, the way the extractor placed them", () => {
  const root = mkdtempSync(join(tmpdir(), "anki-chapimg-"));
  mkdirSync(join(root, "chapters"));
  mkdirSync(join(root, "images"));
  writeFileSync(join(root, "images", "a.jpg"), "bytes");
  const chapterPath = join(root, "chapters", "14.xhtml");

  const found = resolveChapterImages(
    chapterPath,
    '<img src="../images/a.jpg"/><img src="../images/gone.jpg"/>',
  );

  assert.deepEqual(
    found.map((f) => [f.path, f.exists]),
    [
      [join(root, "images", "a.jpg"), true],
      [join(root, "images", "gone.jpg"), false],
    ],
  );
  assert.equal(found[0].bytes, 5);
  assert.equal(found[1].bytes, null);
});

test("conventions notes are quoted, never turned into a verdict", () => {
  const conventions = [
    "## Image-Embedded Content",
    "- Ch. 14: `Page_004_Image_0001.jpg` — world map tied to the countries vocab list.",
    "- Ch. 19: `Page_040_Image_0002.jpg` — counters reference table.",
    "- `audio-016.jpg` — speaker icon, skip without opening.",
  ].join("\n");
  const images = [
    { src: "../images/Page_004_Image_0001.jpg" },
    { src: "../images/audio-016.jpg" },
    { src: "../images/unknown.jpg" },
  ];

  const { named, chapterLines } = conventionsNotesFor(conventions, { chapterNumber: 14, images });

  assert.match(named.get("../images/Page_004_Image_0001.jpg")[0], /world map/);
  assert.match(named.get("../images/audio-016.jpg")[0], /speaker icon/);
  assert.equal(named.has("../images/unknown.jpg"), false);
  assert.equal(chapterLines.length, 1);
  assert.match(chapterLines[0], /Ch\. 14/);
});

test("a book with no cached conventions reports nothing rather than throwing", () => {
  const { named, chapterLines } = conventionsNotesFor(null, { chapterNumber: 3, images: [] });
  assert.equal(named.size, 0);
  assert.deepEqual(chapterLines, []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { diffImageCoverage, extractChapterViaLlm } from "../../src/corpus/epubLlmExtract.js";

const CHAPTER_HTML = `
<html><body>
  <h2>WORD POWER</h2>
  <img src="images/p076.jpg" alt=""/>
  <p>text</p>
  <img src="images/p077.jpg"/>
  <svg><image xlink:href="images/scan.png"/></svg>
  <img src="https://example.com/remote.png"/>
</body></html>
`;

function withChapterFile(html, fn) {
  const dir = mkdtempSync(join(tmpdir(), "image-coverage-"));
  const path = join(dir, "chapter.xhtml");
  writeFileSync(path, html);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("every locally referenced image is in scope, remote ones are not", () => {
  const diff = diffImageCoverage(CHAPTER_HTML, null);
  assert.deepEqual(diff.referenced, ["images/p076.jpg", "images/p077.jpg", "images/scan.png"]);
});

test("no coverage report means every image is unaccounted for, and says so", () => {
  const diff = diffImageCoverage(CHAPTER_HTML, null);
  assert.equal(diff.reported, false);
  assert.equal(diff.unaccountedFor.length, 3);
});

// The model reports whatever path it resolved and opened, which is almost never character-identical
// to the src in the markup.
test("images are matched on basename, so an absolute path still counts", () => {
  const diff = diffImageCoverage(CHAPTER_HTML, {
    imagesOpened: ["/tmp/book/chapters/images/p076.jpg"],
    imagesSkippedAsDecorative: ["images/p077.jpg"],
    concerns: [],
  });

  assert.deepEqual(diff.accountedFor, ["images/p076.jpg", "images/p077.jpg"]);
  assert.deepEqual(diff.unaccountedFor, ["images/scan.png"]);
});

test("an image the model never mentioned is reported by the extractor", () => {
  withChapterFile(CHAPTER_HTML, (path) => {
    const logged = [];
    extractChapterViaLlm({
      chapterFilePath: path,
      targetLanguage: "Japanese",
      log: (line) => logged.push(line),
      runClaude: () =>
        JSON.stringify({
          items: [],
          coverage: {
            imagesOpened: ["images/p076.jpg"],
            imagesSkippedAsDecorative: [],
            concerns: [],
          },
        }),
    });

    const output = logged.join("\n");
    assert.match(output, /2 of 3 referenced image\(s\) unaccounted for/);
    assert.match(output, /images\/scan\.png/);
  });
});

// The two image-only kana chapters are the live case: taught-index.json records `teaches: []` for
// them, which is indistinguishable from "read it, nothing taught" without this line.
test("a bare-array response over an image-heavy chapter says the coverage is unknown", () => {
  withChapterFile(CHAPTER_HTML, (path) => {
    const logged = [];
    extractChapterViaLlm({
      chapterFilePath: path,
      targetLanguage: "Japanese",
      log: (line) => logged.push(line),
      runClaude: () => "[]",
    });

    const output = logged.join("\n");
    assert.match(output, /3 image\(s\) referenced by this chapter and no coverage report/);
    assert.match(output, /returned no items at all/);
  });
});

test("a chapter with no images produces no coverage noise", () => {
  withChapterFile("<html><body><p>text only</p></body></html>", (path) => {
    const logged = [];
    extractChapterViaLlm({
      chapterFilePath: path,
      targetLanguage: "Japanese",
      log: (line) => logged.push(line),
      runClaude: () => "[]",
    });

    assert.deepEqual(logged, []);
  });
});

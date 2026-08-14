import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";
import {
  renderBookConventionsPrompt,
  analyzeBookConventions,
  batchChapters,
  chapterAnchor,
  mergeConventionDocuments,
  normalizeAnchor,
  verifyChapterCoverage,
} from "../../src/corpus/epubBookConventions.js";
import { hashEpubFile, chapterCachePath } from "../../src/corpus/epubLibrary.js";

// --- Synthetic .epub fixture builder (mirrors test/corpus/epubArchive.test.js) ---

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

function opfXml(manifestItems, spineIdrefs) {
  const manifest = manifestItems
    .map((i) => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const spine = spineIdrefs.map((id) => `<itemref idref="${id}"/>`).join("\n    ");
  return `<?xml version="1.0"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf">
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`;
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-conventions-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function buildFixtureEpub(dir, chapterCount) {
  const manifestItems = [];
  const spineIdrefs = [];
  const extraFiles = [];

  for (let i = 1; i <= chapterCount; i++) {
    const id = `ch${i}`;
    const href = `text/ch${i}.xhtml`;
    manifestItems.push({ id, href });
    spineIdrefs.push(id);
    extraFiles.push({
      name: `OEBPS/${href}`,
      content: `<html><head><title>Lesson ${i}: Doing &amp; Things</title></head><body>Chapter ${i}</body></html>`,
    });
  }

  const epubPath = join(dir, "book.epub");
  const zipBuffer = buildZip([
    { name: "META-INF/container.xml", content: containerXml("OEBPS/content.opf") },
    { name: "OEBPS/content.opf", content: opfXml(manifestItems, spineIdrefs) },
    ...extraFiles,
  ]);
  writeFileSync(epubPath, zipBuffer);
  return epubPath;
}

// --- renderBookConventionsPrompt ---

test("renderBookConventionsPrompt() substitutes every placeholder", () => {
  const rendered = renderBookConventionsPrompt({
    targetLanguage: "Japanese",
    chapterFilePaths: ["/tmp/ch1.xhtml", "/tmp/ch2.xhtml", "/tmp/ch3.xhtml"],
  });

  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
  assert.match(rendered, /Japanese/);
  assert.match(rendered, /3 chapter files/);
  assert.match(rendered, /\/tmp\/ch1\.xhtml/);
  assert.match(rendered, /\/tmp\/ch2\.xhtml/);
  assert.match(rendered, /\/tmp\/ch3\.xhtml/);
});

test("renderBookConventionsPrompt() requires targetLanguage", () => {
  assert.throws(() => {
    renderBookConventionsPrompt({ chapterFilePaths: ["/tmp/ch1.xhtml"] });
  }, /targetLanguage is required/);
});

test("renderBookConventionsPrompt() requires a non-empty chapterFilePaths", () => {
  assert.throws(() => {
    renderBookConventionsPrompt({ targetLanguage: "Japanese", chapterFilePaths: [] });
  }, /chapterFilePaths is required/);
});

// --- analyzeBookConventions ---

test("analyzeBookConventions() asks the model to read every chapter, not a subset", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 5);
    let capturedPrompt = null;

    analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: (prompt) => {
        capturedPrompt = prompt;
        return "# Japanese Book Conventions\n\n## Placeholder Notation\nNone found.\n";
      },
    });

    for (let i = 1; i <= 5; i++) {
      assert.match(capturedPrompt, new RegExp(`${i}\\.xhtml`));
    }
    assert.match(capturedPrompt, /5 chapter files/);
  });
});

test("analyzeBookConventions() returns the model's markdown, headings and all", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const markdown = "# Japanese Book Conventions\n\n## Placeholder Notation\nUses 〜.\n";

    const result = analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => markdown,
    });

    assert.match(result.markdown, /^# Japanese Book Conventions/);
    assert.match(result.markdown, /## Placeholder Notation/);
    assert.match(result.markdown, /Uses 〜\./);
  });
});

// The provenance record cached beside conventions.md. Without it, a doc written months ago and a
// prompt edited last week are indistinguishable, which is exactly how this book lost a chapter's
// paradigm forms.
test("analyzeBookConventions() returns the provenance record to cache beside the doc", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 4);

    const { meta } = analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => "# conventions",
    });

    assert.match(meta.promptPath, /epub-book-conventions-prompt\.md$/);
    assert.match(meta.promptSha256, /^[0-9a-f]{64}$/);
    assert.equal(meta.chapterCount, 4);
    assert.ok(meta.model);
    assert.ok(meta.effort);
    assert.ok(Date.parse(meta.generatedAt));
  });
});

test("analyzeBookConventions() materializes every chapter to the shared extraction cache", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 3);

    analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => "# conventions",
    });

    const epubHash = hashEpubFile(epubPath);
    for (let i = 1; i <= 3; i++) {
      const cachePath = chapterCachePath(epubHash, i, { libraryHomeDir: dir });
      assert.ok(existsSync(cachePath), `expected chapter ${i} to be cached at ${cachePath}`);
    }
  });
});

// --- Batching, the coverage anchor, and the merge (WS8) ---

test("analyzeBookConventions() batches over chapter ranges instead of one whole-book call", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 7);
    const prompts = [];

    analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      chaptersPerBatch: 3,
      runClaude: (prompt) => {
        prompts.push(prompt);
        return "# Japanese Book Conventions\n\n## Placeholder Notation\nNone.\n";
      },
    });

    assert.equal(prompts.length, 3, "7 chapters at 3 per batch is 3 calls");
    assert.match(prompts[0], /3 chapter files/);
    assert.match(prompts[2], /1 chapter files/);
    // Each batch is told about its own chapters only — that is what keeps a batch inside its ceiling.
    assert.match(prompts[0], /1\.xhtml/);
    assert.doesNotMatch(prompts[0], /5\.xhtml/);
    assert.match(prompts[2], /7\.xhtml/);
  });
});

test("every batch's answer survives the merge, labelled with the chapters it came from", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 4);
    let call = 0;

    const { markdown: merged } = analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      chaptersPerBatch: 2,
      runClaude: () => {
        call++;
        return `# Japanese Book Conventions\n\n## Placeholder Notation\nBatch ${call} says 〜.\n\n## Other Notes\nNote ${call}.\n`;
      },
    });

    assert.equal(call, 2);
    assert.match(merged, /Batch 1 says 〜\./);
    assert.match(merged, /Batch 2 says 〜\./);
    assert.match(merged, /\*\*Chapters 1-2:\*\*/);
    assert.match(merged, /\*\*Chapters 3-4:\*\*/);
    // One copy of each heading, not one per batch.
    assert.equal(merged.match(/^## Placeholder Notation$/gm).length, 1);
    assert.equal(merged.match(/^## Other Notes$/gm).length, 1);
  });
});

test("a batch that skipped a chapter is REPORTED, and never blocks the pass", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 3);
    const logs = [];

    const { markdown: merged } = analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      log: (line) => logs.push(line),
      // Quotes chapter 1's title and chapter 3's, but never chapter 2's.
      runClaude: () =>
        "# Japanese Book Conventions\n\n## Coverage\n" +
        '- a: "Lesson 1: Doing & Things"\n- c: "Lesson 3: Doing & Things"\n',
    });

    assert.ok(merged.length > 0, "the pass still returns a document");
    const coverage = logs.find((line) => line.includes("COVERAGE SHORTFALL"));
    assert.ok(coverage, `expected a shortfall line, saw: ${logs.join(" | ")}`);
    assert.match(coverage, /2 of 3 chapter anchor\(s\) quoted back/);
    assert.match(coverage, /NOT evidenced: 2/);
  });
});

test("a full-coverage batch reports coverage without the shortfall marker", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const logs = [];

    analyzeBookConventions({
      epubPath,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      log: (line) => logs.push(line),
      runClaude: () =>
        "# C\n\n## Coverage\n" +
        '- a: "Lesson 1: Doing & Things"\n- b: "Lesson 2: Doing & Things"\n',
    });

    assert.ok(!logs.some((line) => line.includes("COVERAGE SHORTFALL")));
    assert.ok(logs.some((line) => line.includes("2 of 2 chapter anchor(s) quoted back")));
  });
});

test("normalizeAnchor forgives the ways the two sides legitimately differ", () => {
  assert.equal(normalizeAnchor("Lesson&nbsp;7: A &amp; B"), "lesson 7: a & b");
  assert.equal(normalizeAnchor("  Lesson 7:\n  A & B  "), "lesson 7: a & b");
  assert.equal(normalizeAnchor("<span>Lesson</span> 7"), "lesson 7");
  assert.equal(normalizeAnchor("&#x30A2;"), "ア");
  assert.equal(normalizeAnchor(undefined), "");
});

test("chapterAnchor reads the <title>, and is empty rather than throwing when there is none", () => {
  withTempDir((dir) => {
    const withTitle = join(dir, "a.xhtml");
    writeFileSync(withTitle, "<html><head><title>Lesson 9: Going</title></head><body/></html>");
    assert.equal(chapterAnchor(withTitle), "lesson 9: going");

    const without = join(dir, "b.xhtml");
    writeFileSync(without, "<html><body>no head</body></html>");
    assert.equal(chapterAnchor(without), "");

    assert.equal(chapterAnchor(join(dir, "missing.xhtml")), "");
  });
});

test("verifyChapterCoverage separates 'not evidenced' from 'nothing to check against'", () => {
  const result = verifyChapterCoverage('read "lesson one" carefully', [
    { number: 1, anchor: "lesson one" },
    { number: 2, anchor: "lesson two" },
    { number: 3, anchor: "" },
  ]);
  assert.deepEqual(result.evidenced, [1]);
  assert.deepEqual(result.unevidenced, [2]);
  assert.deepEqual(result.noAnchor, [3]);
});

test("verifyChapterCoverage flags a title two chapters share, since one quote covers both", () => {
  const result = verifyChapterCoverage('"lesson seven"', [
    { number: 1, anchor: "lesson seven" },
    { number: 2, anchor: "lesson seven" },
  ]);
  assert.deepEqual(result.ambiguous, [1, 2]);
  assert.deepEqual(result.evidenced, [1, 2]);
});

test("batchChapters splits into consecutive runs and keeps the remainder", () => {
  assert.deepEqual(batchChapters([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(batchChapters([], 2), []);
  assert.deepEqual(batchChapters([1, 2], 10), [[1, 2]]);
});

test("mergeConventionDocuments keeps first-seen heading order and drops empty sections", () => {
  const merged = mergeConventionDocuments([
    { label: "1-2", markdown: "# T\n\n## A\nalpha\n\n## B\nbeta\n" },
    { label: "3-4", markdown: "# T\n\n## B\nbeta two\n\n## C\ngamma\n\n## D\n\n" },
  ]);
  const headings = merged.match(/^## .+$/gm);
  assert.deepEqual(headings, ["## A", "## B", "## C"]);
  assert.match(merged, /^# T$/m);
  assert.match(merged, /beta two/);
});

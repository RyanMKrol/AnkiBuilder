import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { Buffer } from "buffer";
import { flagForwardConcerns, renderForwardFlagPrompt } from "../../src/corpus/epubForwardFlags.js";

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
  const dir = mkdtempSync(join(tmpdir(), "epub-forward-flags-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Builds a fixture book with `chapterCount` chapters, each a tiny distinct XHTML file.
function buildFixtureEpub(dir, chapterCount) {
  const manifestItems = [];
  const spineIdrefs = [];
  const extraFiles = [];

  for (let i = 1; i <= chapterCount; i++) {
    const id = `ch${i}`;
    const href = `text/ch${i}.xhtml`;
    manifestItems.push({ id, href });
    spineIdrefs.push(id);
    extraFiles.push({ name: `OEBPS/${href}`, content: `<html><body>Chapter ${i}</body></html>` });
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

function candidate(id, english, target, notes = null) {
  return { id, english, category: "Other", notes, target };
}

// --- renderForwardFlagPrompt ---

test("renderForwardFlagPrompt() substitutes every placeholder", () => {
  const rendered = renderForwardFlagPrompt({
    targetLanguage: "Japanese",
    chapterNumber: 2,
    candidateItems: [candidate("a", "A", "あ")],
    laterChapterFilePaths: ["/tmp/ch3.xhtml", "/tmp/ch4.xhtml"],
  });

  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
  assert.match(rendered, /Japanese/);
  assert.match(rendered, /chapter 2/);
  assert.match(rendered, /\/tmp\/ch3\.xhtml/);
  assert.match(rendered, /\/tmp\/ch4\.xhtml/);
  assert.match(rendered, /"english": "A"/);
  assert.match(rendered, /no book-wide conventions available/);
});

test("renderForwardFlagPrompt() substitutes bookConventions when given", () => {
  const rendered = renderForwardFlagPrompt({
    targetLanguage: "Japanese",
    chapterNumber: 2,
    candidateItems: [candidate("a", "A", "あ")],
    laterChapterFilePaths: ["/tmp/ch3.xhtml"],
    bookConventions: "Some book-wide convention notes.",
  });

  assert.match(rendered, /Some book-wide convention notes\./);
});

// --- flagForwardConcerns ---

test("flagForwardConcerns() marks a flagged item uncertain and appends a note, without dropping it", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 3);
    const candidates = [candidate("department-store", "department store", "デパート")];

    const { items, flagged } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () =>
        JSON.stringify({
          flag: [
            { id: "department-store", laterChapter: 3, reason: "taught as shopping vocabulary" },
          ],
        }),
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].id, "department-store");
    assert.equal(items[0].uncertain, true);
    assert.match(items[0].notes, /Possibly premature/);
    assert.match(items[0].notes, /chapter 3/);
    assert.match(items[0].notes, /taught as shopping vocabulary/);

    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].laterChapter, 3);
    assert.equal(flagged[0].reason, "taught as shopping vocabulary");
    assert.equal(flagged[0].item.id, "department-store");
  });
});

test("flagForwardConcerns() appends to an item's existing notes rather than overwriting them", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("a", "A", "あ", "an existing note")];

    const { items } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () =>
        JSON.stringify({ flag: [{ id: "a", reason: "too complex for this point" }] }),
    });

    assert.match(items[0].notes, /^an existing note \| Possibly premature/);
  });
});

test("flagForwardConcerns() omits chapter wording from the note when laterChapter is absent (too-complex reason)", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("a", "A", "あ")];

    const { items, flagged } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () =>
        JSON.stringify({ flag: [{ id: "a", reason: "uses grammar not yet introduced" }] }),
    });

    assert.equal(items[0].uncertain, true);
    assert.doesNotMatch(items[0].notes, /taught later in chapter/);
    assert.match(items[0].notes, /Possibly premature — uses grammar not yet introduced/);
    assert.equal(flagged[0].laterChapter, undefined);
  });
});

test("flagForwardConcerns() leaves items the model does not flag completely unchanged", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("keep-me", "keep me", "のこして")];

    const { items, flagged } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => JSON.stringify({ flag: [] }),
    });

    assert.deepEqual(items, candidates);
    assert.equal(flagged.length, 0);
  });
});

test("flagForwardConcerns() parses a JSON object prefaced with unfenced prose commentary", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("a", "A", "あ")];

    const { items, flagged } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () =>
        'Confirmed — chapter 2 is just the glossary, nothing qualifies for flag.\n\n{"flag": []}\n',
    });

    assert.deepEqual(items, candidates);
    assert.equal(flagged.length, 0);
  });
});

test("flagForwardConcerns() fails open on a malformed model response and logs the reason", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("a", "A", "あ")];
    const logs = [];

    const { items, flagged } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      log: (msg) => logs.push(msg),
      runClaude: () => "not json at all",
    });

    assert.deepEqual(items, candidates);
    assert.equal(flagged.length, 0);
    assert.ok(logs.some((msg) => msg.includes("forward flag pass: failed")));
  });
});

test("flagForwardConcerns() fails open when a flag entry is missing its reason", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("a", "A", "あ")];
    const logs = [];

    const { items } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      log: (msg) => logs.push(msg),
      runClaude: () => JSON.stringify({ flag: [{ id: "a" }] }),
    });

    assert.deepEqual(items, candidates);
    assert.ok(logs.some((msg) => msg.includes("forward flag pass: failed")));
  });
});

test("flagForwardConcerns() no-ops on the last chapter without calling runClaude at all", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 2);
    const candidates = [candidate("a", "A", "あ")];
    const logs = [];
    let callCount = 0;

    const { items, flagged } = flagForwardConcerns({
      candidateItems: candidates,
      epubPath,
      chapterNumber: 2, // last chapter of a 2-chapter book
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      log: (msg) => logs.push(msg),
      runClaude: () => {
        callCount++;
        return JSON.stringify({ flag: [] });
      },
    });

    assert.equal(callCount, 0);
    assert.deepEqual(items, candidates);
    assert.equal(flagged.length, 0);
    assert.ok(logs.some((msg) => msg.includes("last chapter")));
  });
});

test("flagForwardConcerns() no-ops without calling runClaude when there are no candidate items", () => {
  withTempDir((dir) => {
    const epubPath = buildFixtureEpub(dir, 3);
    let callCount = 0;

    const { items, flagged } = flagForwardConcerns({
      candidateItems: [],
      epubPath,
      chapterNumber: 1,
      targetLanguage: "Japanese",
      libraryHomeDir: dir,
      runClaude: () => {
        callCount++;
        return JSON.stringify({ flag: [] });
      },
    });

    assert.equal(callCount, 0);
    assert.deepEqual(items, []);
    assert.deepEqual(flagged, []);
  });
});

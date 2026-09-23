import test from "node:test";
import assert from "node:assert/strict";
import { readZip } from "../../src/deck/zip.js";
import { resolvePurpose, PURPOSES, DEFAULT_PURPOSE } from "../../src/remaster/purpose.js";
import { renderSelectPrompt, parseSelection } from "../../src/remaster/selection.js";
import { remasterPaths } from "../../src/remaster/workspace.js";
import { buildRemasteredEpub } from "../../src/remaster/epubWriter.js";
import { purposeFromSource, refuseForSpeakingDeck } from "../../src/remaster/purpose.js";
import { assertSpeakingSourceBook } from "../../src/remaster/speakingSource.js";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// A conversion has a purpose (owner ruling 2026-09-21): it changes which units are selected and
// names the result, and each purpose's book is its own collection.

test("speaking and listening is the default; the reading deck pipeline builds from everything", () => {
  assert.equal(DEFAULT_PURPOSE, "speaking-listening");
  assert.equal(resolvePurpose().name, "speaking-listening");
  assert.deepEqual(
    Object.entries(PURPOSES).map(([name, p]) => [name, p.hasDeckPipeline]),
    [
      ["speaking-listening", true],
      ["reading-writing", false],
      ["everything", true],
    ],
  );
});

test("an unknown purpose is refused with the choices", () => {
  assert.throws(() => resolvePurpose("all"), /speaking-listening, reading-writing, everything/);
});

test("the everything purpose keeps every study unit and drops only matter and reference", () => {
  const { criteria } = resolvePurpose("everything");
  assert.match(criteria, /Include every study unit/);
  assert.match(criteria, /lessons\s+that teach characters \(kanji\)/);
  assert.match(criteria, /conversation and grammar lessons/);
  assert.match(criteria, /Exclude front matter and back matter/);
  assert.match(criteria, /indexes/);
});

test("each purpose keeps its own selection; everything else in the workspace is shared", () => {
  const speaking = remasterPaths("/w", { purpose: "speaking-listening" });
  const reading = remasterPaths("/w", { purpose: "reading-writing" });
  assert.notEqual(speaking.selection, reading.selection);
  assert.equal(speaking.transcripts, reading.transcripts);
  assert.equal(speaking.settled, reading.settled);
  assert.match(
    remasterPaths("/w", { purpose: "everything" }).selection,
    /selection-everything\.json$/,
  );
});

test("the selection prompt carries the purpose's own criteria, and the record names the purpose", () => {
  const outline = {
    entries: [{ number: 1, label: "Lesson 1", kind: "lesson", firstPage: 1, lastPage: 1 }],
  };
  const ocrByPage = new Map([[1, { lines: [] }]]);
  const speaking = renderSelectPrompt({
    bookTitle: "B",
    outline,
    ocrByPage,
    purpose: resolvePurpose("speaking-listening"),
  });
  const reading = renderSelectPrompt({
    bookTitle: "B",
    outline,
    ocrByPage,
    purpose: resolvePurpose("reading-writing"),
  });
  assert.match(speaking, /one purpose:\s+\*\*speaking and listening\*\*/);
  assert.match(speaking, /Exclude a unit whose subject is the writing system/);
  assert.match(reading, /Include a unit whose subject is the writing system/);

  const reply = JSON.stringify({
    units: [
      {
        entry: 1,
        recommendation: "include",
        category: "core-lesson",
        overlapsWith: [],
        reason: "r",
      },
    ],
  });
  const selection = parseSelection(reply, { outline, purpose: resolvePurpose("reading-writing") });
  assert.equal(selection.purpose, "reading-writing");
});

test("two purposes' books are two identities, even with the same chapters", () => {
  const chapter = {
    number: 1,
    label: "Chapter 01: Lesson 1",
    firstPage: 1,
    lastPage: 1,
    pages: [{ number: 1, printed: "", body: "<p>あ</p>" }],
  };
  const build = (purpose) =>
    buildRemasteredEpub([chapter], {
      title: `B (${PURPOSES[purpose].title})`,
      language: "ja",
      sourceHash: "0123456789abcdef",
      modified: "2000-01-01T00:00:00Z",
      purpose,
    });
  const opf = (bytes) =>
    readZip(bytes)
      .find((e) => e.name === "OEBPS/content.opf")
      .data.toString();
  const speaking = opf(build("speaking-listening"));
  const reading = opf(build("reading-writing"));
  const identifier = (text) => /<dc:identifier[^>]*>([^<]+)</.exec(text)[1];
  assert.notEqual(identifier(speaking), identifier(reading));
  assert.match(speaking, /<dc:title>B \(speaking and listening\)<\/dc:title>/);
  assert.match(reading, /purpose reading-writing/);
});

// Amended 2026-09-23: the everything purpose exists, and the 2026-09-21 reason for not having one
// (kanji lessons fed to the speaking pipeline flag every kanji card as already taught) is a check.
test("a converted book's purpose is read back from its dc:source", () => {
  assert.equal(
    purposeFromSource("remastered from page images, source sha256 prefix ab12, purpose everything"),
    "everything",
  );
  assert.equal(purposeFromSource("remastered from page images, source sha256 prefix ab12"), null);
  assert.equal(purposeFromSource("Kodansha, 2006"), null);
  assert.equal(purposeFromSource(null), null);
});

test("a speaking deck refuses a book converted for everything or reading-writing", () => {
  const source = (purpose) =>
    `remastered from page images, source sha256 prefix ab12, purpose ${purpose}`;
  assert.throws(() => refuseForSpeakingDeck(source("everything")), /converted for "everything"/);
  assert.throws(() => refuseForSpeakingDeck(source("reading-writing")), /speaking-listening/);
  assert.doesNotThrow(() => refuseForSpeakingDeck(source("speaking-listening")));
  // A publisher's EPUB, and a conversion from before purposes existed, are not refused.
  assert.doesNotThrow(() => refuseForSpeakingDeck("Kodansha, 2006"));
  assert.doesNotThrow(() => refuseForSpeakingDeck(null));
});

test("the guard reads the purpose out of a real converted EPUB", () => {
  const dir = mkdtempSync(join(tmpdir(), "purpose-guard-"));
  try {
    const chapter = {
      number: 1,
      label: "Chapter 01: Lesson 1",
      firstPage: 1,
      lastPage: 1,
      pages: [{ number: 1, printed: "", body: "<p>あ</p>" }],
    };
    const write = (purpose) => {
      const path = join(dir, `${purpose}.epub`);
      writeFileSync(
        path,
        buildRemasteredEpub([chapter], {
          title: "B",
          language: "ja",
          sourceHash: "0123456789abcdef",
          modified: "2000-01-01T00:00:00Z",
          purpose,
        }),
      );
      return path;
    };
    assert.throws(
      () => assertSpeakingSourceBook(write("everything")),
      /converted for "everything"/,
    );
    assert.doesNotThrow(() => assertSpeakingSourceBook(write("speaking-listening")));
    assert.doesNotThrow(() => assertSpeakingSourceBook(join(dir, "missing.epub")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

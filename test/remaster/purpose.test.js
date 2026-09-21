import test from "node:test";
import assert from "node:assert/strict";
import { readZip } from "../../src/deck/zip.js";
import { resolvePurpose, PURPOSES, DEFAULT_PURPOSE } from "../../src/remaster/purpose.js";
import { renderSelectPrompt, parseSelection } from "../../src/remaster/selection.js";
import { remasterPaths } from "../../src/remaster/workspace.js";
import { buildRemasteredEpub } from "../../src/remaster/epubWriter.js";

// A conversion has a purpose (owner ruling 2026-09-21): it changes which units are selected and
// names the result, and each purpose's book is its own collection.

test("speaking and listening is the default, and the only purpose a deck pipeline builds today", () => {
  assert.equal(DEFAULT_PURPOSE, "speaking-listening");
  assert.equal(resolvePurpose().name, "speaking-listening");
  assert.deepEqual(
    Object.entries(PURPOSES).map(([name, p]) => [name, p.hasDeckPipeline]),
    [
      ["speaking-listening", true],
      ["reading-writing", false],
    ],
  );
});

test("there is no 'everything' purpose, and an unknown one is refused with the choices", () => {
  assert.throws(() => resolvePurpose("everything"), /speaking-listening, reading-writing/);
});

test("each purpose keeps its own selection; everything else in the workspace is shared", () => {
  const speaking = remasterPaths("/w", { purpose: "speaking-listening" });
  const reading = remasterPaths("/w", { purpose: "reading-writing" });
  assert.notEqual(speaking.selection, reading.selection);
  assert.equal(speaking.transcripts, reading.transcripts);
  assert.equal(speaking.settled, reading.settled);
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

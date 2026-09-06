import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ROLE_ID,
  renderChapterReaderPrompt,
  assertSectionsAccountedFor,
  unreadSections,
  readChapter,
} from "../../src/agents/chapterReader.js";

const SECTIONS = [
  { title: "VOCABULARY", level: 2 },
  { title: "EXERCISES", level: 2 },
  { title: "EXERCISES", level: 2 },
];

function withChapter(fn) {
  const dir = mkdtempSync(join(tmpdir(), "chapter-reader-"));
  const file = join(dir, "15.xhtml");
  writeFileSync(file, "<h2>VOCABULARY</h2>");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const stub = (payload) => () => JSON.stringify(payload);
const allSections = [
  { title: "VOCABULARY", read: true, contributed: 3 },
  { title: "EXERCISES", read: true, contributed: 1 },
  { title: "EXERCISES", read: true, contributed: 0, note: "listening drill" },
];

test("the prompt carries the file path, the headings and the book's hints", () => {
  withChapter((file) => {
    const prompt = renderChapterReaderPrompt({
      chapterFilePath: file,
      sections: SECTIONS,
      targetLanguage: "ja",
      meta: { hints: { vocabularyTableClass: "voca" } },
    });
    assert.match(prompt, new RegExp(file.replace(/[/\\]/g, "\\$&")));
    assert.match(prompt, /"title": "VOCABULARY"/);
    assert.match(prompt, /vocabularyTableClass/);
    assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  });
});

test("items are stamped with the role, so overlap with the table specialist stays attributable", () => {
  withChapter((file) => {
    const { items } = readChapter({
      chapterFilePath: file,
      sections: SECTIONS,
      targetLanguage: "ja",
      runClaude: stub({ items: [{ id: "neko", target: "ねこ" }], sections: allSections }),
    });
    assert.equal(items[0].producedBy, ROLE_ID);
  });
});

test("a response that skips a section is rejected: a short read must not look like a short chapter", () => {
  withChapter((file) => {
    assert.throws(
      () =>
        readChapter({
          chapterFilePath: file,
          sections: SECTIONS,
          targetLanguage: "ja",
          runClaude: stub({ items: [], sections: allSections.slice(0, 2) }),
        }),
      /did not account for section\(s\): EXERCISES/,
    );
  });
});

test("a repeated heading is accounted for by count, since a chapter may print one twice", () => {
  assert.doesNotThrow(() => assertSectionsAccountedFor(SECTIONS, allSections));
  assert.throws(
    () =>
      assertSectionsAccountedFor(SECTIONS, [...allSections, { title: "EXERCISES", read: true }]),
    /reported section\(s\) it was not given/,
  );
});

test("contributed: 0 with a reason is a good answer, not a failure", () => {
  withChapter((file) => {
    const { sections } = readChapter({
      chapterFilePath: file,
      sections: SECTIONS,
      targetLanguage: "ja",
      runClaude: stub({ items: [], sections: allSections }),
    });
    assert.equal(sections[2].contributed, 0);
    assert.equal(sections[2].note, "listening drill");
  });
});

test("a section the role admits it did not read is surfaced, not buried", () => {
  const reported = [...allSections];
  reported[1] = { title: "EXERCISES", read: false, contributed: 0, note: "ran out of file" };
  assert.deepEqual(
    unreadSections(reported).map((s) => s.note),
    ["ran out of file"],
  );
  assert.deepEqual(unreadSections(allSections), []);
});

test("a missing chapter file is a hard error, not an empty read", () => {
  assert.throws(
    () =>
      readChapter({ chapterFilePath: "/nope/15.xhtml", sections: SECTIONS, targetLanguage: "ja" }),
    /needs a chapter file that exists/,
  );
});

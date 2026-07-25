import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { enhanceLessonNotes, enhanceRunDirNotes } from "../../src/cards/crossLessonNotes.js";

// A two-lesson book. chapter-0 is "Lesson 1", chapter-1 is "Lesson 2".
function book() {
  const dir = mkdtempSync(join(tmpdir(), "notes-"));
  const unit = (name, number, label, items) => {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(
      join(dir, name, "cards.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: number, chapterLabel: label },
        items,
      }),
    );
  };
  unit("chapter-0", 1, "Lesson 1: Meeting", [
    { id: "a", english: "Please", target: "おねがいします", pronunciation: "onegaishimasu" },
  ]);
  unit("chapter-1", 2, "Lesson 2: Shopping", [
    { id: "b", english: "Please give me", target: "ください", pronunciation: "kudasai" },
    { id: "c", english: "One", target: "いち", pronunciation: "ichi", note: "One (read いち)" },
  ]);
  return dir;
}

const readCards = (dir, unit) => JSON.parse(readFileSync(join(dir, unit, "cards.json"), "utf-8"));

test("writes notes for the named lesson only, with earlier lessons as context", () => {
  const dir = book();
  try {
    let prompt = "";
    const result = enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: (p) => {
        prompt = p;
        return JSON.stringify({
          notes: [{ id: "b", note: "Contrast おねがいします (onegaishimasu)." }],
        });
      },
    });

    assert.equal(result.changed, 1);
    assert.equal(
      readCards(dir, "chapter-1").items[0].note,
      "Contrast おねがいします (onegaishimasu).",
    );
    // The earlier lesson is context, never a write target.
    assert.equal(readCards(dir, "chapter-0").items[0].note, undefined);
    // Both lessons are in the prompt, tagged by the book's own names — trimmed at the first ":" to
    // the short, citable form a note would use.
    assert.match(prompt, /"lesson": "Lesson 1"/);
    assert.match(prompt, /CURRENT lesson being taught is "Lesson 2"/);
    assert.match(prompt, /ALREADY LEARNED: Lesson 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a later lesson is never shown to the model", () => {
  const dir = book();
  try {
    let prompt = "";
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-0",
      runClaude: (p) => {
        prompt = p;
        return JSON.stringify({ notes: [] });
      },
    });
    // Structurally backward-only: chapter-1's cards can't be referenced because they aren't there.
    // (Matched on the English, since the prompt template's own worked examples mention ください.)
    assert.doesNotMatch(prompt, /Please give me/);
    assert.match(prompt, /"english": "Please"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty returned note deletes a restatement (stored as null, not "")', () => {
  const dir = book();
  try {
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "c", note: "" }] }),
    });
    assert.equal(readCards(dir, "chapter-1").items[1].note, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backs the lesson up once, and never overwrites the original snapshot", () => {
  const dir = book();
  try {
    const bak = join(dir, "chapter-1", "cards.json.pre-enhance.bak");
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", note: "First." }] }),
    });
    assert.ok(existsSync(bak));
    const original = readFileSync(bak, "utf-8");

    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", note: "Second." }] }),
    });
    assert.equal(readFileSync(bak, "utf-8"), original); // still the PRE-enhancement state
    assert.equal(readCards(dir, "chapter-1").items[0].note, "Second.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ignores a note for a card outside the current lesson", () => {
  const dir = book();
  try {
    const result = enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "a", note: "not yours to write" }] }),
    });
    assert.equal(result.changed, 0);
    assert.equal(readCards(dir, "chapter-0").items[0].note, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fails open on a malformed response", () => {
  const dir = book();
  try {
    const logged = [];
    const result = enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      log: (line) => logged.push(line),
      runClaude: () => "nope",
    });
    assert.equal(result.changed, 0);
    assert.match(logged.join("\n"), /cross-lesson notes: failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reports a skip for an unknown unit rather than writing anything", () => {
  const dir = book();
  try {
    const result = enhanceLessonNotes({ deckDir: dir, unitName: "chapter-9", runClaude: () => "" });
    assert.equal(result.changed, 0);
    assert.match(result.skipped, /no lesson "chapter-9"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("enhanceRunDirNotes addresses the same pass by run directory", () => {
  const dir = book();
  try {
    const result = enhanceRunDirNotes({
      runDir: join(dir, "chapter-1"),
      runClaude: () => JSON.stringify({ notes: [{ id: "b", note: "By run dir." }] }),
    });
    assert.equal(result.changed, 1);
    assert.equal(readCards(dir, "chapter-1").items[0].note, "By run dir.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

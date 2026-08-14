import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  enhanceLessonNotes,
  enhanceRunDirNotes,
  lessonSiblings,
  lessonUnits,
} from "../../src/cards/crossLessonNotes.js";

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
    {
      id: "a",
      english: "Please",
      target: "おねがいします",
      pronunciation: "onegaishimasu",
      category: "Greetings",
    },
  ]);
  unit("chapter-1", 2, "Lesson 2: Shopping", [
    {
      id: "b",
      english: "Please give me",
      target: "ください",
      pronunciation: "kudasai",
      category: "Shopping",
    },
    {
      id: "c",
      english: "One",
      target: "いち",
      pronunciation: "ichi",
      category: "Numbers",
      note: "One (read いち)",
    },
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

test("older lessons appear only as a gloss+target digest; recent ones in full", () => {
  // Five lessons; enhancing the last one. With 3 recent-context lessons, chapters 3-5 are
  // full-detail and chapters 1-2 fall into the digest.
  const dir = mkdtempSync(join(tmpdir(), "notes-digest-"));
  try {
    for (let n = 1; n <= 5; n++) {
      mkdirSync(join(dir, `chapter-${n}`), { recursive: true });
      writeFileSync(
        join(dir, `chapter-${n}`, "cards.json"),
        JSON.stringify({
          meta: { targetLanguage: "ja", chapterNumber: n, chapterLabel: `Lesson ${n}: Things` },
          items: [
            {
              id: `w${n}`,
              english: `Word ${n}`,
              target: `たんご${n}`,
              pronunciation: `tango-${n}`,
              note: `existing note ${n}`,
            },
          ],
        }),
      );
    }

    let prompt = "";
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-5",
      runClaude: (p) => {
        prompt = p;
        return JSON.stringify({ notes: [] });
      },
    });

    // Recent lessons (3, 4, 5) carry full card fields.
    assert.match(prompt, /"id": "w5"/);
    assert.match(prompt, /"id": "w3"/);
    // Older lessons (1, 2) appear — but only as lesson/english/target, no id/romaji/notes.
    assert.match(prompt, /"english": "Word 1"/);
    assert.match(prompt, /"target": "たんご1"/);
    assert.doesNotMatch(prompt, /"id": "w1"/);
    assert.doesNotMatch(prompt, /existing note 1/);
    assert.doesNotMatch(prompt, /tango-1/);
    // Every earlier lesson is still named as already-learned.
    assert.match(prompt, /ALREADY LEARNED: Lesson 1, Lesson 2, Lesson 3, Lesson 4/);
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

// A gloss collision is only visible ACROSS lessons, so this pass is the only one that can catch it —
// hence it, alone, may write the front-of-card hint that makes two same-gloss cards studiable.
test("writes a front hint when the model returns one", () => {
  const dir = book();
  try {
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () =>
        JSON.stringify({
          notes: [{ id: "b", note: "Contrast おねがいします.", hint: "asking for a thing" }],
        }),
    });
    const card = readCards(dir, "chapter-1").items[0];
    assert.equal(card.hint, "asking for a thing");
    assert.equal(card.note, "Contrast おねがいします.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an omitted hint leaves an existing one alone; an empty one deletes it", () => {
  const dir = book();
  try {
    const file = join(dir, "chapter-1", "cards.json");
    const seed = JSON.parse(readFileSync(file, "utf-8"));
    seed.items[0].hint = "hand-written, keep me";
    writeFileSync(file, JSON.stringify(seed));

    // No `hint` key at all → untouched.
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", note: "Just the note." }] }),
    });
    assert.equal(readCards(dir, "chapter-1").items[0].hint, "hand-written, keep me");

    // An explicit empty string → cleared, stored as null like an emptied note.
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", hint: "" }] }),
    });
    assert.equal(readCards(dir, "chapter-1").items[0].hint, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hint-only change still counts as pending work", () => {
  const dir = book();
  try {
    const result = enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", hint: "asking for a thing" }] }),
    });
    assert.equal(result.changed, 1);
    assert.equal(readCards(dir, "chapter-1").items[0].hint, "asking for a thing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the prompt shows each card's existing hint, so the model can leave it alone", () => {
  const dir = book();
  try {
    const file = join(dir, "chapter-1", "cards.json");
    const seed = JSON.parse(readFileSync(file, "utf-8"));
    seed.items[0].hint = "asking for a thing";
    writeFileSync(file, JSON.stringify(seed));

    let prompt = "";
    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: (p) => {
        prompt = p;
        return JSON.stringify({ notes: [] });
      },
    });
    assert.match(prompt, /"currentHint": "asking for a thing"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every run gets its OWN stamped backup, so any single run is reversible on its own", () => {
  const dir = book();
  try {
    const baks = () =>
      readdirSync(join(dir, "chapter-1"))
        .filter((name) => name.startsWith("cards.json.pre-enhance-") && name.endsWith(".bak"))
        .sort();

    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", note: "First." }] }),
    });
    assert.equal(baks().length, 1);
    const first = JSON.parse(readFileSync(join(dir, "chapter-1", baks()[0]), "utf-8"));
    assert.equal(first.items[0].note, undefined, "the first snapshot is the pre-enhancement state");

    enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => JSON.stringify({ notes: [{ id: "b", note: "Second." }] }),
    });
    const after = baks();
    assert.equal(after.length, 2, "the second run does not clobber the first run's restore point");
    // Both states are recoverable: the pre-enhancement one AND the one the second run found.
    const notes = after.map(
      (name) => JSON.parse(readFileSync(join(dir, "chapter-1", name), "utf-8")).items[0].note,
    );
    assert.deepEqual([...notes].sort(), ["First.", undefined]);
    assert.equal(readCards(dir, "chapter-1").items[0].note, "Second.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a note written while the model call ran is not clobbered by the stale snapshot", () => {
  const dir = book();
  try {
    const cardsPath = join(dir, "chapter-1", "cards.json");
    const result = enhanceLessonNotes({
      deckDir: dir,
      unitName: "chapter-1",
      runClaude: () => {
        // Stand-in for the dashboard: someone excludes a card and edits another while the
        // multi-minute call is in flight. The pass read this file before any of that happened.
        const live = JSON.parse(readFileSync(cardsPath, "utf-8"));
        live.items[1].excluded = true;
        live.items[1].english = "One (edited during the pass)";
        writeFileSync(cardsPath, JSON.stringify(live));
        return JSON.stringify({ notes: [{ id: "b", note: "From the model." }] });
      },
    });

    assert.equal(result.changed, 1);
    const after = readCards(dir, "chapter-1");
    assert.equal(after.items[0].note, "From the model.", "the pass still wrote what it owns");
    assert.equal(after.items[1].excluded, true, "the concurrent exclude survived");
    assert.equal(after.items[1].english, "One (edited during the pass)");
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
    // The failure is REPORTED, not just logged — the caller must not set notesEnhanced.
    assert.equal(result.failed, true);
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

// lessonSiblings exists so a pass can tell "this is the first lesson" apart from "the earlier
// lessons haven't been prepared yet" — a distinction lessonUnits structurally cannot make, because a
// corpus-only lesson has no cards.json to find.
test("lessonSiblings sees a corpus-only unit that lessonUnits cannot", () => {
  const dir = book();
  try {
    // chapter-2 got as far as assemble and stopped: corpus.json, no cards.json.
    mkdirSync(join(dir, "chapter-2"), { recursive: true });
    writeFileSync(
      join(dir, "chapter-2", "corpus.json"),
      JSON.stringify({
        meta: { targetLanguage: "ja", chapterNumber: 3, chapterLabel: "Lesson 3: Shops" },
        items: [{ id: "d", english: "Shop", category: "Other", target: null }],
      }),
    );

    const siblings = lessonSiblings(dir);
    assert.deepEqual(
      siblings.map((u) => [u.name, u.hasCards]),
      [
        ["chapter-0", true],
        ["chapter-1", true],
        ["chapter-2", false],
      ],
    );
    // It still places correctly in study order, and carries its own label.
    assert.equal(siblings[2].label, "Lesson 3");
    assert.equal(siblings[2].number, 3);
    assert.equal(siblings[2].data, null);

    // lessonUnits keeps its existing contract: prepared lessons only.
    assert.deepEqual(
      lessonUnits(dir).map((u) => u.name),
      ["chapter-0", "chapter-1"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lessonSiblings surfaces each unit's reviewed/done flags", () => {
  const dir = book();
  try {
    const file = join(dir, "chapter-0", "cards.json");
    const data = JSON.parse(readFileSync(file, "utf-8"));
    data.meta.reviewed = true;
    data.meta.done = true;
    writeFileSync(file, JSON.stringify(data));

    const [first, second] = lessonSiblings(dir);
    assert.deepEqual([first.reviewed, first.done], [true, true]);
    assert.deepEqual([second.reviewed, second.done], [false, false]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lessonSiblings skips a unit whose json is unreadable rather than throwing", () => {
  const dir = book();
  try {
    writeFileSync(join(dir, "chapter-1", "cards.json"), "{ not json");
    assert.deepEqual(
      lessonSiblings(dir).map((u) => u.name),
      ["chapter-0"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { ALL_CHECKS, audit } from "../../src/audit/index.js";
import { glossAlternatives } from "../../src/audit/checks/workspace.js";
import { makeOutputRoot, writeUnit, writeMarker, writeRaw, card } from "./fixture.js";

/** Runs one check by id and returns its result rows. */
function runOnly(root, id, extra = {}) {
  return audit({ outputRoot: root, checks: ALL_CHECKS, only: [id], ...extra }).results;
}
const messages = (results) => results.flatMap((r) => r.findings.map((f) => f.message));

test("schema: a unit with a bad field type is named, and its siblings still get checked", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("a")] });
    writeUnit(root, "epubs/book/chapter-2", { items: [card("b", { english: 42 })] });
    const results = runOnly(root, "schema");
    assert.equal(results.length, 2);
    assert.equal(results.find((r) => r.target.endsWith("chapter-1")).findings.length, 0);
    assert.match(
      results.find((r) => r.target.endsWith("chapter-2")).findings[0].message,
      /cards\.json/,
    );
  } finally {
    cleanup();
  }
});

test("card ids: a clash across two units of one collection blocks", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("konnichiwa")] });
    writeUnit(root, "epubs/book/chapter-2", { items: [card("konnichiwa")] });
    assert.match(messages(runOnly(root, "card-ids"))[0], /duplicate card ids/);
  } finally {
    cleanup();
  }
});

test("card ids: an EXCLUDED card never causes a clash, because it never ships", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { items: [card("dup")] });
    writeUnit(root, "epubs/book/chapter-2", { items: [card("dup", { excluded: true })] });
    assert.equal(messages(runOnly(root, "card-ids")).length, 0);
  } finally {
    cleanup();
  }
});

test("spacing: an editorial space in a Japanese target is caught in a hand-authored extras unit", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1-extras", {
      items: [card("a", { target: "これは ペン です" })],
    });
    assert.match(messages(runOnly(root, "spacing"))[0], /editorial spaces/);
  } finally {
    cleanup();
  }
});

test("placeholder target: a schematic 〜 pattern blocks, but only when it actually ships", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [
        card("shipped", { target: "だれも〜ません" }),
        card("dropped", { target: "なにも〜ません", excluded: true }),
        // A 〜 in the NOTE is how the prose refers to a suffix, and is perfectly legitimate.
        card("noted", { target: "さん", note: "attaches after a name, written 〜さん" }),
      ],
    });
    const found = messages(runOnly(root, "placeholder-target"));
    assert.equal(found.length, 1);
    assert.match(found[0], /shipped/);
  } finally {
    cleanup();
  }
});

test("chapter numbers: a string key, an inverted range and two base units sharing a number", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", { meta: { chapterNumber: "11" }, items: [] });
    writeUnit(root, "epubs/book/chapter-2", {
      meta: { chapterNumber: 20, lastChapterNumber: 18 },
      items: [],
    });
    writeUnit(root, "epubs/book/chapter-3", { meta: { chapterNumber: 33 }, items: [] });
    writeUnit(root, "epubs/book/chapter-4", { meta: { chapterNumber: 33 }, items: [] });
    const found = messages(runOnly(root, "chapter-number"));
    assert.equal(found.length, 3);
    assert.match(found[0], /non-numeric chapterNumber/);
    assert.match(found[1], /runs backwards/);
    assert.match(found[2], /both claim chapterNumber 33/);
  } finally {
    cleanup();
  }
});

test("chapter numbers: a unit and its OWN extras sharing a number is the invariant, not a fault", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-13", { meta: { chapterNumber: 33 }, items: [] });
    writeUnit(root, "epubs/book/chapter-13-extras", { meta: { chapterNumber: 33 }, items: [] });
    assert.equal(messages(runOnly(root, "chapter-number")).length, 0);
  } finally {
    cleanup();
  }
});

test("extras/library: an -extras unit carrying an epubHash would overwrite the base chapter's entry", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-13", {
      meta: { epubHash: "h", chapterNumber: 33 },
      items: [],
    });
    writeUnit(root, "epubs/book/chapter-13-extras", {
      meta: { epubHash: "h", chapterNumber: 33 },
      items: [],
    });
    assert.match(
      messages(runOnly(root, "extras-library-write"))[0],
      /would overwrite the base chapter/,
    );
  } finally {
    cleanup();
  }
});

test("extras/library: the live shape (an extras unit with no epubHash) is clean", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-13", {
      meta: { epubHash: "h", chapterNumber: 33 },
      items: [],
    });
    writeUnit(root, "epubs/book/chapter-13-extras", { meta: { chapterNumber: 33 }, items: [] });
    assert.equal(messages(runOnly(root, "extras-library-write")).length, 0);
  } finally {
    cleanup();
  }
});

test("dedup library: a reviewed chapter with no corpora entry fails; an orphan entry only reports", () => {
  const { root, cleanup } = makeOutputRoot();
  const library = makeOutputRoot();
  try {
    mkdirSync(join(library.root, "epubs/h/corpora"), { recursive: true });
    writeFileSync(join(library.root, "epubs/h/corpora/11.json"), "{}");
    writeFileSync(join(library.root, "epubs/h/corpora/99.json"), "{}"); // orphan
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
      items: [],
    });
    writeUnit(root, "epubs/book/chapter-2", {
      meta: { epubHash: "h", chapterNumber: 14, reviewed: true },
      items: [],
    });

    const results = runOnly(root, "library-completeness", { libraryHomeDir: library.root });
    assert.match(messages(results)[0], /chapter-2 is reviewed but has no/);
    assert.match(results[0].notes.join(" "), /99/);
  } finally {
    cleanup();
    library.cleanup();
  }
});

test("dedup library: no library on this machine is a SKIP, never a pass", () => {
  const { root, cleanup } = makeOutputRoot();
  const empty = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
      items: [],
    });
    const [result] = runOnly(root, "library-completeness", { libraryHomeDir: empty.root });
    assert.match(result.skipped, /no dedup library/);
  } finally {
    cleanup();
    empty.cleanup();
  }
});

test("packages: a foreign .apkg in a collection dir blocks; the legacy deck.apkg does not", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "courses/nihongo/lesson-1", { items: [] });
    writeRaw(root, "courses/nihongo/nihongo.apkg", "own package");
    writeRaw(root, "courses/nihongo/deck.apkg", "pre-rename package");
    writeRaw(root, "courses/nihongo/some-other-book.apkg", "FOREIGN");
    const found = messages(runOnly(root, "stray-package"));
    assert.equal(found.length, 1);
    assert.match(found[0], /some-other-book\.apkg is not this collection's package/);
  } finally {
    cleanup();
  }
});

test("package freshness: a done unit newer than the package blocks and names the rebuild command", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    const unit = writeUnit(root, "courses/nihongo/lesson-1", {
      meta: { done: true },
      items: [card("a")],
    });
    const pkg = writeRaw(root, "courses/nihongo/nihongo.apkg", "stale");
    const old = new Date("2020-01-01T00:00:00Z");
    utimesSync(pkg, old, old);
    const newer = new Date("2024-01-01T00:00:00Z");
    utimesSync(join(unit, "cards.json"), newer, newer);

    const found = messages(runOnly(root, "package-freshness"));
    assert.match(found[0], /is older than 1 done unit/);
    assert.match(found[0], /deck --book-dir/);
  } finally {
    cleanup();
  }
});

test("package freshness: a collection with no done units skips rather than demanding a package", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "courses/nihongo/lesson-1", { items: [card("a")] });
    assert.match(runOnly(root, "package-freshness")[0].skipped, /no done units/);
  } finally {
    cleanup();
  }
});

test("source type: the templates/ location and the sourceType marker have to agree", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "templates/numbers/ja", { meta: { sourceType: "epub" }, items: [] });
    writeUnit(root, "epubs/book/chapter-1", { meta: { sourceType: "template" }, items: [] });
    writeUnit(root, "epubs/book/chapter-2", { meta: { sourceType: "epub" }, items: [] });
    const found = messages(runOnly(root, "source-type"));
    assert.equal(found.length, 2);
    assert.ok(found.some((m) => /lives under templates\/ but declares sourceType "epub"/.test(m)));
    assert.ok(found.some((m) => /waives BOTH pre-review passes/.test(m)));
  } finally {
    cleanup();
  }
});

test("template exemptions are reported as a decision, with their reason", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "templates/numbers/ja", {
      meta: { sourceType: "template" },
      items: [card("a")],
    });
    const notes = runOnly(root, "template-exemptions")[0].notes.join("\n");
    assert.match(notes, /readiness: exempt/);
    assert.match(notes, /no source drills to mine/);
    assert.match(notes, /no sibling lessons to cross-reference/);
  } finally {
    cleanup();
  }
});

test("cross-collection ids: differing content is the hazard, identical content is a standing note", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    // Both markers omit guidNamespace — the pre-namespace shape both live collections carry.
    writeMarker(root, "epubs/book", "book.json", { slug: "book" });
    writeMarker(root, "courses/course", "course.json", { name: "course" });
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("scarf", { target: "スカーフ" }), card("pen", { target: "ペン" })],
    });
    writeUnit(root, "courses/course/lesson-1", {
      items: [card("scarf", { target: "マフラー" }), card("pen", { target: "ペン" })],
    });

    const [result] = runOnly(root, "cross-collection-ids");
    assert.equal(result.findings.length, 2);
    assert.match(result.findings[0].key, /^differs\/scarf$/);
    assert.match(result.findings[0].message, /DIFFERENT content/);
    assert.match(result.findings[1].key, /^identical\/pen$/);
  } finally {
    cleanup();
  }
});

test("cross-collection ids: a namespaced collection cannot collide, so the check skips", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeMarker(root, "epubs/book", "book.json", { slug: "book", guidNamespace: "book" });
    writeMarker(root, "courses/course", "course.json", { name: "course" });
    writeUnit(root, "epubs/book/chapter-1", { items: [card("x")] });
    writeUnit(root, "courses/course/lesson-1", { items: [card("x")] });
    assert.match(runOnly(root, "cross-collection-ids")[0].skipped, /bare guids/);
  } finally {
    cleanup();
  }
});

test("cross-deck prompts: only DELIVERED collections are interleaved", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("a", { english: "Scarf", target: "スカーフ" })],
    });
    writeUnit(root, "courses/course/lesson-1", {
      items: [card("b", { english: "Scarf", target: "マフラー" })],
    });
    assert.match(runOnly(root, "cross-deck-prompts")[0].skipped, /delivered collection/);

    writeMarker(root, "epubs/book", "anki-delivered.json", { note: "x" });
    writeMarker(root, "courses/course", "anki-delivered.json", { note: "x" });
    const found = messages(runOnly(root, "cross-deck-prompts"));
    assert.equal(found.length, 2);
    assert.match(found[0], /uncued PRODUCTION prompt/);
  } finally {
    cleanup();
  }
});

test("cross-deck prompts: a cue on the colliding face clears it", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeMarker(root, "epubs/book", "anki-delivered.json", { note: "x" });
    writeMarker(root, "courses/course", "anki-delivered.json", { note: "x" });
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("a", { english: "Scarf", target: "スカーフ", hint: "the woolly one" })],
    });
    writeUnit(root, "courses/course/lesson-1", {
      items: [card("b", { english: "Scarf", target: "マフラー", hint: "the fashion one" })],
    });
    assert.equal(messages(runOnly(root, "cross-deck-prompts")).length, 0);
  } finally {
    cleanup();
  }
});

test("gloss normalization keeps wording differences out of the cross-deck report", () => {
  const same = [
    ["Big", "Big, large"],
    ["4th floor", "Fourth floor"],
    ["This one", "This one (polite for 'this person')"],
    ["Vegetables", "Vegetable"],
    ["Once more, please.", "Once more please"],
    ["The bag", "Bag"],
  ];
  for (const [a, b] of same) {
    const left = glossAlternatives(a);
    assert.ok(
      [...glossAlternatives(b)].some((alt) => left.has(alt)),
      `${a} should agree with ${b}`,
    );
  }
  // Deliberately shallow: a genuinely different English word still reads as a difference.
  const left = glossAlternatives("Car park");
  assert.ok(![...glossAlternatives("Parking lot")].some((alt) => left.has(alt)));
});

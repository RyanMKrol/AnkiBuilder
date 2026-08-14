import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, utimesSync, writeFileSync } from "fs";
import { join } from "path";
import { ALL_CHECKS, audit } from "../../src/audit/index.js";
import { CACHE_VERSION } from "../../src/corpus/epubLibrary.js";
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

/**
 * There is no test here for a check that compares two collections, because there is no such check.
 * Collections are isolated (owner ruling, 2026-08-14; see CLAUDE.md). Three checks that compared
 * card ids, prompts and glosses ACROSS collections were written, merged, and then removed. This test
 * is what stops them coming back by accident.
 */
test("no check reads a second collection: every check is unit- or collection-scoped", () => {
  const workspaceChecks = ALL_CHECKS.filter((check) => check.scope === "workspace");
  assert.deepEqual(
    workspaceChecks.map((check) => check.id),
    [],
    "a workspace-scope check may iterate collections for per-collection logic, but adding one here " +
      "means someone has to confirm it does not compare two collections' cards. Collections are " +
      "isolated: they are separate products and must never be overlapped, compared or cued against " +
      "each other.",
  );
});

test("two collections that share a card id and differ in content are BOTH clean", () => {
  // The live shape the removed check reported: the same id shipped by two bare-guid collections
  // with different targets. Within each collection nothing is wrong, and that is now the whole
  // question preflight asks.
  const { root, cleanup } = makeOutputRoot();
  try {
    writeMarker(root, "epubs/book", "book.json", { slug: "book" });
    writeMarker(root, "courses/course", "course.json", { name: "course" });
    writeMarker(root, "epubs/book", "anki-delivered.json", { note: "x" });
    writeMarker(root, "courses/course", "anki-delivered.json", { note: "x" });
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("scarf", { target: "スカーフ", english: "Scarf" })],
    });
    writeUnit(root, "courses/course/lesson-1", {
      items: [card("scarf", { target: "マフラー", english: "Scarf" })],
    });
    const { results, failCount, unreviewedCount } = audit({ outputRoot: root, checks: ALL_CHECKS });
    assert.equal(failCount, 0);
    assert.equal(unreviewedCount, 0);
    assert.deepEqual(
      results.flatMap((r) => r.findings.map((f) => f.message)),
      [],
    );
  } finally {
    cleanup();
  }
});

// --- vocab coverage ---
//
// The failure it names: extraction drops a whole vocabulary block, and the chapter simply looks like
// a chapter with fewer words in it.

const VOCA_CHAPTER = `<div class="voc-box"><table class="voca">
  <tr><td>\u304e\u3093\u3053\u3046</td><td>bank</td></tr>
  <tr><td>(\u304a)\u3066\u3089</td><td>temple</td></tr>
  <tr><td>\u307e\u3063\u305f\u304f\u306a\u3044\u3053\u3068\u3070</td><td>a word no card teaches</td></tr>
</table></div>`;

function writeCachedChapter(libraryRoot, epubHash, number, html) {
  const dir = join(libraryRoot, "epubs", epubHash, `cache-v${CACHE_VERSION}`, "chapters");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${number}.xhtml`), html);
}

test("vocab coverage: a headword no card teaches is named, with its nearest card", () => {
  const { root, cleanup } = makeOutputRoot();
  const library = makeOutputRoot();
  try {
    writeCachedChapter(library.root, "h", 11, VOCA_CHAPTER);
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
      items: [
        card("a", { target: "\u304e\u3093\u3053\u3046\u306b\u3044\u304d\u307e\u3059" }),
        card("b", { target: "\u304a\u3066\u3089" }),
      ],
    });

    const found = messages(runOnly(root, "vocab-coverage", { libraryHomeDir: library.root }));
    assert.equal(found.length, 1, "only the headword nothing covers");
    assert.match(found[0], /\u307e\u3063\u305f\u304f\u306a\u3044\u3053\u3068\u3070/);
  } finally {
    cleanup();
    library.cleanup();
  }
});

test("vocab coverage: an -extras unit is not diffed against its base chapter's vocabulary", () => {
  const { root, cleanup } = makeOutputRoot();
  const library = makeOutputRoot();
  try {
    writeCachedChapter(library.root, "h", 11, VOCA_CHAPTER);
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
      items: [
        card("a", { target: "\u304e\u3093\u3053\u3046" }),
        card("b", { target: "\u304a\u3066\u3089" }),
      ],
    });
    writeUnit(root, "epubs/book/chapter-1-extras", {
      meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
      items: [card("drill", { target: "\u304e\u3093\u3053\u3046\u306b\u3044\u304d\u307e\u3059" })],
    });

    const found = messages(runOnly(root, "vocab-coverage", { libraryHomeDir: library.root }));
    assert.equal(found.length, 1, "the extras unit adds no second copy of the report");
  } finally {
    cleanup();
    library.cleanup();
  }
});

// A check that reports "all covered" for files it never opened is the exact failure the audit module
// exists to prevent, and the chapter cache is untracked — a fresh clone has none of it.
test("vocab coverage: no cached chapter file is a SKIP, never a pass", () => {
  const { root, cleanup } = makeOutputRoot();
  const empty = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      meta: { epubHash: "h", chapterNumber: 11, reviewed: true },
      items: [card("a")],
    });
    const [result] = runOnly(root, "vocab-coverage", { libraryHomeDir: empty.root });
    assert.match(result.skipped, /no cached chapter file/);
  } finally {
    cleanup();
    empty.cleanup();
  }
});

test("romaji style: a card breaking the pinned spec is named with the rule it breaks", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [
        card("clean", { pronunciation: "konnichiwa" }),
        card("period", { pronunciation: "konnichiwa." }),
        card("labial", { pronunciation: "kombini" }),
      ],
    });
    const found = messages(runOnly(root, "romaji-style"));
    assert.equal(found.length, 2);
    assert.ok(found.some((m) => /no-terminal-punctuation/.test(m)));
    assert.ok(found.some((m) => /n-before-labial/.test(m)));
  } finally {
    cleanup();
  }
});

test("romaji style: an EXCLUDED card is not linted, and a non-ja deck is not linted at all", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("dropped", { pronunciation: "kombini.", excluded: true })],
    });
    writeUnit(root, "epubs/spanish/chapter-1", {
      meta: { targetLanguage: "es" },
      items: [card("hola", { pronunciation: "hola." })],
    });
    assert.deepEqual(messages(runOnly(root, "romaji-style")), []);
  } finally {
    cleanup();
  }
});

// The finding key is per-card AND per-rule: accepting one deviation must not blanket-accept the next.
test("romaji style: one card breaking two rules produces two separately-keyed findings", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("both", { pronunciation: "kombini desu." })],
    });
    const keys = runOnly(root, "romaji-style").flatMap((r) => r.findings.map((f) => f.key));
    assert.deepEqual(keys.sort(), [
      "chapter-1/both::n-before-labial",
      "chapter-1/both::no-terminal-punctuation",
    ]);
  } finally {
    cleanup();
  }
});

test("inline romaji: a note's parenthetical is checked against this deck's own pronunciation", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("ohayou", { target: "おはよう", pronunciation: "ohayō" })],
    });
    writeUnit(root, "epubs/book/chapter-2", {
      items: [
        card("agree", { note: "compare おはよう (ohayou), the casual one" }),
        card("fine", { note: "compare おはよう (ohayō), the casual one" }),
      ],
    });
    const found = messages(runOnly(root, "inline-romaji"));
    assert.equal(found.length, 1);
    assert.match(found[0], /this deck's own card says "ohayō"/);
  } finally {
    cleanup();
  }
});

// Case, spaces and hyphens are the romaji-style check's business, not this one's — otherwise every
// honorific in the deck would be reported twice.
test("inline romaji: a spelling differing only in case or spacing is not a disagreement", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("tanaka", { target: "たなかさん", pronunciation: "Tanaka-san" })],
    });
    writeUnit(root, "epubs/book/chapter-2", {
      items: [card("ref", { note: "as in たなかさん (tanaka san)" })],
    });
    assert.deepEqual(messages(runOnly(root, "inline-romaji")), []);
  } finally {
    cleanup();
  }
});

// A quoted string with no card of its own has no ground truth here. Reporting that count is the
// difference between "checked and clean" and "could not check".
test("inline romaji: an unresolvable quote is counted as unchecked, not as a pass", () => {
  const { root, cleanup } = makeOutputRoot();
  try {
    writeUnit(root, "epubs/book/chapter-1", {
      items: [card("only", { note: "the ～ます (masu) ending" })],
    });
    const [result] = runOnly(root, "inline-romaji");
    assert.equal(result.findings.length, 0);
    assert.ok(result.notes.some((n) => /no card for/.test(n)));
  } finally {
    cleanup();
  }
});

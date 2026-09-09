import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { extractChapterViaLlm } from "../corpus/epubLlmExtract.js";
import {
  renderForwardFlagIndexPrompt,
  parseForwardFlagResponse,
} from "../corpus/epubForwardFlags.js";
import { sortItemsPedagogically } from "../corpus/pedagogicalSort.js";
import { assembleCorpusFromLessonWords } from "../corpus/lessonCorpus.js";
import { dedupeByPattern } from "../cards/semanticDedup.js";
import {
  runExtractionClaude,
  runForwardFlagsClaude,
  runPedagogicalSortClaude,
} from "../corpus/epubLlmRunClaude.js";
import { runCategorizeClaude, runSemanticDedupClaude } from "../translate/runClaude.js";
import { resolveIso639Code } from "../model/iso639.js";
import { diffItemSets, orderDisagreement } from "../cards/itemSetDiff.js";
import { formatItemSetReport, formatIdSetReport } from "./report.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(join(MODULE_DIR, "..", ".."));

const repoPath = (...parts) => join(REPO_ROOT, ...parts);

// The one book with reviewed, TRACKED data: its reviewed corpora, its cached conventions doc and its
// taught-content index are all committed (see .gitignore), which is what makes these fixtures
// reproducible on a fresh clone rather than only on the owner's laptop.
/**
 * A fixture's target language, or a hard failure naming the file.
 *
 * Fixtures read reviewed, tracked corpora, so a missing `targetLanguage` is a broken fixture rather
 * than a language to guess at. This used to default to "ja", which would have silently evaluated a
 * Spanish fixture against Japanese rules and reported the diff as a prompt regression.
 */
function requireLanguage(meta, path) {
  const code = meta?.targetLanguage;
  if (typeof code === "string" && code.trim()) return code;
  throw new Error(`fixture source has no meta.targetLanguage: ${path}`);
}

const BOOK_HASH = "1fab0f99d1195ad9";
const bookPath = (...parts) => repoPath(".anki-builder", "epubs", BOOK_HASH, ...parts);

// Mid-book, 79 reviewed items, a full spread of categories and nine forward-flagged items — enough
// surface for a prompt edit to show up in, and far enough in that the chapter leans on the book's
// established conventions rather than on the opening chapters' hand-holding.
const REFERENCE_CHAPTER = 25;

const FIXTURE_DIR = repoPath("test", "fixtures", "evals");

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

function loadReferenceCorpus(chapterNumber = REFERENCE_CHAPTER) {
  const path = bookPath("corpora", `${chapterNumber}.json`);
  const corpus = readJson(path);
  return {
    path,
    items: corpus.items,
    targetLanguage: requireLanguage(corpus.meta, path),
    label: corpus.meta?.chapterLabel ?? `chapter ${chapterNumber}`,
  };
}

function loadConventions() {
  const path = bookPath("conventions.md");
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

const BOOK_DECK_DIR = repoPath("output", "epubs", "japanese-for-busy-people-book-1-kana");

/**
 * The ids of practice cards the fill-in-the-blank pass MINED for a chapter, read out of the tracked
 * decks built from it.
 *
 * The reviewed corpus in the dedup library is snapshotted at "Mark reviewed", which happens after
 * `prepare` — so it contains this chapter's mined drills alongside the extracted items. Diffing an
 * extraction run against it unfiltered would report every drill as an extraction MISS, which is both
 * wrong and, at ten items a chapter, loud enough to bury the real misses. Nothing in the corpus
 * itself distinguishes a drill (`aiSuggested` is set by extraction too), so the marker is read from
 * where it actually lives: `fillInBlank: true` on the deck's cards.json.
 */
function drillIds(chapterNumber) {
  const ids = new Set();
  if (!existsSync(BOOK_DECK_DIR)) return ids;
  for (const entry of readdirSync(BOOK_DECK_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const cardsPath = join(BOOK_DECK_DIR, entry.name, "cards.json");
    if (!existsSync(cardsPath)) continue;
    let cards;
    try {
      cards = readJson(cardsPath);
    } catch {
      continue; // an unreadable deck must not take down the eval for a different one
    }
    if (cards.meta?.chapterNumber !== chapterNumber) continue;
    for (const item of cards.items ?? []) {
      if (item.fillInBlank) ids.add(item.id);
    }
  }
  return ids;
}

function missing(path) {
  return { ok: false, reason: `fixture input is missing: ${path}` };
}

/**
 * ---------------------------------------------------------------------------
 * EXTRACTION — the one that matters most, and the reason this harness exists.
 * ---------------------------------------------------------------------------
 * Chapter extraction is the only pass whose failures are unrecoverable: an item it never emits is
 * never seen by anyone again, so a prompt edit that quietly stops picking up a class of content
 * leaves no trace anywhere downstream. This fixture is what makes such an edit visible.
 */
const extractionFixture = {
  name: "extraction",
  pass: "chapter extraction",
  module: "src/corpus/epubLlmExtract.js",
  prompt: "docs/epub-extraction-prompt.md",
  liveRunClaude: runExtractionClaude,
  describe() {
    const chapterPath = join(FIXTURE_DIR, "chapters", `${REFERENCE_CHAPTER}.xhtml`);
    return [
      `input:     ${chapterPath}`,
      `reference: ${bookPath("corpora", `${REFERENCE_CHAPTER}.json`)} (human-reviewed)`,
      `grounding: ${bookPath("conventions.md")}`,
    ].join("\n");
  },
  available() {
    const chapterPath = join(FIXTURE_DIR, "chapters", `${REFERENCE_CHAPTER}.xhtml`);
    if (!existsSync(chapterPath)) return missing(chapterPath);
    const corpusPath = bookPath("corpora", `${REFERENCE_CHAPTER}.json`);
    if (!existsSync(corpusPath)) return missing(corpusPath);
    return { ok: true };
  },
  run({ runClaude }) {
    const reference = loadReferenceCorpus();
    const drills = drillIds(REFERENCE_CHAPTER);
    const referenceItems = reference.items.filter((item) => !drills.has(item.id));

    // The extractor answers with an envelope now (items plus the model's own coverage report); the
    // eval compares ITEMS. The coverage half is reported below, because "which images did it open"
    // is exactly the kind of thing a before/after is for.
    const { items: candidate, coverage } = extractChapterViaLlm({
      chapterFilePath: join(FIXTURE_DIR, "chapters", `${REFERENCE_CHAPTER}.xhtml`),
      targetLanguage: reference.targetLanguage,
      bookConventions: loadConventions(),
      runClaude,
    });

    const diff = diffItemSets(referenceItems, candidate, {
      languageCode: resolveIso639Code(reference.targetLanguage),
    });
    return {
      candidate,
      report: [
        `reference excludes ${drills.size} fill-in-the-blank drill(s) a later pass mined ` +
          `(extraction never produces those).`,
        coverage
          ? `coverage: ${coverage.imagesOpened.length} image(s) opened, ` +
            `${coverage.imagesSkippedAsDecorative.length} skipped as decorative, ` +
            `${coverage.concerns.length} concern(s)` +
            coverage.concerns.map((c) => `\n  - ${c}`).join("")
          : "coverage: none reported (the response was a bare item array)",
        "",
        formatItemSetReport(diff, {
          referenceLabel: "reviewed",
          candidateLabel: "this run",
        }),
        "",
        "ORDER",
        `  the prompt requires textbook order; disagreement vs the reviewed corpus: ` +
          `${formatFraction(orderOfMatched(diff))}`,
      ].join("\n"),
    };
  },
};

/**
 * ---------------------------------------------------------------------------
 * FORWARD FLAGS — which items this chapter teaches too early.
 * ---------------------------------------------------------------------------
 * Run at the prompt/parse seam rather than through `flagForwardConcerns`, because the surrounding
 * function needs the .epub itself (chapter listing, chapter labels) and the .epub is not tracked.
 * What an eval judges here is which ids the model flags; turning a flagged id into a chapter label
 * is deterministic bookkeeping the diff has no opinion about.
 */
const forwardFlagsFixture = {
  name: "forward-flags",
  pass: "forward flag (premature-item) review",
  module: "src/corpus/epubForwardFlags.js",
  prompt: "docs/epub-forward-flag-index-prompt.md",
  liveRunClaude: runForwardFlagsClaude,
  describe() {
    return [
      `input:     the ${REFERENCE_CHAPTER}.json items + ${bookPath("taught-index.json")}`,
      `reference: the items the reviewer LEFT flagged (uncertain + "Possibly premature")`,
    ].join("\n");
  },
  available() {
    const indexPath = bookPath("taught-index.json");
    if (!existsSync(indexPath)) return missing(indexPath);
    return { ok: true };
  },
  run({ runClaude }) {
    const reference = loadReferenceCorpus();
    const taughtIndex = readJson(bookPath("taught-index.json"));

    // The reviewed corpus is what the flag pass PRODUCED and a human then kept, so the reference set
    // is its surviving flags. Feed the pass the same items with those annotations stripped, or it
    // would be re-judging its own answer.
    const referenceFlagged = reference.items
      .filter((item) => item.uncertain && /Possibly premature/.test(item.reviewNote ?? ""))
      .map((item) => item.id);
    const candidateItems = reference.items.map((item) => ({
      ...item,
      uncertain: undefined,
      reviewNote: stripPrematureNote(item.reviewNote),
    }));

    const prompt = renderForwardFlagIndexPrompt({
      targetLanguage: reference.targetLanguage,
      chapterNumber: REFERENCE_CHAPTER,
      candidateItems,
      laterChaptersIndex: taughtIndex.chapters.filter((entry) => entry.chapter > REFERENCE_CHAPTER),
      bookConventions: loadConventions(),
    });
    const entries = parseForwardFlagResponse(runClaude(prompt));

    const byId = new Map(reference.items.map((item) => [item.id, item]));
    return {
      candidate: entries,
      report: formatIdSetReport(
        referenceFlagged,
        entries.map((entry) => entry.id),
        {
          describeId: (id) => {
            const item = byId.get(id);
            const entry = entries.find((e) => e.id === id);
            const label = item ? `${item.english} / ${item.target}` : "(id not in this chapter)";
            return entry ? `${label} — ${entry.reason}` : label;
          },
        },
      ),
    };
  },
};

/**
 * ---------------------------------------------------------------------------
 * PEDAGOGICAL SORT — atoms before molecules.
 * ---------------------------------------------------------------------------
 * The reviewed corpus's own order is the reference. The input is that same set in a DETERMINISTIC
 * shuffle (seeded, so two runs compare like with like), which is the only honest way to ask the
 * question from tracked data: given this chapter's items in an arbitrary order, does the pass
 * recover the order a human signed off?
 */
const sortFixture = {
  name: "sort",
  pass: "pedagogical sort",
  module: "src/corpus/pedagogicalSort.js",
  prompt: "docs/pedagogical-sort-prompt.md",
  liveRunClaude: runPedagogicalSortClaude,
  describe() {
    return [
      `input:     the ${REFERENCE_CHAPTER}.json items, deterministically shuffled`,
      `reference: the reviewed order of ${bookPath("corpora", `${REFERENCE_CHAPTER}.json`)}`,
    ].join("\n");
  },
  available() {
    const corpusPath = bookPath("corpora", `${REFERENCE_CHAPTER}.json`);
    return existsSync(corpusPath) ? { ok: true } : missing(corpusPath);
  },
  run({ runClaude }) {
    const reference = loadReferenceCorpus();
    const shuffled = deterministicShuffle(reference.items);
    const { items } = sortItemsPedagogically({
      items: shuffled,
      targetLanguage: reference.targetLanguage,
      bookConventions: loadConventions(),
      runClaude,
    });

    const referenceIds = reference.items.map((item) => item.id);
    const candidateIds = items.map((item) => item.id);
    const scrambled = orderDisagreement(
      referenceIds,
      shuffled.map((item) => item.id),
    );
    const sorted = orderDisagreement(referenceIds, candidateIds);

    return {
      candidate: candidateIds,
      report: [
        `items: ${referenceIds.length}`,
        `pair disagreement with the reviewed order:`,
        `  shuffled input: ${formatFraction(scrambled.fraction)} (${scrambled.inverted}/${scrambled.pairs} pairs)`,
        `  after the pass: ${formatFraction(sorted.fraction)} (${sorted.inverted}/${sorted.pairs} pairs)`,
        "",
        "A LOWER number after the pass means it moved the set toward the order a human signed off.",
        "It is not a pass/fail: a different valid teaching order also scores worse here, which is",
        "exactly why the sequence itself is printed below for a person to read.",
        "",
        "ORDER PRODUCED BY THIS RUN (reviewed position in brackets)",
        ...candidateIds.map((id, index) => {
          const at = referenceIds.indexOf(id);
          return `  ${String(index + 1).padStart(3)}. ${id} [${at === -1 ? "not in reference" : at + 1}]`;
        }),
      ].join("\n"),
    };
  },
};

/**
 * ---------------------------------------------------------------------------
 * CATEGORY ASSIGNMENT — the dictated-lesson pass.
 * ---------------------------------------------------------------------------
 * Feeds the reviewed chapter's English glosses through the lesson-word categorizer and diffs the
 * categories it picks against the reviewed ones. This is the pass the plan explicitly holds as NOT
 * downgradeable until measured, and this is the measurement.
 */
const categoriesFixture = {
  name: "categories",
  pass: "lesson-word category assignment",
  module: "src/corpus/lessonCorpus.js",
  prompt: "(inline, buildCategorizePrompt)",
  liveRunClaude: runCategorizeClaude,
  describe() {
    return [
      `input:     the English glosses of ${bookPath("corpora", `${REFERENCE_CHAPTER}.json`)}`,
      `reference: the reviewed category on each of those items`,
    ].join("\n");
  },
  available() {
    const corpusPath = bookPath("corpora", `${REFERENCE_CHAPTER}.json`);
    return existsSync(corpusPath) ? { ok: true } : missing(corpusPath);
  },
  run({ runClaude }) {
    const reference = loadReferenceCorpus();
    // The categorizer keys on English alone, so a chapter that glosses two items identically would
    // make the diff ambiguous. Keep the first of each.
    const seen = new Set();
    const unique = reference.items.filter((item) => {
      const key = item.english.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const corpus = assembleCorpusFromLessonWords({
      englishWords: unique.map((item) => item.english),
      targetLanguage: reference.targetLanguage,
      runClaude,
    });

    // Match on english only: this pass has no target to key on (a dictated lesson has none yet).
    const diff = diffItemSets(
      unique.map((item) => ({ english: item.english, category: item.category })),
      corpus.items.map((item) => ({ english: item.english, category: item.category })),
      { languageCode: resolveIso639Code(reference.targetLanguage) },
    );
    return {
      candidate: corpus.items.map((item) => ({ english: item.english, category: item.category })),
      report: formatItemSetReport(diff, {
        referenceLabel: "reviewed",
        candidateLabel: "this run",
      }),
    };
  },
};

/**
 * ---------------------------------------------------------------------------
 * SEMANTIC DE-DUP — which mined practice cards get excluded.
 * ---------------------------------------------------------------------------
 * Reference: the practice cards a real prepare run excluded and the reviewer left excluded, read
 * back out of the tracked deck. The mined `patterns` map that run passed alongside them is NOT
 * stored anywhere, so this fixture re-runs the pass without it: the diff still shows which cards the
 * pass now calls duplicates, but it is a slightly thinner input than the original had. Read the
 * result as "does it still make the same calls", not as a byte-for-byte replay.
 */
const dedupFixture = {
  name: "dedup",
  pass: "semantic de-dup",
  module: "src/cards/semanticDedup.js",
  prompt: "docs/semantic-dedup-prompt.md",
  liveRunClaude: runSemanticDedupClaude,
  deckPath: repoPath("output", "epubs", "japanese-for-busy-people-book-1-kana", "chapter-10"),
  describe() {
    return [
      `input:     ${this.deckPath}/cards.json, with every semantic-dedup exclusion undone`,
      `reference: the practice cards that run excluded and the reviewer kept excluded`,
      `caveat:    the mined pattern map is not tracked, so the pass runs without it`,
    ].join("\n");
  },
  available() {
    const cardsPath = join(this.deckPath, "cards.json");
    return existsSync(cardsPath) ? { ok: true } : missing(cardsPath);
  },
  run({ runClaude }) {
    const cards = readJson(join(this.deckPath, "cards.json"));
    const referenceExcluded = cards.items
      .filter((item) => wasSemanticDedupExcluded(item))
      .map((item) => item.id);

    const input = cards.items.map((item) => {
      if (!wasSemanticDedupExcluded(item)) return { ...item };
      const restored = { ...item };
      delete restored.excluded;
      delete restored.excludedBy;
      delete restored.excludedReason;
      delete restored.reviewNote;
      return restored;
    });

    const { excluded } = dedupeByPattern({
      items: input,
      targetLanguage: requireLanguage(cards.meta, join(this.deckPath, "cards.json")),
      runClaude,
    });

    const byId = new Map(cards.items.map((item) => [item.id, item]));
    return {
      candidate: excluded,
      report: formatIdSetReport(
        referenceExcluded,
        excluded.map((entry) => entry.id),
        {
          describeId: (id) => {
            const item = byId.get(id);
            const entry = excluded.find((e) => e.id === id);
            const label = item ? `${item.english} / ${item.target}` : "(unknown id)";
            return entry ? `${label} — ${entry.reason || entry.pattern}` : label;
          },
        },
      ),
    };
  },
};

export const FIXTURES = [
  extractionFixture,
  forwardFlagsFixture,
  sortFixture,
  categoriesFixture,
  dedupFixture,
];

export function findFixture(name) {
  return FIXTURES.find((fixture) => fixture.name === name);
}

export function recordedPathFor(name) {
  return join(FIXTURE_DIR, "recorded", `${name}.json`);
}

function wasSemanticDedupExcluded(item) {
  if (!item.excluded) return false;
  return item.excludedBy === "semantic-dedup" || /semantic de-dup/i.test(item.reviewNote ?? "");
}

function stripPrematureNote(reviewNote) {
  if (typeof reviewNote !== "string") return reviewNote;
  const kept = reviewNote
    .split(" | ")
    .filter((part) => !/^Possibly premature/.test(part.trim()))
    .join(" | ");
  return kept || null;
}

function orderOfMatched(diff) {
  const pairs = [...diff.matched].sort((a, b) => a.candidateIndex - b.candidateIndex);
  return orderDisagreement(
    [...diff.matched].sort((a, b) => a.referenceIndex - b.referenceIndex).map((p) => p.key),
    pairs.map((p) => p.key),
  ).fraction;
}

function formatFraction(fraction) {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * A fixed-permutation shuffle (xorshift seeded from a constant), so the sort fixture asks the same
 * question every time it runs. A `Math.random` shuffle would make two reports incomparable, which
 * defeats the point of running the fixture before and after a prompt edit.
 */
export function deterministicShuffle(items, seed = 0x9e3779b9) {
  const out = [...items];
  let state = seed >>> 0;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

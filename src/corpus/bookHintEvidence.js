// The evidence a human (or an agent) needs to write a book's `hints`, and NOTHING ELSE.
//
// WHY THIS COUNTS RATHER THAN CONCLUDES. Every hint is a semantic judgement about one publisher's
// markup: which of a book's table classes marks vocabulary, which image filenames mark the start of
// a numbered exercise block, which words its lesson labels begin with. The rule this file exists to
// obey is that no script makes that call. `class="voca"` was hardcoded into `vocabCoverage` for
// months and, on any other book, returned an empty list that read as "zero uncovered headwords" and
// printed clean. A frequency table cannot make that mistake, because a frequency table does not
// claim anything.
//
// So: histograms in, judgement out, and the judgement happens somewhere that can be wrong out loud.
//
// WHY A SAMPLE AND NOT THE WHOLE BOOK. This is free and it stays free. Reading every spine file of a
// 57-file book to count class attributes costs nothing but time, but the evidence stops changing
// long before the book does: a publisher's markup convention is visible in a handful of chapters or
// it is not a convention. The sample is spread across the book rather than taken from the front,
// because front matter is exactly the part that does not look like a lesson.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not read the book's PROSE, and so it cannot tell you
// what the book teaches, in what order, or with what conventions. That is `conventions.md`, it costs
// a paid whole-book pass, and it is a separate deliberate command
// (`anki-builder epub taught-index` has the same shape). Onboarding produces structure; the paid
// passes produce meaning. Keeping them apart is what makes onboarding a thing you can run on a book
// you are only considering.

import { listChapters, readChapter } from "./epubArchive.js";

/** How many spine files to sample. Enough to see a convention repeat; small enough to stay instant. */
export const SAMPLE_SIZE = 12;

const TABLE_PATTERN = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
const CLASS_PATTERN = /\bclass\s*=\s*["']([^"']+)["']/gi;
const TAG_WITH_CLASS = /<(\w+)\b[^>]*\bclass\s*=\s*["']([^"']+)["'][^>]*>/gi;
const IMG_SRC = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

/**
 * Spine positions spread evenly across the book, so the sample is not all front matter.
 *
 * Front matter is the part of a book least likely to look like a lesson, and it is also the part
 * that comes first, which is why "read the first N chapters" is the wrong sample for this question.
 */
export function sampleSpine(count, size = SAMPLE_SIZE) {
  if (count <= 0) return [];
  if (count <= size) return Array.from({ length: count }, (_, i) => i + 1);
  const step = count / size;
  const picked = new Set();
  for (let i = 0; i < size; i++) picked.add(Math.min(count, Math.floor(i * step) + 1));
  return [...picked].sort((a, b) => a - b);
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function ranked(map, limit = 15) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

/**
 * Class attributes on `<table>` elements, and on the elements inside them.
 *
 * Reported separately because the two answer different hints: `vocabularyTableClass` is a class on
 * the table, `vocabularySubRowClass` a class on rows within it that continue the entry above.
 */
export function tableClassEvidence(html) {
  const onTables = new Map();
  const insideTables = new Map();
  for (const match of html.matchAll(TABLE_PATTERN)) {
    const table = match[0];
    const open = table.slice(0, table.indexOf(">") + 1);
    for (const cls of open.matchAll(CLASS_PATTERN)) {
      for (const name of cls[1].split(/\s+/).filter(Boolean)) bump(onTables, name);
    }
    for (const el of table.matchAll(TAG_WITH_CLASS)) {
      if (el[1].toLowerCase() === "table") continue;
      for (const name of el[2].split(/\s+/).filter(Boolean)) bump(insideTables, `${el[1]}.${name}`);
    }
  }
  return { onTables, insideTables, tables: [...html.matchAll(TABLE_PATTERN)].length };
}

// A trailing counter on an image filename, which is what makes a stem a stem: `-3`, `_11`, `-IV`.
// Roman numerals are in here because the one book this pipeline is proven on numbers its exercise
// blocks that way, and stripping only digits left `enum-I`, `enum-II` and `enum-III` as three
// separate stems of six each instead of one stem of forty-five. The pattern that jumps out of a
// frequency table is the one that has been summed.
const TRAILING_COUNTER = /[-_](?:\d+|[ivxlcdm]+)$/i;

/**
 * Leading filename stems of the images a chapter references, with the trailing counter stripped.
 *
 * `enum-3.jpg` and `enum-11.jpg` both become `enum`, which is the shape a numbered-block marker has:
 * one repeated stem carrying a changing number. A stem appearing once is a picture; a stem appearing
 * in a run across many chapters is a candidate marker, and which of them is which is the judgement
 * this file leaves alone.
 */
export function imageStemEvidence(html) {
  const stems = new Map();
  for (const match of html.matchAll(IMG_SRC)) {
    const file = match[1].split("/").pop() ?? "";
    const stem = file
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(TRAILING_COUNTER, "")
      .trim();
    if (stem) bump(stems, stem);
  }
  return stems;
}

/**
 * The prefix every stem shares, or "" when they do not share one.
 *
 * Publishers put the ISBN on every asset, so the interesting half of a filename can sit forty
 * characters in and the frequency table reads as a wall. Reported separately and stripped from the
 * listing, because the shared part is by definition the part that distinguishes nothing.
 */
export function commonStemPrefix(stems) {
  const names = [...stems];
  if (names.length < 2) return "";
  let prefix = names[0];
  for (const name of names.slice(1)) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) return "";
  }
  // Cut back to a separator so the remainder starts at a word rather than mid-token.
  const cut = Math.max(prefix.lastIndexOf("_"), prefix.lastIndexOf("-"));
  return cut > 0 ? prefix.slice(0, cut + 1) : "";
}

/** The first word of each nav label, which is what `lessonLabelWords` is a list of. */
export function labelWordEvidence(labels) {
  const words = new Map();
  for (const label of labels) {
    const first = String(label ?? "")
      .trim()
      .split(/\s+/)[0];
    if (first) bump(words, first.replace(/[^\p{L}\p{N}]+$/u, ""));
  }
  return words;
}

/**
 * Everything a hint draft needs, from a sample of the book. Free, read-only, and judgement-free.
 *
 * `readSpine` is injectable so the evidence is testable without an EPUB on disk.
 */
export function gatherHintEvidence(
  epubPath,
  { labels = [], sampleSize = SAMPLE_SIZE, readSpine = null, spineCount = null } = {},
) {
  const read = readSpine ?? ((n) => readChapter(epubPath, n));
  const count = spineCount ?? listChapters(epubPath).chapters.length;
  const sample = sampleSpine(count, sampleSize);

  const onTables = new Map();
  const insideTables = new Map();
  const stems = new Map();
  let tables = 0;
  const read_ok = [];

  for (const number of sample) {
    let html;
    try {
      html = read(number);
    } catch {
      // A spine file that will not read is a fact about the book, not a reason to stop counting.
      continue;
    }
    read_ok.push(number);
    const t = tableClassEvidence(html);
    tables += t.tables;
    for (const [k, v] of t.onTables) bump(onTables, k, v);
    for (const [k, v] of t.insideTables) bump(insideTables, k, v);
    for (const [k, v] of imageStemEvidence(html)) bump(stems, k, v);
  }

  return {
    sampledSpine: read_ok,
    spineCount: count,
    tables,
    tableClasses: ranked(onTables),
    inTableClasses: ranked(insideTables),
    imageStemPrefix: commonStemPrefix(stems.keys()),
    imageStems: ranked(stems, 25),
    labelWords: ranked(labelWordEvidence(labels), 20),
  };
}

/**
 * The evidence as text for a person or a prompt.
 *
 * Says what is absent as loudly as what is present. A book whose tables carry no class at all is a
 * real and common answer, and it means `vocabularyTableClass` should stay unset rather than be
 * guessed at: a wrong hint costs recall silently, while a missing one makes the vocabulary check
 * report `unknown`, which is the state that gets looked at.
 */
export function describeHintEvidence(evidence) {
  const lines = [];
  const list = (rows) =>
    rows.length ? rows.map((r) => `${r.value} (${r.count})`).join(", ") : "none";

  lines.push(
    `sampled ${evidence.sampledSpine.length} of ${evidence.spineCount} spine file(s): ` +
      `${evidence.sampledSpine.join(", ")}`,
  );
  lines.push("");
  lines.push(`tables in the sample: ${evidence.tables}`);
  lines.push(`  class on <table>:   ${list(evidence.tableClasses)}`);
  lines.push(`  class inside tables: ${list(evidence.inTableClasses)}`);
  lines.push("");
  const prefix = evidence.imageStemPrefix;
  const stems = prefix
    ? evidence.imageStems.map((r) => ({ ...r, value: r.value.slice(prefix.length) }))
    : evidence.imageStems;
  if (prefix) lines.push(`image filenames all begin "${prefix}" (stripped below)`);
  lines.push(`image filename stems: ${list(stems)}`);
  lines.push("");
  lines.push(`first word of each nav label: ${list(evidence.labelWords)}`);
  lines.push("");
  lines.push(
    "These are counts, not conclusions. Which table class means vocabulary, which stem marks a " +
      "numbered block and which words start a lesson label are judgements. An absent signal is an " +
      "answer: leave the hint unset rather than guess, because a wrong hint costs recall silently " +
      "while a missing one makes the check report unknown.",
  );
  return lines.join("\n");
}

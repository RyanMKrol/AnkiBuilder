// A chapter's own structure: the sections it declares, and the numbered blocks inside them.
//
// WHY. Twice a lesson shipped missing material because the chapter was read as a stream and the
// reading stopped early — Lesson 15's image sweep named four charts and opened two, Lesson 16's text
// read 780 lines of 942 and never saw EXERCISES VI or VII. Both have the same shape: enumerate,
// process a PREFIX, conclude. Nothing is wrong with any individual step, and the failure is invisible
// from inside, because a chapter you stopped reading looks exactly like a chapter that ended.
//
// The fix is an account of what there IS, produced before the reading starts. Purely structural: it
// says nothing about what belongs on a card, which is a judgement, and exists so that judgement gets
// made about every section rather than about a prefix of them.

/** Tags stripped, entities folded, whitespace collapsed. */
export function plainText(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every `<h1>`-`<h6>` in document order, as `{ level, title, at }`.
 *
 * Matches the whole ELEMENT and strips it, because a heading carries its text nested
 * (`<h2><span><b>EXERCISES</b></span></h2>`). The obvious `>([^<]*)<` yields an empty title for every
 * heading in this publisher's markup, which reads as a chapter with no structure at all.
 */
export function parseHeadings(html) {
  return [...String(html).matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    title: plainText(m[2]) || "(untitled — check the markup)",
    at: m.index,
  }));
}

/**
 * The book's own numbered blocks, from the roman-numeral images it heads them with
 * (`…_enum-VII.jpg`, `…_wnum-II.jpg`). This numbering is the strongest coverage signal a chapter
 * carries: a hole in the run is a block nobody looked at, visible without knowing what should be
 * there.
 *
 * The marker sits INSIDE a filename, after an underscore. A `\b` before it therefore never matches
 * (`_` is a word character) — that mistake returned zero blocks for a chapter holding twelve, a
 * silent zero in the very function written to stop silent misses.
 */
export function parseNumberedBlocks(html) {
  return [...String(html).matchAll(/(enum|wnum)-([IVX]+)\.(?:jpg|jpeg|png|gif)/gi)].map((m) => ({
    kind: m[1].toLowerCase() === "enum" ? "EXERCISES" : "WORD POWER",
    numeral: m[2].toUpperCase(),
    at: m.index,
  }));
}

const ROMAN = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
];

/**
 * `{ chars, sections, groups }` for one chapter's XHTML.
 *
 * `sections` are the headings with the size of the text under each, and the numbered blocks that
 * fall inside them. `groups` collects the numbered blocks by kind and reports any gap in the
 * numbering — a run of I,II,III,V has lost IV, and that is the shape of a block nobody read.
 */
export function chapterOutline(html) {
  const headings = parseHeadings(html);
  const numbered = parseNumberedBlocks(html);

  const sections = headings.map((h, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].at : String(html).length;
    return {
      level: h.level,
      title: h.title,
      chars: plainText(String(html).slice(h.at, end)).length,
      blocks: numbered.filter((n) => n.at >= h.at && n.at < end).map((n) => n.numeral),
      at: h.at,
      end,
    };
  });

  const groups = [];
  for (const kind of ["EXERCISES", "WORD POWER"]) {
    const got = numbered.filter((n) => n.kind === kind).map((n) => n.numeral);
    if (got.length === 0) continue;
    // Gaps are judged against a run of the same LENGTH starting at I: the blocks are numbered
    // consecutively by the publisher, so I,II,III,V is five blocks' worth of numbering with four
    // present, and IV is the one to go and look for.
    const expected = ROMAN.slice(0, Math.max(got.length, ROMAN.indexOf(got[got.length - 1]) + 1));
    groups.push({ kind, numerals: got, missing: expected.filter((r) => !got.includes(r)) });
  }

  return { chars: plainText(html).length, sections, groups };
}

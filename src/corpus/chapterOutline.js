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
//
// ── What is universal here, and what is one publisher's ──────────────────────────────────────────
//
// `chars`, `images` and the headings are generic: any EPUB is HTML, and the caller already holds
// exactly one chapter's bytes because extractChapterToFile bounded them. Those are the parts a
// completeness guarantee may rest on.
//
// `groups` is NOT generic. It reads the roman-numeral marker images this one textbook heads its
// exercise blocks with (`…_enum-VII.jpg`), and on that book it is the sharpest coverage signal there
// is. On the same book's front matter it is empty, and on a novel it will always be empty. So it is
// reported as a bonus and never as the backbone: an empty `groups` must read as "this book does not
// number things", never as "there is nothing to read".

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
export function parseNumberedBlocks(html, markers = []) {
  const source = String(html);
  const blocks = [];
  for (const { filenamePrefix, label } of markers) {
    if (!filenamePrefix || !label) continue;
    const pattern = new RegExp(
      `${escapeForRegExp(filenamePrefix)}-([IVXLCDM]+)\\.(?:jpg|jpeg|png|gif|svg)`,
      "gi",
    );
    for (const m of source.matchAll(pattern)) {
      blocks.push({ kind: label, numeral: m[1].toUpperCase(), at: m.index });
    }
  }
  return blocks.sort((a, b) => a.at - b.at);
}

function escapeForRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Roman numerals are COMPUTED rather than listed. The previous version was a literal array that
// stopped at XIV, so a book numbering fifteen or more blocks would have silently mis-reported its
// gaps: `expected` could never contain XV, so a missing XV was invisible in exactly the check
// written to make a missed block visible. A ceiling nobody states is the failure this file exists
// to remove, so there is now no ceiling.
const ROMAN_UNITS = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(value) {
  let n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  let out = "";
  for (const [size, glyph] of ROMAN_UNITS) {
    while (n >= size) {
      out += glyph;
      n -= size;
    }
  }
  return out;
}

export function fromRoman(text) {
  const upper = String(text).toUpperCase();
  if (!/^[IVXLCDM]+$/.test(upper)) return null;
  const value = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const here = value[upper[i]];
    const next = value[upper[i + 1]] ?? 0;
    total += here < next ? -here : here;
  }
  return toRoman(total) === upper ? total : null;
}

/**
 * `{ chars, sections, groups }` for one chapter's XHTML.
 *
 * `sections` are the headings with the size of the text under each, and the numbered blocks that
 * fall inside them. `groups` collects the numbered blocks by kind and reports any gap in the
 * numbering — a run of I,II,III,V has lost IV, and that is the shape of a block nobody read.
 */
/**
 * How many images the chapter references. Generic, and load-bearing on its own: a chapter with very
 * little text and many images is one whose CONTENT is in the pictures — this book's kana tables are
 * 47 characters of text and dozens of figures — and that is a real shape, not an empty chapter.
 */
export function countImages(html) {
  return [...String(html).matchAll(/<img\b/gi)].length;
}

export function chapterOutline(html, { markers = [] } = {}) {
  const headings = parseHeadings(html);
  const numbered = parseNumberedBlocks(html, markers);

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
  // Kinds come from the book's own markers, in the order it declares them, so a book that numbers
  // something this one has never heard of is reported the same way.
  for (const kind of [...new Set(markers.map((m) => m.label).filter(Boolean))]) {
    const got = numbered.filter((n) => n.kind === kind).map((n) => n.numeral);
    if (got.length === 0) continue;
    // Gaps are judged against a run of the same LENGTH starting at I: the blocks are numbered
    // consecutively by the publisher, so I,II,III,V is five blocks' worth of numbering with four
    // present, and IV is the one to go and look for.
    const highest = Math.max(got.length, ...got.map((r) => fromRoman(r) ?? 0));
    const expected = Array.from({ length: highest }, (_, i) => toRoman(i + 1));
    groups.push({ kind, numerals: got, missing: expected.filter((r) => !got.includes(r)) });
  }

  return { chars: plainText(html).length, images: countImages(html), sections, groups };
}

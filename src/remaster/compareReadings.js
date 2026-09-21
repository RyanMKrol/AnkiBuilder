// Two independent transcriptions of one page, compared in order.
//
// Transcription samples, so two runs of the same page can differ, and where they differ is where
// one of them is likely wrong. Agreement between two runs is the strongest evidence this pipeline
// has that a page is right; disagreement points at the exact span to look at. The OCR cross-check
// cannot do this for short lines (see the measurements in ocrCrossCheck.js), because its failures
// are its own. Two Claude runs share a model's blind spots instead, which is why the OCR stays in as
// a third reader rather than being replaced by this.
//
// What is compared is the transcribed TEXT in order, and separately the furigana in order, so a
// wrong reading is a difference. Left out: markup (one run's <p> is another's <td>), whitespace,
// case, punctuation, and the model's own words (illustration descriptions and figure boxes), which
// differ between runs by nature and say nothing about whether the book was copied faithfully.

function stripMarkup(html) {
  return html
    .replace(/<figcaption>[\s\S]*?<\/figcaption>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .normalize("NFKC");
}

// Kana, kanji, Latin letters and digits, lower-cased: the content two faithful copies must share.
// Case and punctuation are out because they are where two faithful runs differ harmlessly on Genki
// Lesson 1 (small caps read as ADDITIONAL or Additional, "Mearii:" with or without its colon).
const CONTENT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々a-z0-9]/u;

function contentOnly(text) {
  let out = "";
  for (const ch of text.toLowerCase()) if (CONTENT.test(ch)) out += ch;
  return out;
}

/**
 * The comparable text of one page's body, as two streams: the printed text, and the furigana in
 * order. Split because two faithful runs group ruby differently (表現《ひょうげん》 against
 * 表《ひょう》現《げん》): the concatenated readings agree even when the grouping does not.
 */
export function readingText(body) {
  const readings = [...body.matchAll(/<rt>([\s\S]*?)<\/rt>/g)].map((m) => m[1]).join("");
  return {
    text: contentOnly(stripMarkup(body.replace(/<rt>[\s\S]*?<\/rt>/g, " "))),
    readings: contentOnly(stripMarkup(readings)),
  };
}

/**
 * Character-level diff by longest common subsequence, after trimming the shared prefix and
 * suffix (on pages that mostly agree, that leaves very little to align). Returns the differing
 * spans, each with a few characters of shared context either side so a person can find it.
 */
export function diffReadings(a, b, { context = 10 } = {}) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  // LCS table over the middle only.
  const rows = midA.length + 1;
  const cols = midB.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        midA[i] === midB[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  // Walk it, collecting runs of edits as spans.
  const spans = [];
  let i = 0;
  let j = 0;
  let open = null;
  const close = () => {
    if (!open) return;
    const at = start + open.atA;
    spans.push({
      a: open.a,
      b: open.b,
      before: a.slice(Math.max(0, at - context), at),
      after: a.slice(start + i, start + i + context),
    });
    open = null;
  };
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      close();
      i++;
      j++;
    } else if (
      j >= midB.length ||
      (i < midA.length && table[(i + 1) * cols + j] >= table[i * cols + j + 1])
    ) {
      open ??= { a: "", b: "", atA: i };
      open.a += midA[i++];
    } else {
      open ??= { a: "", b: "", atA: i };
      open.b += midB[j++];
    }
  }
  close();

  const lcs = start + (a.length - endA) + table[0];
  const longest = Math.max(a.length, b.length);
  return { spans, agreement: longest ? lcs / longest : 1 };
}

/**
 * A span one run has and the other has elsewhere is a MOVE: two runs serialized side-by-side
 * columns in different orders (Genki page 52's dialogue beside its translation). Moves are
 * reported but are not disagreements about content. Only spans of at least `minMoved` characters
 * are tested, since a two-character span is found somewhere on almost any page.
 */
function classify(spans, textA, textB, minMoved = 4) {
  return spans.map((span) => {
    const aMoved = span.a.length >= minMoved && textB.includes(span.a);
    const bMoved = span.b.length >= minMoved && textA.includes(span.b);
    const moved = (span.a.length === 0 || aMoved) && (span.b.length === 0 || bMoved);
    return { ...span, moved };
  });
}

function charCounts(text) {
  const counts = new Map();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return counts;
}

/**
 * Characters one text has more of than the other, as `{ onlyA, onlyB }` counts. Zero both ways
 * means the same content in a different order: Genki page 64's minutes grid read row-first by one
 * run and column-first by the other, which a span-by-span diff cannot pair up.
 */
export function contentDelta(a, b) {
  const ca = charCounts(a);
  const cb = charCounts(b);
  let onlyA = 0;
  let onlyB = 0;
  for (const [ch, n] of ca) onlyA += Math.max(0, n - (cb.get(ch) ?? 0));
  for (const [ch, n] of cb) onlyB += Math.max(0, n - (ca.get(ch) ?? 0));
  return { onlyA, onlyB };
}

export function compareReadings(bodyA, bodyB) {
  const a = readingText(bodyA);
  const b = readingText(bodyB);
  const text = diffReadings(a.text, b.text);
  const readings = diffReadings(a.readings, b.readings);
  const textSpans = classify(text.spans, a.text, b.text);
  const readingSpans = classify(readings.spans, a.readings, b.readings);
  // A stream whose characters balance exactly has only moved; its spans are all moves.
  const textBalanced = Object.values(contentDelta(a.text, b.text)).every((n) => n === 0);
  const readingsBalanced = Object.values(contentDelta(a.readings, b.readings)).every(
    (n) => n === 0,
  );
  const real = [
    ...(textBalanced ? [] : textSpans.filter((s) => !s.moved)).map((s) => ({
      ...s,
      stream: "text",
    })),
    ...(readingsBalanced ? [] : readingSpans.filter((s) => !s.moved)).map((s) => ({
      ...s,
      stream: "furigana",
    })),
  ];
  return {
    agrees: real.length === 0,
    differences: real,
    moved:
      (textBalanced ? textSpans.length : textSpans.filter((s) => s.moved).length) +
      (readingsBalanced ? readingSpans.length : readingSpans.filter((s) => s.moved).length),
    agreement: text.agreement,
  };
}

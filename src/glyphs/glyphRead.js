import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate } from "../util/promptTemplate.js";

// Reading the pictures, and deciding which readings can be trusted.
//
// Three readers, chosen because they fail differently: two independent model readings (A and B,
// the same prompt run twice) and Apple Vision OCR (free, local). A picture is accepted without
// further work only when all three say the same thing. Everything else goes to the settle pass, a
// stronger model shown the picture, all three readings and the sentences it sits in.
//
// The readers are NOT shown the sentence. A reader that can see "べものが おいしい" will write 食
// whatever the picture says, and two readers guessing the same word from the same sentence would
// agree with each other and both be wrong. Only the settle pass sees context, and its prompt says
// the picture decides.

const DOCS = resolve(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs"));
const READ_TEMPLATE = join(DOCS, "glyph-read-prompt.md");
const SETTLE_TEMPLATE = join(DOCS, "glyph-settle-prompt.md");

const KANA_ONLY = /^[぀-ゟ゠-ヿー]*$/;

export function renderReadPrompt({ bookTitle, batch }) {
  return renderPromptTemplate(READ_TEMPLATE, {
    BOOK_TITLE: bookTitle ?? "(untitled)",
    GLYPH_LIST: batch.map((g) => `- ${g.id}: ${resolve(g.imagePath)}`).join("\n"),
  });
}

function describeReading(entry) {
  if (!entry) return "(none)";
  if (entry.kind === "other") return `not writing (${entry.note || "no note"})`;
  return `text "${entry.text}", reading "${entry.reading}"`;
}

// How far apart two fragments' vertical centres can be (as a fraction of the picture's height)
// and still sit on one printed line. Vision often splits the small reading into pieces, and a
// piece's box can be taller than its neighbour's (に and ほん of 日本語 came back at different
// heights); the word line and the reading line are about half the picture apart.
const SAME_ROW = 0.2;

/**
 * The OCR's text as printed rows, top row first, each row's fragments left to right. Sorting the
 * fragments by height alone read 日本語's reading as "ご", "にほん".
 */
export function ocrText(ocr) {
  const rows = [];
  const lines = [...(ocr?.lines ?? [])]
    .map((line) => ({ ...line, centre: line.y + line.h / 2 }))
    .sort((a, b) => b.centre - a.centre);
  for (const line of lines) {
    const row = rows.find((r) => Math.abs(r.centre - line.centre) < SAME_ROW);
    if (row) row.lines.push(line);
    else rows.push({ centre: line.centre, lines: [line] });
  }
  return rows
    .map((row) =>
      row.lines
        .sort((a, b) => a.x - b.x)
        .map((line) => line.text.replace(/\s+/g, ""))
        .join(""),
    )
    .filter(Boolean);
}

export function renderSettlePrompt({ bookTitle, items }) {
  const blocks = items.map(({ glyph, a, b, ocr }) => {
    const ocrLines = ocrText(ocr);
    const uses = glyph.contexts.map((c) => `  - …${c.before}[?]${c.after}…`).join("\n");
    return [
      `### ${glyph.id}`,
      `Picture: ${resolve(glyph.imagePath)}`,
      `Used ${glyph.uses} time(s), e.g.:`,
      uses || "  - (no context)",
      `A: ${describeReading(a)}`,
      `B: ${describeReading(b)}`,
      `OCR, top line first: ${ocrLines.length ? ocrLines.map((l) => `"${l}"`).join(", ") : "(nothing read)"}`,
    ].join("\n");
  });
  return renderPromptTemplate(SETTLE_TEMPLATE, {
    BOOK_TITLE: bookTitle ?? "(untitled)",
    ITEMS: blocks.join("\n\n"),
  });
}

function clean(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, "");
}

/**
 * `{ entries: Map<id, {kind, text, reading, note}>, problems }` from a reader's or settler's reply.
 * The LAST <glyphs> block counts (a model that corrects itself writes two). Every expected id must
 * be there exactly once; an entry that breaks a rule is reported and left out, so the caller can
 * retry the batch rather than keep half of it.
 */
export function parseGlyphReply(raw, expectedIds) {
  const match = [...raw.matchAll(/<glyphs>([\s\S]*?)<\/glyphs>/g)].at(-1);
  if (!match) return { entries: new Map(), problems: ["the reply has no <glyphs> block"] };
  let list;
  try {
    list = JSON.parse(match[1]);
  } catch (error) {
    return { entries: new Map(), problems: [`the <glyphs> block is not JSON: ${error.message}`] };
  }
  if (!Array.isArray(list)) return { entries: new Map(), problems: ["<glyphs> is not a list"] };

  const expected = new Set(expectedIds);
  const entries = new Map();
  const problems = [];
  for (const item of list) {
    const id = item?.id;
    if (!expected.has(id)) {
      problems.push(`unexpected id ${JSON.stringify(id)}`);
      continue;
    }
    if (entries.has(id)) {
      problems.push(`${id} appears twice`);
      continue;
    }
    const kind = item.kind;
    const text = clean(item.text);
    const reading = clean(item.reading);
    const note = String(item.note ?? "").trim();
    if (kind !== "text" && kind !== "other") {
      problems.push(`${id}: kind must be "text" or "other", got ${JSON.stringify(kind)}`);
      continue;
    }
    if (kind === "text" && !text) {
      problems.push(`${id}: kind "text" with no text`);
      continue;
    }
    if (!KANA_ONLY.test(reading)) {
      problems.push(`${id}: the reading "${reading}" is not kana`);
      continue;
    }
    entries.set(
      id,
      kind === "other" ? { kind, text: "", reading: "", note } : { kind, text, reading, note },
    );
  }
  for (const id of expected) {
    if (!entries.has(id) && !problems.some((p) => p.startsWith(`${id}:`))) {
      problems.push(`${id} is missing`);
    }
  }
  return { entries, problems };
}

export function sameReading(a, b) {
  return Boolean(a && b) && a.kind === b.kind && a.text === b.text && a.reading === b.reading;
}

// Vision writes small kana full size (きよねん for きょねん); folding both sides is the only way the
// OCR can agree with a correct reading at all.
const SMALL_TO_FULL = Object.fromEntries(
  [..."ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ"].map((small, i) => [
    small,
    "あいうえおつやゆよわアイウエオツヤユヨワカケ"[i],
  ]),
);

export function foldSmallKana(text) {
  return [...text].map((c) => SMALL_TO_FULL[c] ?? c).join("");
}

/**
 * What the OCR says about one reading: "agrees" when its lines, top to bottom, spell the text and
 * then the reading (small kana folded); "silent" when it read nothing; "differs" otherwise. A
 * picture with the reading printed ABOVE the text reads reading-first, so both orders count.
 */
export function ocrVerdict(ocr, entry) {
  const lines = ocrText(ocr);
  if (!lines.length) return "silent";
  if (!entry || entry.kind !== "text") return "differs";
  const read = foldSmallKana(lines.join(""));
  const below = foldSmallKana(entry.text + entry.reading);
  const above = foldSmallKana(entry.reading + entry.text);
  return read === below || read === above ? "agrees" : "differs";
}

/**
 * Whether a picture can be accepted on its readings alone: A and B identical, and the OCR agreeing.
 * A picture both readers call "other" is accepted without the OCR, which reads a drawing as noise.
 */
export function acceptedWithoutSettle(a, b, ocr) {
  if (!sameReading(a, b)) return false;
  if (a.kind === "other") return true;
  return ocrVerdict(ocr, a) === "agrees";
}

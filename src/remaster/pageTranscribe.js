import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate } from "../util/promptTemplate.js";

// One page image in, one page of XHTML out. The model opens the image with its own Read tool, the
// same way chapter extraction reads a chapter file, so the prompt carries a path and not pixels.
//
// The model is NOT shown the OCR. The cross-check (ocrCrossCheck.js) only means something if the
// two readings are independent; a model handed the OCR text would copy its mistakes and the check
// would agree with both.

const TEMPLATE = resolve(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "remaster-page-prompt.md"),
);

export function renderPagePrompt({ imagePath, bookTitle, pageNumber, pageCount, entryLabel }) {
  return renderPromptTemplate(TEMPLATE, {
    IMAGE_PATH: resolve(imagePath),
    BOOK_TITLE: bookTitle ?? "(untitled)",
    PAGE_NUMBER: String(pageNumber),
    PAGE_COUNT: String(pageCount),
    ENTRY_LABEL: entryLabel,
  });
}

const VOID = new Set(["br", "hr", "img", "col", "wbr"]);

/**
 * Tag balance, the one structural property every later step depends on. The chapter file is fed
 * to regex-based parsers and to a model; an unclosed <table> swallows the rest of the lesson in
 * both. Returns a list of problems (empty when fine), rather than throwing, so the caller can
 * keep the raw reply for a person to look at.
 */
export function xhtmlProblems(body) {
  const problems = [];
  const stack = [];
  for (const match of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, rawName, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (selfClosing || VOID.has(name)) continue;
    if (!closing) {
      stack.push(name);
      continue;
    }
    const open = stack.pop();
    if (open !== name) {
      problems.push(`</${name}> closes <${open ?? "nothing"}>`);
      if (open) stack.push(open);
    }
  }
  if (stack.length) problems.push(`unclosed: ${stack.map((n) => `<${n}>`).join(" ")}`);
  const bareAmp = body.match(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/);
  if (bareAmp) problems.push("unescaped & in text");
  const rubyWithoutRt = [...body.matchAll(/<ruby>([\s\S]*?)<\/ruby>/g)].filter(
    (m) => !/<rt>/.test(m[1]),
  );
  if (rubyWithoutRt.length) problems.push(`${rubyWithoutRt.length} <ruby> without an <rt>`);
  return problems;
}

function attr(attrs, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  return match ? match[1] : "";
}

/**
 * Parses the model's reply into `{ number, printed, header, tab, body, problems }`. Throws only
 * when there is no <page> element at all; malformed markup inside one is reported in `problems`
 * and left for the caller to decide on.
 */
export function parsePageReply(raw, { pageNumber }) {
  // The LAST complete <page> element. A model that corrects itself mid-reply ("Wait, that heading
  // duplicates the text. Corrected answer:") writes two, and the second is the one it stands by;
  // a greedy match from the first to the last tag glued both into one malformed page.
  const match = [...raw.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)].at(-1);
  if (!match) {
    throw new Error(`page ${pageNumber}: the reply has no <page> element`);
  }
  const [, attrs, inner] = match;
  const number = Number(attr(attrs, "number"));
  const problems = xhtmlProblems(inner);
  if (number !== pageNumber) {
    problems.push(
      `the reply says page ${attr(attrs, "number") || "(none)"}, expected ${pageNumber}`,
    );
  }
  return {
    number: pageNumber,
    printed: attr(attrs, "printed"),
    header: attr(attrs, "header"),
    tab: attr(attrs, "tab"),
    body: inner.trim(),
    problems,
  };
}

/** What a transcript file holds on disk: the page element exactly as the model wrote it. */
export function serializeTranscript(page) {
  return (
    `<page number="${page.number}" printed="${page.printed}" header="${page.header}" ` +
    `tab="${page.tab}">\n${page.body}\n</page>\n`
  );
}

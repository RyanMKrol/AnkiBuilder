// Following a chapter's pointers to the rest of the same book.
//
// A textbook teaches some points by sending the learner elsewhere: "see the appendix (pp. 244, 245)
// for the past form". The chapter itself then prints one example, and every reader that is handed
// only the chapter cards that one example. On Busy People's Casual Style 2 the whole casual past came
// down to a single card until a human opened the appendix the chapter named.
//
// So this finds the pages a chapter points at and hands their text, tables and images to the base
// phase as REFERENCED material. Two standards make it publisher-neutral: page references written the
// way books write them ("p. 12", "pp. 30, 31", "pages 4-6", "12ページ"), and the EPUB page-break
// markers (`epub:type="pagebreak"`, `role="doc-pagebreak"`) that say where each printed page starts.
// A book with no page markers simply resolves nothing, and says so.
//
// Three rules keep it honest:
//   - SAME BOOK ONLY. It reads the one book's chapter cache and nothing else (CLAUDE.md rule 7).
//   - Only LATER pages are followed. A page inside this chapter is already being read, and a page in
//     an earlier part of the book was taught there (the backward dedup knows it). An appendix or a
//     reference section is later, which is the case this exists for. A forward pointer into a later
//     LESSON is followed too; the forward-flag pass is what catches a card stolen from one.
//   - Nothing is dropped in silence. A page the cache cannot find, or one past the cap, is recorded
//     as such in the artifact, where the final review and the learning pass can see it.

import { existsSync, readdirSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { plainText } from "./chapterOutline.js";
import { resolveChapterImages } from "./chapterImages.js";
import { parseTables } from "./chapterTables.js";

/** At most this many pages are followed per chapter, so a pointer-heavy chapter cannot balloon every prompt. */
export const MAX_FOLLOWED_PAGES = 6;
/** Text kept per followed page. Longer pages are cut and marked `truncated`; their images still go. */
export const MAX_PAGE_CHARS = 6000;

const PAGEBREAK_TAG =
  /<[a-z][^>]*(?:epub:type\s*=\s*"[^"]*\bpagebreak\b[^"]*"|role\s*=\s*"doc-pagebreak")[^>]*>/gi;
const ATTR = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");

/** Every printed-page marker in a file, in order, as `{ label, index }`. */
export function pageMarkersIn(html) {
  const seen = new Set();
  const markers = [];
  for (const match of String(html ?? "").matchAll(PAGEBREAK_TAG)) {
    const tag = match[0];
    const label =
      tag.match(ATTR("title"))?.[1] ??
      tag.match(ATTR("aria-label"))?.[1] ??
      tag.match(ATTR("id"))?.[1]?.match(/page[_-]?([0-9a-z]+)$/i)?.[1] ??
      null;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    markers.push({ label: label.trim(), index: match.index });
  }
  return markers;
}

// "p. 12", "pp. 244, 245", "pages 4-6", "p.152", and the CJK "12ページ" / "12頁".
const LATIN_REF = /\b(pp?\.|pages?)\s*(\d{1,4}(?:\s*(?:,|–|-|—)\s*\d{1,4})*)/gi;
const CJK_REF = /(\d{1,4}(?:\s*[、,〜~–-]\s*\d{1,4})*)\s*(?:ページ|頁)/g;

function expandPages(list) {
  const pages = [];
  for (const part of list.split(/\s*(?:,|、|and|&)\s*/)) {
    const range = part.match(/^(\d+)\s*[–\-—〜~]\s*(\d+)$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      for (let p = from; p <= to && p - from < 10; p++) pages.push(String(p));
    } else if (/^\d+$/.test(part.trim())) pages.push(part.trim());
  }
  return [...new Set(pages)];
}

/** Every page reference in a chapter's text, with a little context either side. */
export function findPageReferences(text) {
  const source = String(text ?? "");
  const found = [];
  for (const pattern of [LATIN_REF, CJK_REF]) {
    for (const m of source.matchAll(pattern)) {
      const list = pattern === LATIN_REF ? m[2] : m[1];
      const pages = expandPages(list);
      if (!pages.length) continue;
      const context = source.slice(Math.max(0, m.index - 80), m.index + m[0].length + 20).trim();
      found.push({ raw: m[0].trim(), pages, context });
    }
  }
  return found;
}

/** The spine number a cached chapter file is named for (`53.xhtml` is 53), or null. */
function spineOf(path) {
  const n = basename(path).match(/^(\d+)/)?.[1];
  return n === undefined ? null : Number(n);
}

/**
 * Widens a slice so it never cuts a table in half: a table the page break falls inside would
 * otherwise parse as nothing on both sides of the break.
 */
function widenToWholeTables(html, start, end) {
  let from = start;
  let to = end;
  const opens = (s) => (s.match(/<table\b/gi) ?? []).length;
  const closes = (s) => (s.match(/<\/table>/gi) ?? []).length;
  if (closes(html.slice(from, to)) > opens(html.slice(from, to))) {
    const back = html.lastIndexOf("<table", from);
    if (back !== -1) from = back;
  }
  if (opens(html.slice(from, to)) > closes(html.slice(from, to))) {
    const next = html.indexOf("</table>", to);
    if (next !== -1) to = next + "</table>".length;
  }
  return [from, to];
}

/** Every page of the book the cache holds, as `label -> { file, spine, html }`, first file wins. */
export function buildPageIndex(chaptersDir) {
  const index = new Map();
  if (!existsSync(chaptersDir)) return index;
  const files = readdirSync(chaptersDir)
    .filter((f) => /\.x?html?$/i.test(f))
    .sort((a, b) => (spineOf(a) ?? 0) - (spineOf(b) ?? 0));
  for (const name of files) {
    const file = join(chaptersDir, name);
    const html = readFileSync(file, "utf-8");
    const markers = pageMarkersIn(html);
    markers.forEach((marker, i) => {
      if (index.has(marker.label)) return;
      const [start, end] = widenToWholeTables(
        html,
        marker.index,
        markers[i + 1]?.index ?? html.length,
      );
      index.set(marker.label, { file, spine: spineOf(name), html: html.slice(start, end) });
    });
  }
  return index;
}

/**
 * The chapter's pointers, resolved. Returns the artifact `candidates/references.json` holds:
 * `{ references, followed, counts }`, where each reference lists every page it named and what
 * became of it (`followed`, `in-chapter`, `earlier`, `over-cap`, `unresolved`).
 */
export function resolveBookReferences({ chapterFilePath, chapterHtml }) {
  const chaptersDir = dirname(chapterFilePath);
  const ownSpine = spineOf(chapterFilePath);
  const ownPages = new Set(pageMarkersIn(chapterHtml).map((m) => m.label));
  const refs = findPageReferences(plainText(chapterHtml));
  const index = refs.length ? buildPageIndex(chaptersDir) : new Map();

  const followed = new Map();
  const references = refs.map((ref) => ({
    ...ref,
    pages: ref.pages.map((page) => {
      if (ownPages.has(page)) return { page, status: "in-chapter" };
      const hit = index.get(page);
      if (!hit) return { page, status: "unresolved" };
      if (ownSpine !== null && hit.spine !== null && hit.spine < ownSpine) {
        return { page, status: "earlier", spine: hit.spine };
      }
      if (!followed.has(page) && followed.size >= MAX_FOLLOWED_PAGES) {
        return { page, status: "over-cap", spine: hit.spine };
      }
      if (!followed.has(page)) {
        const text = plainText(hit.html);
        followed.set(page, {
          page,
          spine: hit.spine,
          file: hit.file,
          referencedFrom: ref.raw,
          text: text.slice(0, MAX_PAGE_CHARS),
          truncated: text.length > MAX_PAGE_CHARS,
          images: resolveChapterImages(hit.file, hit.html),
          tables: parseTables(hit.html),
        });
      }
      return { page, status: "followed", spine: hit.spine };
    }),
  }));

  const statuses = references.flatMap((r) => r.pages.map((p) => p.status));
  const count = (s) => statuses.filter((x) => x === s).length;
  return {
    pagesIndexed: index.size,
    references,
    followed: [...followed.values()],
    counts: {
      references: references.length,
      followed: followed.size,
      inChapter: count("in-chapter"),
      earlier: count("earlier"),
      overCap: count("over-cap"),
      unresolved: count("unresolved"),
    },
  };
}

const NO_REFERENCES = "(this chapter sends the learner to no other part of the book)";

/**
 * The prompt block every reader of the chapter gets. Text inline, images as paths to open, so a
 * role that reads pictures can read these the same way it reads the chapter's own.
 */
export function renderReferencedMaterial(resolved) {
  const pages = resolved?.followed ?? [];
  if (!pages.length) return NO_REFERENCES;
  const lines = [
    "The chapter sends the learner to these pages elsewhere in the book. What they hold, for the",
    "point the chapter is teaching, counts as taught by this chapter. Open every image listed.",
  ];
  for (const p of pages) {
    lines.push(
      "",
      `### Page ${p.page} (sent here by "${p.referencedFrom}")`,
      p.text + (p.truncated ? " [page text cut here]" : ""),
    );
    for (const image of p.images) lines.push(`- image: ${image.path}`);
  }
  return lines.join("\n");
}

// The chapter reader: vocabulary found anywhere in the chapter, independent of markup.
//
// WHY IT OVERLAPS THE TABLE SPECIALIST ON PURPOSE. No EPUB is reliably consistent, so a role that
// reasons from structure has a blind spot shaped like that structure. This one reads the prose and
// the pictures' captions and the drills' cues, and their outputs are UNIONED rather than one
// deferring to the other. An entry both find costs one merge; an entry only one finds is the reason
// both exist. Union for existence, never a vote — in a recall task the minority report is the
// thing worth keeping.
//
// WHY IT ACCOUNTS FOR SECTIONS. Its failure mode is not a wrong answer, it is a short read, and a
// short read is invisible: a chapter you stopped reading looks exactly like a chapter that ended.
// That has cost this deck real content — one lesson's read stopped at line 780 of 942, two exercises
// were never seen, and one held the only use of みなみぐち and しんじゅく in the whole book. So the
// role must return a line per heading, and `assertSectionsAccountedFor` rejects a response that does
// not. `contributed: 0` with a reason is a fine answer; silence is not an answer at all.

import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { renderBookHints } from "../corpus/bookConfig.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const CHAPTER_READER_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "chapter-reader-prompt.md"),
);

export const ROLE_ID = "chapterReader";

const NO_HINTS =
  "(no conventions recorded for this book — read it on its own terms, and expect nothing)";

/** The prompt for one chapter. `sections` are the headings the role must account for. */
export function renderChapterReaderPrompt({
  chapterFilePath,
  sections,
  targetLanguage,
  meta = null,
}) {
  return renderPromptTemplate(CHAPTER_READER_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CHAPTER_FILE_PATH: chapterFilePath,
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    BOOK_HINTS: renderBookHints(meta) ?? NO_HINTS,
    SECTIONS_JSON: JSON.stringify(
      sections.map((s) => ({ title: s.title, level: s.level })),
      null,
      2,
    ),
  });
}

/**
 * Rejects a response that did not account for every heading it was given.
 *
 * Matching is on the heading TITLE, and duplicates are tolerated by position: a chapter can print
 * `EXERCISES` twice, and demanding unique titles would make an honest response unrepresentable. What
 * is not tolerated is a count mismatch, because that is exactly the short read this guards.
 */
export function assertSectionsAccountedFor(sections, reported) {
  const want = sections.map((s) => s.title);
  const got = (reported ?? []).map((s) => s.title);
  const tally = (list) =>
    list.reduce((acc, title) => acc.set(title, (acc.get(title) ?? 0) + 1), new Map());
  const wanted = tally(want);
  const reportedTally = tally(got);

  const missing = [...wanted].filter(([title, n]) => (reportedTally.get(title) ?? 0) < n);
  if (missing.length) {
    throw new Error(
      `chapter reader did not account for section(s): ${missing.map(([t]) => t).join(", ")}. ` +
        `A section that taught nothing and a section nobody reached look identical otherwise, and ` +
        `this deck has lost real content to exactly that.`,
    );
  }
  const extra = [...reportedTally].filter(([title, n]) => (wanted.get(title) ?? 0) < n);
  if (extra.length) {
    throw new Error(
      `chapter reader reported section(s) it was not given: ${extra.map(([t]) => t).join(", ")}`,
    );
  }
  return reported;
}

/** Sections the role admits it did not read. Never empty-by-construction; a caller must look. */
export function unreadSections(reported) {
  return (reported ?? []).filter((s) => s.read === false);
}

/**
 * Reads one chapter. Returns `{ items, sections }`.
 *
 * `runClaude` is injectable so tests never spawn a model. Every item is stamped with the role that
 * produced it, so the snapshot can attribute a reviewer's later correction back here rather than to
 * the table specialist that also found it.
 */
export function readChapter({
  chapterFilePath,
  sections,
  targetLanguage,
  meta = null,
  runClaude,
} = {}) {
  if (!chapterFilePath || !existsSync(chapterFilePath)) {
    throw new Error(`chapter reader needs a chapter file that exists: ${chapterFilePath}`);
  }
  const prompt = renderChapterReaderPrompt({ chapterFilePath, sections, targetLanguage, meta });
  const raw = runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {});
  const parsed = JSON.parse(extractJsonObjectText(raw));

  const reported = Array.isArray(parsed.sections) ? parsed.sections : [];
  assertSectionsAccountedFor(sections, reported);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
  }));
  return { items, sections: reported };
}

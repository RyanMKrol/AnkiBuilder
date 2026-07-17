import { listExternalChapters } from "./epubArchive.js";

// A "lesson" here is one of the book's OWN navigation-document entries (see
// listExternalChapters) — NOT a spine file. The whole point of this module is that a
// spine item (one XHTML content file) is NOT guaranteed to correspond to a lesson: a
// lesson can span several spine files, front matter / unit dividers / quizzes are their
// own files, and some books put a whole lesson in one file (a well-behaved textbook) while
// others split it. The nav document (nav.xhtml / toc.ncx) is the book's own authoritative
// statement of where its lessons begin and end; listExternalChapters already turns it into
// spine-position RANGES, so selecting a lesson resolves to a range, and the extractor reads
// the whole range rather than a single hardcoded file.

// A coarse, label-only classification so `--list-lessons` is scannable (lesson vs the unit
// dividers / quizzes / front matter that share the nav list). Deliberately a heuristic on
// the human label, never a gate — selection works on any entry regardless of type. `unit`
// is checked before `lesson` only for ordering clarity; the regexes are mutually exclusive
// on their anchors anyway.
function classifyLesson(label) {
  const l = label.trim().toLowerCase();
  if (/^unit\b/.test(l)) return "unit";
  if (/^lesson\b/.test(l)) return "lesson";
  if (/\b(quiz|review|test|exercise)s?\b/.test(l)) return "quiz";
  if (
    /\b(cover|title page|copyright|contents|preface|introduction|index|acknowledge?ment|foreword|appendix|glossary|about the author)\b/.test(
      l,
    )
  ) {
    return "front-matter";
  }
  return "other";
}

/**
 * The book's own lessons, sourced from its navigation document — each an entry from
 * listExternalChapters (a spine-position range) enriched with a 1-based `number` (its
 * ordinal in the nav list, the stable handle `--list-lessons` prints and `--lesson`
 * accepts) and a coarse `type`. Returns `[]` when the EPUB has no usable navigation
 * document — callers should treat that as "this book can't be selected by lesson; fall
 * back to --chapter-number," not as an error.
 */
export function listLessons(epubPath, { log = () => {} } = {}) {
  return listExternalChapters(epubPath, { log }).map((chapter, index) => ({
    number: index + 1,
    label: chapter.label,
    type: classifyLesson(chapter.label),
    firstChapterNumber: chapter.firstChapterNumber,
    lastChapterNumber: chapter.lastChapterNumber,
    source: chapter.source,
  }));
}

/**
 * Resolves a `--lesson` selector to exactly one lesson. A purely-numeric selector is the
 * nav-list ordinal (the `[number]` from `--list-lessons`); anything else is a
 * case-insensitive substring match against the lesson labels, which must match exactly one
 * entry. Throws a human-actionable error (pointing at --list-lessons) when the book has no
 * nav document, the ordinal is out of range, or a label match is missing/ambiguous — so a
 * mistyped lesson fails loudly instead of silently assembling the wrong content.
 */
export function resolveLesson(epubPath, selector, { log = () => {} } = {}) {
  const lessons = listLessons(epubPath, { log });
  if (lessons.length === 0) {
    throw new Error(
      "this EPUB has no navigation document, so its lessons can't be listed or selected by name — " +
        "use --chapter-number <spine index> instead",
    );
  }

  const raw = String(selector).trim();
  if (raw.length === 0) {
    throw new Error(
      "--lesson requires a value (a [number] from --list-lessons, or part of a label)",
    );
  }

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const byNumber = lessons.find((lesson) => lesson.number === n);
    if (!byNumber) {
      throw new Error(
        `--lesson ${n} is out of range — this book has ${lessons.length} nav entries (see --list-lessons)`,
      );
    }
    return byNumber;
  }

  const needle = raw.toLowerCase();
  const matches = lessons.filter((lesson) => lesson.label.toLowerCase().includes(needle));
  if (matches.length === 0) {
    throw new Error(`--lesson "${raw}" matched no lesson label (see --list-lessons)`);
  }
  if (matches.length > 1) {
    throw new Error(
      `--lesson "${raw}" is ambiguous — it matches ${matches.length} entries: ` +
        matches.map((m) => `[${m.number}] "${m.label}"`).join(", ") +
        " (use a more specific string or the [number] from --list-lessons)",
    );
  }
  return matches[0];
}

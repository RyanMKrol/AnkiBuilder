import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { slugify } from "../util/slugify.js";
import { getBookTitle } from "../corpus/epubArchive.js";
import { loadBookMeta, saveBookSlug } from "../corpus/epubLibrary.js";

function epubHashMarkerPath(outputRoot, slug) {
  return join(outputRoot, slug, ".epub-hash");
}

function matchesHashMarker(outputRoot, slug, epubHash) {
  const markerPath = epubHashMarkerPath(outputRoot, slug);
  return existsSync(markerPath) && readFileSync(markerPath, "utf-8").trim() === epubHash;
}

/**
 * Resolves (and, on first use, creates) a book's folder under `outputRoot` — keyed by
 * content hash, but named with a human-readable slug derived from the EPUB's own
 * title. Once assigned, the slug is persisted to the library (via `saveBookSlug`) and
 * reused on every later call for the same hash, without recomputing it from the
 * title — stable even if title extraction logic or the book's own metadata changes
 * later. A `.epub-hash` marker file in each book folder records which hash owns that
 * name; on a collision with a DIFFERENT book already claiming the same slug, falls
 * back to a numeric suffix (`-2`, `-3`, ...) rather than a hash suffix, staying
 * human-readable.
 */
export function resolveBookSlug(outputRoot, epubPath, epubHash, opts = {}) {
  const meta = loadBookMeta(epubHash, opts);
  if (meta?.slug && matchesHashMarker(outputRoot, meta.slug, epubHash)) {
    return meta.slug;
  }

  const baseSlug = slugify(getBookTitle(epubPath) || epubHash);
  let candidate = baseSlug;
  let suffix = 2;
  while (
    existsSync(join(outputRoot, candidate)) &&
    !matchesHashMarker(outputRoot, candidate, epubHash)
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  mkdirSync(join(outputRoot, candidate), { recursive: true });
  writeFileSync(epubHashMarkerPath(outputRoot, candidate), epubHash);
  saveBookSlug(epubHash, candidate, opts);
  return candidate;
}

// The reserved top-level segment under outputRoot that holds every template-sourced
// deck, keeping them from colliding with book/course slugs at the root. See
// resolveTemplateRunDir.
const TEMPLATES_DIR = "templates";

/**
 * Resolves the run directory for a template-sourced deck:
 * `outputRoot/templates/<templateSlug>/<langSlug>/`. Unlike a book or course, a
 * template produces exactly one unit per (template, language) — so the language
 * folder IS the run directory, with no `chapter-<seq>`/`lesson-<seq>` level and no
 * later book-level merge. The path is a pure deterministic function of (template,
 * language): re-running `assemble` for the same pair resolves the same folder, and
 * assemble's own "corpus.json already exists — reusing" guard supplies idempotency.
 * Both segments are slugified so a full language name (e.g. "Japanese") and an ISO
 * code ("ja") each become a stable, filesystem-safe folder name. Does not create the
 * directory — the caller's corpus.json write does, same as resolveChapterRunDir.
 */
export function resolveTemplateRunDir(outputRoot, templateName, lang) {
  return join(outputRoot, TEMPLATES_DIR, slugify(templateName), slugify(lang));
}

const CHAPTER_DIR_PATTERN = /^chapter-(\d+)$/;

function existingChapterSeqs(bookDir) {
  if (!existsSync(bookDir)) {
    return [];
  }
  return readdirSync(bookDir)
    .map((name) => name.match(CHAPTER_DIR_PATTERN))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

/**
 * Resolves the run directory for one (epubHash, chapterNumber) pair under
 * `outputRoot/<slug>/` — reusing an existing `chapter-<seq>/` whose own corpus.json
 * already matches this exact chapter (same idempotency spirit as assemble's own
 * "corpus.json already exists — reusing", just at directory granularity), or else
 * allocating the next free sequential index (gaps from a manually-deleted folder are
 * never backfilled). Does not create the directory itself — the caller's own
 * corpus.json write does that, same as every other run dir today.
 */
export function resolveChapterRunDir(outputRoot, slug, epubHash, chapterNumber) {
  const bookDir = join(outputRoot, slug);
  const seqs = existingChapterSeqs(bookDir);

  for (const seq of seqs) {
    const corpusPath = join(bookDir, `chapter-${seq}`, "corpus.json");
    if (!existsSync(corpusPath)) {
      continue;
    }
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    if (corpus.meta?.epubHash === epubHash && corpus.meta?.chapterNumber === chapterNumber) {
      return join(bookDir, `chapter-${seq}`);
    }
  }

  const nextSeq = seqs.length > 0 ? Math.max(...seqs) + 1 : 0;
  return join(bookDir, `chapter-${nextSeq}`);
}

function courseMarkerPath(outputRoot, slug) {
  return join(outputRoot, slug, "course.json");
}

/**
 * Reads a course's `course.json` marker (written by resolveCourseSlug) if present —
 * `{ name, targetLanguage }` — or `null` if `courseDir` isn't a course folder at all
 * (e.g. it's an EPUB book folder, or doesn't exist). Takes the folder path directly
 * (not outputRoot+slug) since callers like `deck --book-dir` already have the exact
 * directory in hand.
 */
export function loadCourseMeta(courseDir) {
  const markerPath = join(courseDir, "course.json");
  if (!existsSync(markerPath)) {
    return null;
  }
  return JSON.parse(readFileSync(markerPath, "utf-8"));
}

/**
 * Lists every course folder directly under `outputRoot` — anything with a
 * `course.json` marker — as `{ slug, name, targetLanguage }`. Used to offer "pick an
 * existing course" during lesson assembly instead of always creating a new one.
 */
export function listCourses(outputRoot) {
  if (!existsSync(outputRoot)) {
    return [];
  }
  return readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const meta = loadCourseMeta(join(outputRoot, entry.name));
      return meta ? { slug: entry.name, ...meta } : null;
    })
    .filter(Boolean);
}

/**
 * Resolves (and, on first use, creates) a course's folder under `outputRoot` — the
 * lesson-source analogue of resolveBookSlug, but keyed by name (case-insensitive
 * exact match against an existing `course.json`) rather than content hash, since
 * there's no source file to hash the way there is for an EPUB. Re-running with the
 * exact same course name always reuses the same folder; a name collision with a
 * DIFFERENT course (or any other folder already at that slug, e.g. an EPUB book) falls
 * back to a numeric suffix (`-2`, `-3`, ...), same spirit as resolveBookSlug.
 */
export function resolveCourseSlug(outputRoot, courseName, targetLanguage) {
  const existing = listCourses(outputRoot).find(
    (course) => course.name.toLowerCase() === courseName.toLowerCase(),
  );
  if (existing) {
    return existing.slug;
  }

  const baseSlug = slugify(courseName);
  let candidate = baseSlug;
  let suffix = 2;
  while (existsSync(join(outputRoot, candidate))) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  mkdirSync(join(outputRoot, candidate), { recursive: true });
  writeFileSync(
    courseMarkerPath(outputRoot, candidate),
    JSON.stringify({ name: courseName, targetLanguage }, null, 2) + "\n",
  );
  return candidate;
}

const LESSON_DIR_PATTERN = /^lesson-(\d+)$/;

function existingLessonSeqs(courseDir) {
  if (!existsSync(courseDir)) {
    return [];
  }
  return readdirSync(courseDir)
    .map((name) => name.match(LESSON_DIR_PATTERN))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

/**
 * Resolves the run directory for one (courseSlug, lessonNumber) pair under
 * `outputRoot/<courseSlug>/` — the lesson-source analogue of resolveChapterRunDir,
 * naming folders `lesson-<seq>` instead of `chapter-<seq>`. lessonNumber is matched
 * against each existing lesson's `corpus.meta.chapterNumber` (that field is reused
 * as-is for a lesson's number — see the courseSlug comment on CORPUS_SCHEMA in
 * model/index.js), not a separate lessonNumber field.
 */
export function resolveLessonRunDir(outputRoot, courseSlug, lessonNumber) {
  const courseDir = join(outputRoot, courseSlug);
  const seqs = existingLessonSeqs(courseDir);

  for (const seq of seqs) {
    const corpusPath = join(courseDir, `lesson-${seq}`, "corpus.json");
    if (!existsSync(corpusPath)) {
      continue;
    }
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    if (corpus.meta?.courseSlug === courseSlug && corpus.meta?.chapterNumber === lessonNumber) {
      return join(courseDir, `lesson-${seq}`);
    }
  }

  const nextSeq = seqs.length > 0 ? Math.max(...seqs) + 1 : 0;
  return join(courseDir, `lesson-${nextSeq}`);
}

/**
 * Suggests the next lesson number for a course — one past the highest
 * `chapterNumber` seen across the course's existing lesson folders (or `1` for a
 * brand-new course). A suggestion only, meant for an interactive caller to confirm or
 * override — resolveLessonRunDir itself never calls this.
 */
export function nextLessonNumber(outputRoot, courseSlug) {
  const courseDir = join(outputRoot, courseSlug);
  let max = 0;
  for (const seq of existingLessonSeqs(courseDir)) {
    const corpusPath = join(courseDir, `lesson-${seq}`, "corpus.json");
    if (!existsSync(corpusPath)) {
      continue;
    }
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    if (typeof corpus.meta?.chapterNumber === "number") {
      max = Math.max(max, corpus.meta.chapterNumber);
    }
  }
  return max + 1;
}

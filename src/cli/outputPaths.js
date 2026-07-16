import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { slugify } from "../util/slugify.js";
import { getBookTitle } from "../corpus/epubArchive.js";
import { loadBookMeta, saveBookSlug, libraryEpubPath } from "../corpus/epubLibrary.js";

// Every source type lands under its own reserved top-level segment of `outputRoot`,
// so book slugs, course slugs, and template names can never collide with each other
// at the root: EPUB books under `epubs/`, lesson-sourced courses under `courses/`,
// bundled templates under `templates/`. `epubsRoot`/`coursesRoot` are the per-source
// category roots the resolvers below build their slug folders inside. (The segment is
// `courses/` — a course is the top-level unit; the `lesson-<seq>/` folders live one
// level down inside each course.)
const EPUBS_DIR = "epubs";
const COURSES_DIR = "courses";
const TEMPLATES_DIR = "templates";

function epubsRoot(outputRoot) {
  return join(outputRoot, EPUBS_DIR);
}

function coursesRoot(outputRoot) {
  return join(outputRoot, COURSES_DIR);
}

function epubHashMarkerPath(outputRoot, slug) {
  return join(epubsRoot(outputRoot), slug, ".epub-hash");
}

function matchesHashMarker(outputRoot, slug, epubHash) {
  const markerPath = epubHashMarkerPath(outputRoot, slug);
  return existsSync(markerPath) && readFileSync(markerPath, "utf-8").trim() === epubHash;
}

/**
 * Resolves (and, on first use, creates) a book's folder under `outputRoot/epubs/` — keyed by
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
    existsSync(join(epubsRoot(outputRoot), candidate)) &&
    !matchesHashMarker(outputRoot, candidate, epubHash)
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  mkdirSync(join(epubsRoot(outputRoot), candidate), { recursive: true });
  writeFileSync(epubHashMarkerPath(outputRoot, candidate), epubHash);
  saveBookSlug(epubHash, candidate, opts);
  return candidate;
}

function bookMarkerPath(outputRoot, slug) {
  return join(epubsRoot(outputRoot), slug, "book.json");
}

/**
 * Reads a book's `book.json` marker (written by materializeBookInOutput) if present —
 * `{ title, slug, epubHash, targetLanguage }` — or `null` for a folder that predates
 * the marker (older books carry only the `.epub-hash` file). The book analogue of
 * loadCourseMeta; takes the folder path directly.
 */
export function loadBookMarker(bookDir) {
  const markerPath = join(bookDir, "book.json");
  if (!existsSync(markerPath)) {
    return null;
  }
  return JSON.parse(readFileSync(markerPath, "utf-8"));
}

/**
 * Copies the source EPUB into the book's output folder as `book.epub` and writes a
 * `book.json` marker — mirroring how a lesson-sourced course writes `course.json`. This
 * makes the output tree a SELF-CONTAINED, durable reference to the book: a later chapter
 * can be assembled by picking the book (`assemble --book <slug>`) straight from this copy,
 * with no need to re-locate the original file on disk. Idempotent: the copy is skipped
 * when `book.epub` already exists (same "don't regenerate what's already there" spirit as
 * registerEpub / the audio cache), while the marker is refreshed each call so it tracks
 * the most recent build's `targetLanguage`. Returns the destination EPUB path.
 */
export function materializeBookInOutput(outputRoot, slug, epubPath, epubHash, targetLanguage) {
  const dir = join(epubsRoot(outputRoot), slug);
  mkdirSync(dir, { recursive: true });

  const dest = join(dir, "book.epub");
  // Guard the self-copy: when picking an existing book, epubPath already IS this dest.
  if (!existsSync(dest)) {
    copyFileSync(epubPath, dest);
  }

  writeFileSync(
    bookMarkerPath(outputRoot, slug),
    JSON.stringify(
      { title: getBookTitle(dest) || null, slug, epubHash, targetLanguage: targetLanguage || null },
      null,
      2,
    ) + "\n",
  );
  return dest;
}

/**
 * Lists every book folder directly under `outputRoot/epubs/` that has been worked on —
 * anything carrying a `book.json` marker, a copied `book.epub`, or the legacy
 * `.epub-hash` file — as `{ slug, title, epubHash, targetLanguage, epubPath }`. The book
 * analogue of listCourses, used to offer "pick a previously-worked EPUB" during assembly.
 * `epubPath` points at the folder's own `book.epub` when present (else `null` — a legacy
 * folder whose EPUB still lives only in the local library; resolveBookEpubPath backfills
 * that case). Fields absent from an older marker come back `null`.
 */
export function listBooks(outputRoot) {
  const root = epubsRoot(outputRoot);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name);
      const marker = loadBookMarker(dir);
      const ownEpub = join(dir, "book.epub");
      const hasOwnEpub = existsSync(ownEpub);
      const hasHashMarker = existsSync(join(dir, ".epub-hash"));
      if (!marker && !hasOwnEpub && !hasHashMarker) {
        return null;
      }
      return {
        slug: entry.name,
        title: marker?.title ?? null,
        epubHash:
          marker?.epubHash ??
          (hasHashMarker ? readFileSync(join(dir, ".epub-hash"), "utf-8").trim() : null),
        targetLanguage: marker?.targetLanguage ?? null,
        epubPath: hasOwnEpub ? ownEpub : null,
      };
    })
    .filter(Boolean);
}

/**
 * Resolves the EPUB file to build from for an already-worked-on book, chosen by slug —
 * the source that `assemble --book <slug>` reads. Prefers the book's own durable copy
 * (`outputRoot/epubs/<slug>/book.epub`); for a book worked on before that copy existed,
 * falls back to the local library copy via the folder's `.epub-hash` marker. Throws with
 * a clear message if neither is available.
 */
export function resolveBookEpubPath(outputRoot, slug, opts = {}) {
  const ownEpub = join(epubsRoot(outputRoot), slug, "book.epub");
  if (existsSync(ownEpub)) {
    return ownEpub;
  }

  const markerPath = epubHashMarkerPath(outputRoot, slug);
  if (existsSync(markerPath)) {
    const epubHash = readFileSync(markerPath, "utf-8").trim();
    const libEpub = libraryEpubPath(epubHash, opts);
    if (existsSync(libEpub)) {
      return libEpub;
    }
  }

  throw new Error(
    `no EPUB found for book "${slug}" — expected a copy at ${ownEpub} or in the local library. ` +
      `Re-assemble this book once with --epub <path> to restore it.`,
  );
}

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
 * `outputRoot/epubs/<slug>/` — reusing an existing `chapter-<seq>/` whose own corpus.json
 * already matches this exact chapter (same idempotency spirit as assemble's own
 * "corpus.json already exists — reusing", just at directory granularity), or else
 * allocating the next free sequential index (gaps from a manually-deleted folder are
 * never backfilled). Does not create the directory itself — the caller's own
 * corpus.json write does that, same as every other run dir today.
 */
export function resolveChapterRunDir(outputRoot, slug, epubHash, chapterNumber) {
  const bookDir = join(epubsRoot(outputRoot), slug);
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
  return join(coursesRoot(outputRoot), slug, "course.json");
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
 * Lists every course folder directly under `outputRoot/courses/` — anything with a
 * `course.json` marker — as `{ slug, name, targetLanguage }`. Used to offer "pick an
 * existing course" during lesson assembly instead of always creating a new one.
 */
export function listCourses(outputRoot) {
  const root = coursesRoot(outputRoot);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const meta = loadCourseMeta(join(root, entry.name));
      return meta ? { slug: entry.name, ...meta } : null;
    })
    .filter(Boolean);
}

/**
 * Resolves (and, on first use, creates) a course's folder under `outputRoot/courses/` — the
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
  while (existsSync(join(coursesRoot(outputRoot), candidate))) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  mkdirSync(join(coursesRoot(outputRoot), candidate), { recursive: true });
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
 * `outputRoot/courses/<courseSlug>/` — the lesson-source analogue of resolveChapterRunDir,
 * naming folders `lesson-<seq>` instead of `chapter-<seq>`. lessonNumber is matched
 * against each existing lesson's `corpus.meta.chapterNumber` (that field is reused
 * as-is for a lesson's number — see the courseSlug comment on CORPUS_SCHEMA in
 * model/index.js), not a separate lessonNumber field.
 */
export function resolveLessonRunDir(outputRoot, courseSlug, lessonNumber) {
  const courseDir = join(coursesRoot(outputRoot), courseSlug);
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
  const courseDir = join(coursesRoot(outputRoot), courseSlug);
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

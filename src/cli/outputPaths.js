import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomic, copyFileAtomic } from "../util/atomicWrite.js";
import { claimLiveness, claimMatches, describeClaim, readClaim, writeClaim } from "./runClaim.js";
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

  // mkdirSync(recursive:true) never throws on collision, so a second first-time assemble of a
  // DIFFERENT book whose title slugifies alike would take this slug too and overwrite the first
  // book's hash marker. recursive:false makes claiming the slug a compare-and-swap instead.
  mkdirSync(epubsRoot(outputRoot), { recursive: true });
  while (true) {
    try {
      mkdirSync(join(epubsRoot(outputRoot), candidate), { recursive: false });
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (matchesHashMarker(outputRoot, candidate, epubHash)) break; // ours already
      candidate = `${baseSlug}-${suffix}`;
      suffix++;
    }
  }
  writeFileAtomic(epubHashMarkerPath(outputRoot, candidate), epubHash);
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
    copyFileAtomic(epubPath, dest);
  }

  // `.apkg` note guids are `<guidNamespace>/<card.id>` when set — Anki matches guids
  // COLLECTION-wide, so two books both shipping a bare `konnichiwa` guid would overwrite each
  // other's note on import. Decided once, at the book dir's FIRST materialization, and preserved
  // verbatim on every refresh after that: changing an existing book's guids would orphan its live
  // scheduling, so a book that started bare (the pre-namespace era) stays bare forever.
  //
  // `retired` is preserved for a sharper reason than `guidNamespace`: this function REPLACES the
  // marker wholesale, so any field it does not carry forward is silently dropped. Losing the
  // retirement flag would turn a deliberately-removed deck back into a live one: `deliver` would
  // recreate it in Anki and re-add every card with no scheduling, and nothing would report it,
  // because a wiped flag and a never-set flag are the same absence. Any future manifest field a
  // human sets by hand has to be added here for the same reason.
  const markerPath = bookMarkerPath(outputRoot, slug);
  let guidNamespace = slug;
  let retired;
  if (existsSync(markerPath)) {
    try {
      const existing = JSON.parse(readFileSync(markerPath, "utf-8"));
      guidNamespace = existing.guidNamespace ?? null;
      if (existing.retired === true) retired = true;
    } catch {
      guidNamespace = null;
    }
  }

  writeFileAtomic(
    markerPath,
    JSON.stringify(
      {
        title: getBookTitle(dest) || null,
        slug,
        epubHash,
        targetLanguage: targetLanguage || null,
        guidNamespace,
        ...(retired ? { retired: true } : {}),
      },
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
        // Carried through so callers can filter a retired book the same way they filter a retired
        // course: `listCourses` spreads the whole manifest and gets this for free, and a lister that
        // silently dropped the field would make the flag unfollowable for books.
        retired: marker?.retired === true,
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

/**
 * Shared body of the chapter/lesson allocators: the four-rule reuse ladder, then the
 * mkdir compare-and-swap, then an immediate exclusive claim. See resolveChapterRunDir.
 */
function resolveUnitRunDir({ parentDir, prefix, seqs, matchesCorpus, claimKey, label, deps = {} }) {
  const { liveness = claimLiveness } = deps;
  const dirFor = (seq) => join(parentDir, `${prefix}-${seq}`);

  for (const seq of seqs) {
    const dir = dirFor(seq);
    const corpusPath = join(dir, "corpus.json");
    if (existsSync(corpusPath)) {
      // An unreadable corpus.json means "not a match", never a fatal error — the likeliest
      // cause is a concurrent write, and killing the allocation over it helps nobody.
      let meta = null;
      try {
        meta = JSON.parse(readFileSync(corpusPath, "utf-8")).meta;
      } catch {
        continue;
      }
      if (matchesCorpus(meta)) return dir; // rule 1
      continue;
    }

    const claim = readClaim(dir);
    if (!claimMatches(claim, claimKey)) continue; // rule 4
    if (liveness(claim) === "stale") {
      writeClaim(dir, claimKey); // rule 2: our own crashed attempt — take it back
      return dir;
    }
    throw new Error(
      // rule 3
      `${label} is already being built (${describeClaim(claim)}).\n` +
        `Wait for it to finish, or if that process is gone, delete ${join(dir, "claim.json")}.`,
    );
  }

  mkdirSync(parentDir, { recursive: true });
  let seq = seqs.length > 0 ? Math.max(...seqs) + 1 : 0;
  for (let attempt = 0; attempt < 1000; attempt++, seq++) {
    const dir = dirFor(seq);
    try {
      mkdirSync(dir, { recursive: false });
    } catch (err) {
      if (err.code === "EEXIST") continue; // lost the race for this seq — try the next
      throw err;
    }
    try {
      writeClaim(dir, claimKey, { exclusive: true });
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      continue;
    }
    return dir;
  }
  throw new Error(`could not allocate a run directory under ${parentDir} after 1000 attempts`);
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
 * `outputRoot/epubs/<slug>/`, RESERVING it if it has to allocate a new one.
 *
 * Reserving up front is what keeps a crashed build resumable. This used to compute `max(seq)+1`
 * and return the path WITHOUT creating it — but the directory then only appeared minutes later
 * when corpus.json was written, after extraction, dedup, the forward-flag pass and the
 * pedagogical sort, so nothing on disk said the chapter was already being worked on.
 *
 * `mkdirSync(dir, { recursive: false })` throws EEXIST rather than silently succeeding, so the
 * reservation is a compare-and-swap the filesystem gives us for free — no lock to hold or leak.
 *
 * The reuse ladder, per existing seq (see runClaim.js for why the claim exists):
 *   1. corpus.json matches this exact chapter  -> reuse it (unchanged behaviour, wins over all)
 *   2. a STALE claim matches                   -> reclaim; this is our own crashed attempt
 *   3. a LIVE claim matches                    -> throw; a live build already owns this chapter
 *   4. otherwise                               -> not ours, skip
 *
 * Rule 2 is what preserves crash-resume: without it a reserved-but-empty directory would be
 * skipped forever and every retry would leak a new sequence number.
 *
 * Rule 3 is a DOUBLE-RUN GUARD, not concurrency support — building several lessons at once is no
 * longer a supported mode. It stays because the accident is easy: extraction is minutes of silence,
 * so a run that looks stuck invites a second terminal, and without the guard the second run would
 * allocate its own directory for the same chapter. Both would then write a corpus for it, the
 * dashboard would list the chapter twice, and the merged .apkg would carry it twice.
 *
 * Gaps from a manually-deleted folder are still never backfilled.
 */
export function resolveChapterRunDir(outputRoot, slug, epubHash, chapterNumber, deps = {}) {
  const bookDir = join(epubsRoot(outputRoot), slug);
  return resolveUnitRunDir({
    parentDir: bookDir,
    prefix: "chapter",
    seqs: existingChapterSeqs(bookDir),
    matchesCorpus: (meta) => meta?.epubHash === epubHash && meta?.chapterNumber === chapterNumber,
    claimKey: { kind: "chapter", epubHash, chapterNumber },
    label: `chapter ${chapterNumber} of "${slug}"`,
    deps,
  });
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
 * Whether a collection's own manifest marks it RETIRED: its Anki deck was deliberately removed,
 * because the material was absorbed into another collection or the deck was abandoned. A retired
 * collection is kept on disk as the record of what it held; it is not a build target, not something
 * to review, and not something to deliver.
 *
 * Takes the collection DIRECTORY, not a built `.apkg`, and reads `book.json` / `course.json`
 * straight from disk so it works for every collection type without each caller threading the field
 * through its own load shape. Reading the wrong path here fails silently (the JSON.parse throws,
 * the catch returns false, and a retired collection is treated as live), so the directory-not-file
 * contract is worth keeping in mind at every call site.
 *
 * Absence must mean "not retired": every collection already on disk lacks the field. A manifest we
 * cannot read is not a retired one either; the stages that consume it fail on it properly, whereas
 * treating an unparseable file as retired would silently drop a LIVE collection from delivery.
 *
 * Only a human sets this flag, because only a human knows whether a deck is gone on purpose.
 */
export function isRetiredCollection(collectionDir) {
  for (const name of ["book.json", "course.json"]) {
    const path = join(collectionDir, name);
    if (!existsSync(path)) continue;
    try {
      if (JSON.parse(readFileSync(path, "utf-8")).retired === true) return true;
    } catch {
      // A manifest we cannot read is not a retired one. See above.
    }
  }
  return false;
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

  // Same CAS as resolveBookSlug — see the comment there.
  mkdirSync(coursesRoot(outputRoot), { recursive: true });
  while (true) {
    try {
      mkdirSync(join(coursesRoot(outputRoot), candidate), { recursive: false });
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (existsSync(courseMarkerPath(outputRoot, candidate))) break; // already this course
      candidate = `${baseSlug}-${suffix}`;
      suffix++;
    }
  }
  writeFileAtomic(
    courseMarkerPath(outputRoot, candidate),
    // guidNamespace: see materializeBookInOutput — set once at creation for collection-wide
    // guid uniqueness; a pre-namespace course's marker simply lacks the field and stays bare.
    JSON.stringify({ name: courseName, targetLanguage, guidNamespace: candidate }, null, 2) + "\n",
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
export function resolveLessonRunDir(outputRoot, courseSlug, lessonNumber, deps = {}) {
  const courseDir = join(coursesRoot(outputRoot), courseSlug);
  return resolveUnitRunDir({
    parentDir: courseDir,
    prefix: "lesson",
    seqs: existingLessonSeqs(courseDir),
    matchesCorpus: (meta) =>
      meta?.courseSlug === courseSlug && meta?.chapterNumber === lessonNumber,
    claimKey: { kind: "lesson", courseSlug, chapterNumber: lessonNumber },
    label: `lesson ${lessonNumber} of "${courseSlug}"`,
    deps,
  });
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

/**
 * True when a course already has a lesson carrying this number. Used to refuse a `--lesson-number`
 * that is already taken, so a second "Lesson N" can't be built over the first and merged into the
 * deck as a duplicate sub-deck. `nextLessonNumber` only ever SUGGESTS a number, and the identity is
 * chosen before the path is, so no filesystem primitive can catch this — the check has to be
 * explicit. `--force` overrides it when building over an existing lesson is what you mean.
 */
export function lessonNumberInUse(outputRoot, courseSlug, lessonNumber) {
  const courseDir = join(coursesRoot(outputRoot), courseSlug);
  for (const seq of existingLessonSeqs(courseDir)) {
    const corpusPath = join(courseDir, `lesson-${seq}`, "corpus.json");
    if (!existsSync(corpusPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(corpusPath, "utf-8")).meta;
      if (meta?.chapterNumber === lessonNumber) return true;
    } catch {
      /* unreadable — treat as not a match */
    }
  }
  return false;
}

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, join, resolve } from "path";

/**
 * The ONE place that knows what a unit directory looks like, and what a collection is.
 *
 * Before this module the same "is this a unit folder?" regex was retyped in four places
 * (scripts/preflight.mjs, scripts/extras-collision-audit.mjs, scripts/extras-duplicate-check.mjs,
 * src/deck/deckFileName.js — whose own comment names two more in src/deck/rebuild.js and
 * src/server/adapters/stage.js). Every copy knew a slightly different subset of the shapes, and the
 * one that mattered most — preflight's — could not match a template unit at all, so a template deck
 * was skipped in silence and the run still printed "preflight clean". A checker that cannot see a
 * unit reads exactly like one that checked it and found nothing wrong, which is this project's
 * signature failure mode applied to its own safety net.
 *
 * ── The three unit shapes ────────────────────────────────────────────────────────────────────────
 *
 *   1. `output/epubs/<slug>/chapter-<n>`     a chapter of a book
 *      `output/courses/<slug>/lesson-<n>`    a lesson of a course
 *   2. either of those suffixed `-extras`    the hand-authored drill unit for that lesson
 *   3. `output/templates/<name>/<lang>`      a bundled-template deck; the LANGUAGE folder IS the
 *                                            unit, with no chapter/lesson level beneath it
 *
 * ── What a "collection" is ───────────────────────────────────────────────────────────────────────
 *
 * A collection is **the thing that produces one `.apkg`**, which is why the template case looks
 * asymmetric: a book or a course dir merges all its done units into a single package, while a
 * template's language folder is packaged on its own (see `templateAdapter.deckFile` and
 * `rebuildRunDir`). So for a template the collection dir and the unit dir are the same directory,
 * and the collection holds exactly one unit. Anything that reasons about "the package for this
 * collection" stays correct for all three kinds without a special case.
 */

/** Top-level segments of the output root, and the collection kind each one holds. */
const EPUBS_DIR = "epubs";
const COURSES_DIR = "courses";
const TEMPLATES_DIR = "templates";

/** A `chapter-<n>` / `lesson-<n>` folder, optionally suffixed `-extras`. */
export const UNIT_DIR_PATTERN = /^(?:chapter|lesson)-(\d+)(-extras)?$/;

/** The files a unit directory is recognised by, and validated through. */
export const UNIT_FILES = ["cards.json", "corpus.json"];

/**
 * ⚠️ THE `chapterNumber` INVARIANT — the join key four subsystems agree on, written down once.
 *
 * `meta.chapterNumber` is **the lesson's FIRST spine index in the EPUB**, not its position in the
 * book's table of contents and not the `<n>` in its `chapter-<n>` folder name. For a lesson spanning
 * several spine files, `meta.lastChapterNumber` is its last; a single-file lesson omits that field.
 * For a `sourceType: "manual"` course the same field is reused verbatim as the lesson NUMBER, which
 * is why a course's `lesson-3` and a book's `chapter-3` are read by the same code.
 *
 * It is a join key, not a label. All of these resolve through it and every one of them silently
 * reads the wrong record if it drifts:
 *
 *   - `.anki-builder/epubs/<hash>/corpora/<chapterNumber>.json`  the dedup-library entry
 *     (`saveChapterCorpus` / `loadPriorChapterItems`, src/corpus/epubLibrary.js)
 *   - `.anki-builder/epubs/<hash>/chapters/<chapterNumber>.xhtml` the extracted-chapter cache
 *     (`chapterCachePath`, same file)
 *   - `runDirOrderContext`, which decides whether earlier lessons are reviewed yet
 *   - `resolveChapterRunDir` / `resolveLessonRunDir`, which reuse a run dir by matching it
 *
 * The load-bearing consequence, and the reason this is written down here rather than inferred: a
 * lesson and its `-extras` sibling carry the SAME `chapterNumber` (chapter-13 and chapter-13-extras
 * are both 33 today), because the extras unit is drills for that same chapter. So `(epubHash,
 * chapterNumber)` identifies a CHAPTER, never a unit directory — and anything keyed purely on that
 * pair must refuse to write on behalf of an `-extras` unit, or it overwrites the base chapter's
 * record. See the `extras-library-write` check.
 */
export const CHAPTER_NUMBER_MEANING =
  "meta.chapterNumber is the lesson's FIRST spine index (reused as the lesson number for a course), " +
  "and a unit shares it with its -extras sibling";

/** The `chapterNumber` a unit's metadata declares, or `null` when it declares none. */
export function unitChapterNumber(meta) {
  const value = meta?.chapterNumber;
  return typeof value === "number" ? value : null;
}

/** True for a unit directory basename that is a base or extras unit of a book/course. */
export function isUnitDirName(name) {
  return UNIT_DIR_PATTERN.test(name);
}

/** True when a directory holds at least one of the files that make it a unit. */
export function looksLikeUnitDir(dir) {
  return UNIT_FILES.some((file) => existsSync(join(dir, file)));
}

function directoryNames(dir) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Every collection under an output root, plus what the scan could NOT account for.
 *
 * The second half is the point: `unknownGroups` (a top-level folder that is not `epubs/`,
 * `courses/` or `templates/`) and, per collection, `unmatchedDirs` (a folder holding a cards.json
 * or corpus.json whose name matches no known unit shape) are what let a report say "I looked at 31
 * units and there were none I could not place" instead of just "clean".
 *
 * Returns `{ root, collections, unknownGroups }`.
 */
export function scanWorkspace(outputRoot = "output") {
  const root = resolve(outputRoot);
  const collections = [];
  const unknownGroups = [];

  if (!existsSync(root)) return { root, collections, unknownGroups, missing: true };

  for (const group of directoryNames(root)) {
    const groupDir = join(root, group);
    if (group === EPUBS_DIR || group === COURSES_DIR) {
      const kind = group === EPUBS_DIR ? "epub" : "course";
      for (const slug of directoryNames(groupDir)) {
        collections.push(describeCollection(join(groupDir, slug), kind, slug));
      }
    } else if (group === TEMPLATES_DIR) {
      for (const name of directoryNames(groupDir)) {
        for (const lang of directoryNames(join(groupDir, name))) {
          collections.push(
            describeCollection(join(groupDir, name, lang), "template", `${name}/${lang}`),
          );
        }
      }
    } else {
      unknownGroups.push(groupDir);
    }
  }

  return { root, collections, unknownGroups, missing: false };
}

/**
 * The collection a single directory represents, for the one-collection form of a command
 * (`preflight <dir>`). The kind is read off the path shape, so a book dir, a course dir and a
 * `templates/<name>/<lang>` dir each behave exactly as they do under a full scan.
 */
export function describeCollectionDir(dir) {
  const path = resolve(dir);
  const segments = path.split(/[/\\]/);
  const parent = segments[segments.length - 2];
  const grandparent = segments[segments.length - 3];
  // `templates/<name>/<lang>` — the LANGUAGE folder is the collection, so `templates` sits two
  // levels up, not one.
  if (grandparent === TEMPLATES_DIR) {
    return describeCollection(path, "template", `${parent}/${basename(path)}`);
  }
  if (parent === COURSES_DIR) return describeCollection(path, "course", basename(path));
  if (parent === EPUBS_DIR) return describeCollection(path, "epub", basename(path));
  // A directory nobody can place is still worth checking; it just has no marker and no kind.
  return describeCollection(path, "unknown", basename(path));
}

function describeCollection(dir, kind, slug) {
  return { dir, kind, slug, label: `${slug}`, ...unitInventory(dir, kind) };
}

/**
 * The units of a collection, in STUDY order — a lesson before its own extras, so "the earliest
 * occurrence is the keeper" means what a reader expects — plus the directories inside it that look
 * like units but match no known shape.
 */
function unitInventory(dir, kind) {
  if (kind === "template") {
    return { unitDirs: looksLikeUnitDir(dir) ? [templateUnit(dir)] : [], unmatchedDirs: [] };
  }

  const unitDirs = [];
  const unmatchedDirs = [];
  for (const name of directoryNames(dir)) {
    const match = UNIT_DIR_PATTERN.exec(name);
    const path = join(dir, name);
    if (match) {
      unitDirs.push({
        dir: path,
        name,
        shape: match[2] ? "extras" : "unit",
        number: Number(match[1]),
        extras: Boolean(match[2]),
      });
    } else if (looksLikeUnitDir(path)) {
      unmatchedDirs.push(path);
    }
  }
  unitDirs.sort((a, b) => a.number - b.number || Number(a.extras) - Number(b.extras));
  return { unitDirs, unmatchedDirs };
}

function templateUnit(dir) {
  return { dir, name: basename(dir), shape: "template", number: null, extras: false };
}

/**
 * Every unit directory of a collection — the single `listUnitDirs` the four retyped regexes were
 * each an incomplete copy of. Takes a collection descriptor (from `scanWorkspace` /
 * `describeCollectionDir`) or a bare path.
 */
export function listUnitDirs(collection) {
  if (typeof collection === "string") return describeCollectionDir(collection).unitDirs;
  return collection.unitDirs;
}

/**
 * Reads one unit's `cards.json` and `corpus.json`.
 *
 * A file that will not parse is recorded as an ERROR on the unit rather than thrown, because a
 * single corrupt unit must not stop the other thirty from being checked — the whole point of the
 * run is to report everything wrong at once. `items` is always an array so a caller never has to
 * decide what an unreadable unit's card list is.
 */
export function loadUnit(unitDir) {
  const descriptor =
    typeof unitDir === "string"
      ? isUnitDirName(basename(unitDir))
        ? {
            dir: unitDir,
            name: basename(unitDir),
            shape: UNIT_DIR_PATTERN.exec(basename(unitDir))[2] ? "extras" : "unit",
            number: Number(UNIT_DIR_PATTERN.exec(basename(unitDir))[1]),
            extras: Boolean(UNIT_DIR_PATTERN.exec(basename(unitDir))[2]),
          }
        : templateUnit(unitDir)
      : unitDir;

  const files = {};
  const errors = [];
  for (const file of UNIT_FILES) {
    const path = join(descriptor.dir, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      files[file] = { path, present: false, data: null };
      continue;
    }
    try {
      files[file] = { path, present: true, data: JSON.parse(readFileSync(path, "utf-8")) };
    } catch (error) {
      files[file] = { path, present: true, data: null, error: error.message };
      errors.push(`${file}: ${error.message}`);
    }
  }

  const cards = files["cards.json"].data;
  return {
    ...descriptor,
    files,
    cards,
    corpus: files["corpus.json"].data,
    meta: cards?.meta ?? {},
    items: Array.isArray(cards?.items) ? cards.items : [],
    label: cards?.meta?.chapterLabel ?? descriptor.name,
    errors,
  };
}

/** Every unit of a collection, loaded, in study order. */
export function loadUnits(collection) {
  return listUnitDirs(collection)
    .map((unit) => loadUnit(unit))
    .filter((unit) => unit.files["cards.json"].present || unit.files["corpus.json"].present);
}

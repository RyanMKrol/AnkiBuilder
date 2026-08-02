import { existsSync } from "fs";
import { basename, dirname, join } from "path";
import { slugify } from "../util/slugify.js";

// What a built `.apkg` is called on disk.
//
// Every package used to be `deck.apkg`, which made them indistinguishable the moment they left their
// folder — a downloads directory or Anki's import dialog showed a row of identical names, and picking
// the right one meant reading the path. A package is now named for the thing it contains.
//
// Derived from the directory PATH alone, never from a title read out of a metadata file. That is the
// point: the writer and a reader looking for the same package compute the name independently, so they
// cannot disagree, and no lookup can fail halfway and invent a different name. The folder slugs are
// already derived from the human names (a book's slug from its `<dc:title>`, a course's from its
// name — see `resolveCourseSlug`/`registerBook`), so naming after the folder IS naming after the
// EPUB or course, just canonicalized once at assemble time instead of twice.

export const LEGACY_DECK_FILENAME = "deck.apkg";

// Matches the `-extras` suffix too. A unit dir's own basename never identifies anything by itself,
// and that is just as true of `chapter-3-extras` as of `chapter-3`: without the parent folded in,
// every book in the output tree would produce the same `chapter-3-extras.apkg`. Keep this in step
// with the same pattern in src/deck/rebuild.js and src/server/adapters/stage.js.
const UNIT_DIR_PATTERN = /^(?:chapter|lesson)-\d+(?:-extras)?$/;
const TEMPLATES_SEGMENT = "templates";

/**
 * The identity a directory's package should be named after.
 *
 * Two shapes need their parent folded in, because their own basename doesn't identify anything on its
 * own: a unit dir (`…/nihongo-101-course-n5/lesson-3` — every course has a `lesson-3`) and a template
 * language dir (`…/templates/numbers/ja` — every template has a `ja`). Everything else — a book dir, a
 * course dir, a one-off run dir — is already uniquely named by its own folder.
 */
export function deckIdentityForDir(dir) {
  const base = basename(dir);
  const parent = basename(dirname(dir));
  const grandparent = basename(dirname(dirname(dir)));

  if (UNIT_DIR_PATTERN.test(base)) return `${parent}-${base}`;
  if (grandparent === TEMPLATES_SEGMENT) return `${parent}-${base}`;
  return base;
}

/** `<identity>.apkg`, filesystem-safe. */
export function deckFileNameForDir(dir) {
  return `${slugify(deckIdentityForDir(dir), { maxLength: 80 })}.apkg`;
}

/** Absolute path this directory's package is WRITTEN to. */
export function deckPathForDir(dir) {
  return join(dir, deckFileNameForDir(dir));
}

/**
 * Absolute path a reader should OPEN for this directory's package.
 *
 * Prefers the named file, falls back to a `deck.apkg` left by a build that predates this convention,
 * and otherwise returns the named path — so "where would it go?" and "where is it?" are the same
 * question when nothing exists yet. Keeps a deck built before the rename readable without a migration
 * having been run.
 */
export function resolveDeckPathForDir(dir) {
  const named = deckPathForDir(dir);
  if (existsSync(named)) return named;
  const legacy = join(dir, LEGACY_DECK_FILENAME);
  return existsSync(legacy) ? legacy : named;
}

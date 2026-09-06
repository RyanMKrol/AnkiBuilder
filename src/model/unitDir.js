// The `chapter-<n>` / `lesson-<n>[-extras]` directory name, in one place.
//
// WHY THIS MODULE EXISTS. This pattern was hand-copied into seven files and had drifted into three
// incompatible shapes: three copies captured nothing and were used as a boolean, two captured
// `(number, extras)`, and two captured `(kind, number, extras)` and then never read the kind. A
// caller that reached for `match[1]` therefore got the chapter number in some files and the word
// "chapter" in others, which is a bug waiting for someone to move a line between them. Every copy
// carried a comment asking the next person to keep it in step with the others, which is the
// documentation equivalent of a lock nobody holds.
//
// So callers no longer see group indices at all. `isUnitDir` answers the boolean question and
// `parseUnitDir` returns named fields; the raw pattern is exported only for a caller that genuinely
// needs the regex itself.
//
// WHAT IS DELIBERATELY NOT MATCHED: a template unit. A template's unit directory is its language
// code (`ja`, `es`), and it is recognised by its position under `templates/`, never by its name.
// Each of the hand-copied regexes got that distinction right by accident; this one gets it on
// purpose, and `test/model/unitDir.test.js` pins it.

/** A `chapter-<n>` / `lesson-<n>` folder, optionally suffixed `-extras`. */
export const UNIT_DIR_PATTERN = /^(chapter|lesson)-(\d+)(-extras)?$/;

/** True for a directory basename that names a base or extras unit of a book or course. */
export function isUnitDir(name) {
  return UNIT_DIR_PATTERN.test(name);
}

/**
 * `{ name, kind, number, extras }` for a unit directory basename, or `null` when it is not one.
 *
 * `number` is the `<n>` in the folder name. It is NOT necessarily `meta.chapterNumber`: for an EPUB
 * that field is the lesson's first spine index, and the two coincide only by convention. See the
 * `chapterNumber` invariant in `src/audit/units.js` before using one where the other is meant.
 */
export function parseUnitDir(name) {
  const match = UNIT_DIR_PATTERN.exec(name);
  if (!match) return null;
  return { name, kind: match[1], number: Number(match[2]), extras: Boolean(match[3]) };
}

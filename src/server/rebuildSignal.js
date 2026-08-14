/**
 * Best-effort rebuild of a group package after a Mark done, and the one in-band signal that says it
 * did not work.
 *
 * Two failures are BENIGN and must not surface: no lesson is done yet, and there are no unit folders
 * at all. Both mean "there is nothing to package", which is not an error at the moment a first
 * lesson is being signed off. Every other failure is a real build error the reviewer has to see. It
 * used to be swallowed here, so Mark done reported success while the shipping `.apkg` silently
 * stayed stale, and the reviewer walked away believing the deck was current.
 *
 * ⚠️ MARK DONE IS THE ONLY CALLER. An exclude, an edit or an audio change on an already-done lesson
 * does NOT rebuild. Two comments (here and in src/deck/rebuild.js) used to claim it did, so both
 * files asserted a safety property neither provided. Preflight's `package-freshness` check is what
 * reports the staleness that leaves behind.
 *
 * Extracted from the server closure so the branch is unit-testable: this string is what both human
 * gates read, and it had no test at all.
 */

// A rebuild that failed because there was nothing to build. Kept as one regex, next to the only
// thing that interprets it, because it is matched against messages thrown from three places
// (rebuildBookDir, selectDoneChapterDecks, rebuildRunDir).
const BENIGN = /no finished lessons|no chapter-\*\/|directories found/;

export function isBenignRebuildFailure(message) {
  return BENIGN.test(message || "");
}

/** `{ rebuildError }` — null when the rebuild worked or failed benignly. */
export async function rebuildGroupQuiet(outputRoot, adapter, id) {
  try {
    await adapter?.rebuild?.(outputRoot, id);
    return { rebuildError: null };
  } catch (e) {
    return {
      rebuildError: isBenignRebuildFailure(e.message) ? null : e.message || "rebuild failed",
    };
  }
}

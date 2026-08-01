// Where a unit's deck sits under its book/course parent, as path segments.
//
// THE ONE PLACE that answers this. Both delivery paths call it — the `.apkg` builder
// (`buildMultiDecks`) and the AnkiConnect deliverer (`resolveDecks`) — because they used to derive
// the deck name separately and drifted, silently delivering a unit into a deck of a different name
// than the package created.
//
// A textbook label carries its own grouping in its prefix: "Lesson 1: Meeting: Nice to Meet You"
// belongs with "Lesson 1: Meeting: Nice to Meet You (Extras)". Splitting on that prefix puts the
// lesson and its drills side by side under a shared "Lesson 1" deck:
//
//   Japanese for Busy People Book 1: Kana
//   └── Lesson 1                              <- grouping deck, HOLDS NO CARDS
//       ├── Meeting: Nice to Meet You         <- the lesson
//       └── Meeting: Nice to Meet You (Extras)<- its drills
//
// which is what makes all three study modes reachable: the lesson alone, the drills alone, or both
// together by clicking the group.
//
// ⚠️ The invariant that matters: **a deck holding cards must never have children.** Anki studies a
// parent deck together with everything beneath it, so a card-holding parent cannot be studied on its
// own. Grouping decks exist purely to nest and hold nothing. An earlier version nested the drills
// under the LESSON deck itself, which made the lesson unstudyable alone; see
// .harness/custom/docs/LIMITATIONS.md.
//
// A label with no such prefix (a course's bare "Lesson 1", a book's "Frequently Used Expressions")
// has nothing to group with and stays one level under the parent.

const GROUPED_LABEL = /^((?:Lesson|Chapter|Unit)\s+\d+)\s*:\s*(.+)$/;

/**
 * `["Lesson 1", "Meeting: Nice to Meet You"]` for a grouped label, else `["<label>"]`.
 * Segments are returned raw; the caller sanitizes them for its own target.
 */
export function unitDeckSegments(label) {
  const text = String(label ?? "").trim();
  const m = GROUPED_LABEL.exec(text);
  return m ? [m[1], m[2]] : [text];
}

/**
 * Every grouping deck implied by a set of labels — the decks that must exist to nest under but which
 * hold no cards of their own. Returned in the order first seen.
 */
export function groupingSegments(labels) {
  const groups = [];
  for (const label of labels) {
    const segs = unitDeckSegments(label);
    if (segs.length > 1 && !groups.includes(segs[0])) groups.push(segs[0]);
  }
  return groups;
}

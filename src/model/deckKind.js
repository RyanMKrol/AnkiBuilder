import { existsSync, readFileSync } from "fs";
import { join } from "path";

// What a collection's deck is FOR. A collection is identified by its book AND its deck kind (owner
// ruling 2026-09-23, DECISIONS.md "A collection is a book plus a deck kind"), so one book file can
// carry a speaking-and-listening deck and a reading deck without their folders, dedup corpora, Anki
// decks or note types ever meeting. The skill used decides the kind: build-anki-deck builds
// speaking-listening, build-reading-deck builds reading. Design: docs/designs/reading-decks/.
//
// A collection marker with no `deckKind` is speaking-listening. Every collection built before the
// field existed is one, and none of their markers is rewritten to say so.

export const SPEAKING_LISTENING = "speaking-listening";
export const READING = "reading";

export const DECK_KINDS = Object.freeze([SPEAKING_LISTENING, READING]);

export const DEFAULT_DECK_KIND = SPEAKING_LISTENING;

/** The deck kind a marker (or a bare value) names; absent means speaking-listening. */
export function resolveDeckKind(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_DECK_KIND;
  if (!DECK_KINDS.includes(value)) {
    throw new Error(
      `unknown deck kind "${value}". A collection is one of: ${DECK_KINDS.join(", ")}`,
    );
  }
  return value;
}

/** The deck kind recorded in a collection marker (book.json / course.json), or the default. */
export function deckKindOf(marker) {
  return resolveDeckKind(marker?.deckKind);
}

export const isReadingKind = (kind) => resolveDeckKind(kind) === READING;

/**
 * The deck kind of the collection at `collectionDir` (a book or course folder): its `.deck-kind`
 * file, written when a non-default collection's folder is claimed and before its marker exists, or
 * else its book.json / course.json marker. Speaking-listening when neither says otherwise.
 */
export function collectionDeckKind(collectionDir) {
  const kindPath = join(collectionDir, ".deck-kind");
  if (existsSync(kindPath)) return resolveDeckKind(readFileSync(kindPath, "utf-8").trim());
  for (const name of ["book.json", "course.json"]) {
    const path = join(collectionDir, name);
    if (existsSync(path)) return deckKindOf(JSON.parse(readFileSync(path, "utf-8")));
  }
  return DEFAULT_DECK_KIND;
}

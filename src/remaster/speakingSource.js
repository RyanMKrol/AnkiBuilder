import { existsSync } from "fs";
import { getBookSource } from "../corpus/epubArchive.js";
import { libraryEpubPath } from "../corpus/epubLibrary.js";
import { refuseForSpeakingDeck } from "./purpose.js";

/**
 * Refuses to build a speaking-and-listening deck from a book converted for another purpose
 * (purpose.js, refuseForSpeakingDeck). Called by every speaking entry point before anything is paid
 * for. A book that is not in the library is left to the caller's own "not found" handling.
 */
export function assertSpeakingSourceBook(epubPath) {
  if (!epubPath || !existsSync(epubPath)) return;
  refuseForSpeakingDeck(getBookSource(epubPath));
}

/** The same, for callers that know the book only by its library hash. */
export function assertSpeakingSourceHash(epubHash, opts = {}) {
  assertSpeakingSourceBook(libraryEpubPath(epubHash, opts));
}

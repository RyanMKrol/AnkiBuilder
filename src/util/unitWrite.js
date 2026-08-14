import { basename } from "path";
import { existsSync, readFileSync } from "fs";
import { writeFileAtomic, backupFileStamped } from "./atomicWrite.js";
import { validateCards, validateCorpus } from "../model/index.js";

/**
 * The one safe way for a `scripts/` tool to rewrite a unit's `cards.json` / `corpus.json`.
 *
 * Everything in `src/` already writes through `writeFileAtomic` and validates what it produces, but
 * the scripts did not: they used a bare `writeFileSync` against the same reviewed (and, under
 * `--force`, finished and already-delivered) units, using the least safe write path in the repo,
 * against files that until recently had no backup anywhere. This is the retrofit.
 *
 * Three things happen, in this order, and each one exists for a different failure:
 *
 *  1. VALIDATE BEFORE. A script that builds a malformed object should not get as far as touching the
 *     file. Validating first means the old content is still on disk when the throw happens.
 *  2. BACKUP, STAMPED. `<file>.pre-<reason>-<YYYYMMDDHHmm>.bak`, one per run, so a second run of the
 *     same tool cannot clobber the restore point for the state it found.
 *  3. WRITE ATOMICALLY, THEN VALIDATE WHAT LANDED. The dashboard and the deck rebuild read these
 *     files with a bare `JSON.parse`, so a half-written file is a hard failure rather than a
 *     glitch. Re-reading afterwards is what makes "the write succeeded" mean the file on disk is
 *     usable, not just that `writeFileSync` returned.
 *
 * `reason` is the short tool tag that goes in the backup name (e.g. "extras-order"). Files other
 * than `cards.json` / `corpus.json` get the atomic write and the backup, but no schema check.
 */
export function writeUnitJson(path, data, { reason } = {}) {
  if (!reason) throw new Error("writeUnitJson needs a `reason` for the backup filename");

  const validate = validatorFor(path);
  if (validate) validate(data);

  const backup = existsSync(path) ? backupFileStamped(path, reason) : null;

  writeFileAtomic(path, JSON.stringify(data, null, 2) + "\n");

  if (validate) {
    // Deliberately re-read from disk rather than trusting `data`: this is the check that the bytes
    // that landed are the bytes meant, which is the whole point of doing it after the write.
    validate(JSON.parse(readFileSync(path, "utf-8")));
  }
  return { path, backup };
}

/** The schema check that applies to this filename, or null for a file with no declared schema. */
export function validatorFor(path) {
  const name = basename(path);
  if (name === "cards.json") return validateCards;
  if (name === "corpus.json") return validateCorpus;
  return null;
}

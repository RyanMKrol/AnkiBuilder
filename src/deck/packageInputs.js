import { createHash } from "crypto";
import { existsSync, readFileSync, statSync } from "fs";
import { basename, resolve } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";

// What a collection's `.apkg` was built FROM, recorded beside it, so "is the package current?" can
// be answered from content rather than from file times.
//
// Comparing mtimes was the only signal before this, and it lied in one direction: anything that
// rewrites a `cards.json` with the same content (a `git checkout`, a branch switch, a restore) makes
// the package look stale. It happened twice on one day to the Genki reading collection, where
// chapter-7/cards.json matched git exactly and still failed preflight. So every package build now
// writes `<package>.inputs.json`, a digest of each unit's cards as the build read them, and every
// freshness question (preflight's package-freshness check, the gate 2 watcher, the collection state
// line) goes through `unitPackageFreshness` below, so the three can never disagree.
//
// A package built before this existed has no sidecar. For those the old mtime comparison still
// runs, and the result says `basis: "mtime"` so a reader knows which question was answered. One
// rebuild writes the sidecar and moves the collection onto the content basis for good.

/** The sidecar's path: the package path plus `.inputs.json`. Gitignored with the package. */
export function packageInputsPath(packagePath) {
  return `${packagePath}.inputs.json`;
}

/**
 * The digest of a unit's cards, taken from the PARSED object rather than the file bytes, so a
 * rewrite that only changes whitespace or the trailing newline (the dashboard and the CLI format
 * cards.json differently) is not a content change either.
 */
export function cardsDigest(cards) {
  return createHash("sha256").update(JSON.stringify(cards)).digest("hex");
}

/**
 * The key a unit is recorded under: its folder name inside a book or course (`chapter-7`), or `.`
 * for a template or one-off run dir, which is its own package's only unit.
 */
export function packageInputKey(collectionDir, unitDir) {
  return resolve(unitDir) === resolve(collectionDir) ? "." : basename(resolve(unitDir));
}

/**
 * Records what a package was built from. Call it AFTER the package itself has been written, never
 * before: a sidecar that lands while the package write failed would vouch for content the package
 * does not hold, while the reverse order only ever errs towards "stale, rebuild".
 *
 * `inputs` maps each unit's key to the cards object the build read, or, with `digested: true`, to
 * the digest already taken from it (a builder that resolves cards in place has to digest first).
 */
export function writePackageInputs(packagePath, inputs, { digested = false } = {}) {
  const units = {};
  for (const [key, value] of Object.entries(inputs)) {
    units[key] = digested ? value : cardsDigest(value);
  }
  writeFileAtomic(
    packageInputsPath(packagePath),
    `${JSON.stringify({ version: 1, builtAt: new Date().toISOString(), units }, null, 2)}\n`,
  );
}

/** The recorded inputs, or null when there is no sidecar or it will not parse. */
export function readPackageInputs(packagePath) {
  const path = packageInputsPath(packagePath);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data && typeof data.units === "object" ? data : null;
  } catch {
    return null;
  }
}

function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Is ONE unit's current cards.json what the package was built from?
 *
 * Returns `{ status, basis }`:
 * - `no-package`: there is no package at all.
 * - `current` / `stale`: answered on `basis: "content"` when the package has a sidecar (the unit's
 *   digest matches the recorded one, or the unit is missing from the record), and on
 *   `basis: "mtime"` when it has none (the package is at least as new as cards.json).
 * - `unreadable`: cards.json would not parse, so the question cannot be answered. Callers treat it
 *   as stale rather than current, because "I could not check" must never read as "fine".
 *
 * On the content basis a unit with no cards at all is current: the build skips it (a reading
 * chapter whose kana words all went elsewhere), so it is never in the record, and there is nothing
 * of it the package could be missing.
 */
export function unitPackageFreshness({ packagePath, collectionDir, unitDir, inputs = undefined }) {
  const packageAt = mtimeMs(packagePath);
  if (packageAt === null) return { status: "no-package", basis: null, packageAt };
  const cardsPath = resolve(unitDir, "cards.json");

  let cards;
  try {
    cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
  } catch {
    return { status: "unreadable", basis: null, packageAt };
  }
  const recorded = inputs === undefined ? readPackageInputs(packagePath) : inputs;
  if (recorded) {
    if (!Array.isArray(cards.items) || cards.items.length === 0) {
      return { status: "current", basis: "content", packageAt };
    }
    const key = packageInputKey(collectionDir, unitDir);
    const same = recorded.units[key] === cardsDigest(cards);
    return { status: same ? "current" : "stale", basis: "content", packageAt };
  }
  const cardsAt = mtimeMs(cardsPath);
  return {
    status: cardsAt !== null && cardsAt > packageAt ? "stale" : "current",
    basis: "mtime",
    packageAt,
  };
}

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * A throwaway output root, built unit by unit.
 *
 * Every test in test/audit/ works against one of these and NEVER against the repo's own `output/`.
 * That is not just hygiene: the suite-wide durable-write guard (scripts/test-with-write-guard.mjs)
 * fails the whole run if anything under `output/`, `.anki-builder/` or `anki-backups/` changes, so a
 * test that reached for the real tree would take the build down with it — which is the point.
 */
export function makeOutputRoot() {
  const root = mkdtempSync(join(tmpdir(), "audit-fixture-"));
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  return { root, cleanup };
}

export const card = (id, over = {}) => ({
  id,
  english: id,
  category: "Numbers",
  target: id,
  pronunciation: id,
  ...over,
});

/**
 * Writes one unit directory. `path` is relative to the output root, e.g.
 * `epubs/book/chapter-1` or `templates/numbers/ja`.
 */
export function writeUnit(root, path, { meta = {}, items = [], corpus = null } = {}) {
  const dir = join(root, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({ meta: { targetLanguage: "ja", sourceType: "epub", ...meta }, items }, null, 2),
  );
  if (corpus) writeFileSync(join(dir, "corpus.json"), JSON.stringify(corpus, null, 2));
  return dir;
}

/** Writes a collection marker (`book.json` / `course.json` / `anki-delivered.json`). */
export function writeMarker(root, path, name, data) {
  const dir = join(root, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(data, null, 2));
  return join(dir, name);
}

/** Writes an arbitrary file inside the fixture (a stray .apkg, a broken JSON blob). */
export function writeRaw(root, path, contents) {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

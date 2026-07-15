import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { slugify } from "../util/slugify.js";
import { getBookTitle } from "../corpus/epubArchive.js";
import { loadBookMeta, saveBookSlug } from "../corpus/epubLibrary.js";

function epubHashMarkerPath(outputRoot, slug) {
  return join(outputRoot, slug, ".epub-hash");
}

function matchesHashMarker(outputRoot, slug, epubHash) {
  const markerPath = epubHashMarkerPath(outputRoot, slug);
  return existsSync(markerPath) && readFileSync(markerPath, "utf-8").trim() === epubHash;
}

/**
 * Resolves (and, on first use, creates) a book's folder under `outputRoot` — keyed by
 * content hash, but named with a human-readable slug derived from the EPUB's own
 * title. Once assigned, the slug is persisted to the library (via `saveBookSlug`) and
 * reused on every later call for the same hash, without recomputing it from the
 * title — stable even if title extraction logic or the book's own metadata changes
 * later. A `.epub-hash` marker file in each book folder records which hash owns that
 * name; on a collision with a DIFFERENT book already claiming the same slug, falls
 * back to a numeric suffix (`-2`, `-3`, ...) rather than a hash suffix, staying
 * human-readable.
 */
export function resolveBookSlug(outputRoot, epubPath, epubHash, opts = {}) {
  const meta = loadBookMeta(epubHash, opts);
  if (meta?.slug && matchesHashMarker(outputRoot, meta.slug, epubHash)) {
    return meta.slug;
  }

  const baseSlug = slugify(getBookTitle(epubPath) || epubHash);
  let candidate = baseSlug;
  let suffix = 2;
  while (
    existsSync(join(outputRoot, candidate)) &&
    !matchesHashMarker(outputRoot, candidate, epubHash)
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  mkdirSync(join(outputRoot, candidate), { recursive: true });
  writeFileSync(epubHashMarkerPath(outputRoot, candidate), epubHash);
  saveBookSlug(epubHash, candidate, opts);
  return candidate;
}

const CHAPTER_DIR_PATTERN = /^chapter-(\d+)$/;

function existingChapterSeqs(bookDir) {
  if (!existsSync(bookDir)) {
    return [];
  }
  return readdirSync(bookDir)
    .map((name) => name.match(CHAPTER_DIR_PATTERN))
    .filter(Boolean)
    .map((m) => Number(m[1]));
}

/**
 * Resolves the run directory for one (epubHash, chapterNumber) pair under
 * `outputRoot/<slug>/` — reusing an existing `chapter-<seq>/` whose own corpus.json
 * already matches this exact chapter (same idempotency spirit as assemble's own
 * "corpus.json already exists — reusing", just at directory granularity), or else
 * allocating the next free sequential index (gaps from a manually-deleted folder are
 * never backfilled). Does not create the directory itself — the caller's own
 * corpus.json write does that, same as every other run dir today.
 */
export function resolveChapterRunDir(outputRoot, slug, epubHash, chapterNumber) {
  const bookDir = join(outputRoot, slug);
  const seqs = existingChapterSeqs(bookDir);

  for (const seq of seqs) {
    const corpusPath = join(bookDir, `chapter-${seq}`, "corpus.json");
    if (!existsSync(corpusPath)) {
      continue;
    }
    const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
    if (corpus.meta?.epubHash === epubHash && corpus.meta?.chapterNumber === chapterNumber) {
      return join(bookDir, `chapter-${seq}`);
    }
  }

  const nextSeq = seqs.length > 0 ? Math.max(...seqs) + 1 : 0;
  return join(bookDir, `chapter-${nextSeq}`);
}

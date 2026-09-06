// What the image specialist concluded about each of a chapter's images, kept.
//
// THE FAILURE THIS CLOSES. v1's extraction prompt already required the model to report which images
// it opened, and `diffImageCoverage` (src/corpus/epubLlmExtract.js) already computed which of the
// chapter's referenced images were never accounted for. Both work. Then `epubLlmCorpus.js`
// destructures the result down to `{ items }` and the accounting is dropped on the floor, so after
// a build a grammar table the model skipped and a chapter that never had one produce byte-identical
// output. That is the sharpest silent failure in the pipeline, because publishers put exactly the
// grid-shaped content that carries a paradigm into pictures.
//
// So the verdict is an ARTIFACT, and it is written for every image whatever the verdict is. The
// point is not to record the interesting ones: "decorative" and "content" are equally worth having,
// because what makes the failure invisible is an image with NO entry, and that is only detectable
// if the uninteresting ones are present too.
//
// v1's discard is not patched. Stage E replaces that code path outright, so fixing the destructure
// would improve a function about to be deleted, on a generation that will build no further chapters.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";

/** The artifact, inside a unit's run directory. */
export const VERDICTS_FILE = "image-verdicts.json";

/**
 * What an image can be judged to be.
 *
 * `unreadable` is a first-class outcome, not an error: an image the specialist could not open or
 * could not make sense of is a real state, and recording it is what stops it being silently
 * indistinguishable from `decorative`. It is the one verdict that should make a human look.
 */
export const VERDICT = Object.freeze({
  CONTENT: "content",
  REFERENCE_CHART: "reference-chart",
  LABELLED_FIGURE: "labelled-figure",
  DECORATIVE: "decorative",
  UNREADABLE: "unreadable",
});
const VERDICTS = new Set(Object.values(VERDICT));

/** Verdicts that mean the picture carries teaching content someone must have extracted. */
export const CONTENT_BEARING = Object.freeze([
  VERDICT.CONTENT,
  VERDICT.REFERENCE_CHART,
  VERDICT.LABELLED_FIGURE,
]);

export function verdictsPath(unitDir) {
  return join(unitDir, VERDICTS_FILE);
}

/**
 * Records one verdict per image.
 *
 * `entries` is `[{ src, verdict, transcription?, note? }]`. Every entry is validated, because a
 * typo'd verdict that silently sorted as "not content-bearing" would reintroduce the exact failure
 * this file exists to close.
 */
export function writeVerdicts(unitDir, entries, { now = () => new Date().toISOString() } = {}) {
  if (!Array.isArray(entries)) throw new Error("writeVerdicts needs an entries array");
  for (const entry of entries) {
    if (!entry?.src) throw new Error("every verdict entry needs the image src it judges");
    if (!VERDICTS.has(entry.verdict)) {
      throw new Error(
        `unknown verdict ${JSON.stringify(entry.verdict)} for ${entry.src}. ` +
          `One of: ${[...VERDICTS].join(", ")}`,
      );
    }
  }
  const byVerdict = {};
  for (const entry of entries) byVerdict[entry.verdict] = (byVerdict[entry.verdict] ?? 0) + 1;

  const path = verdictsPath(unitDir);
  writeFileAtomic(
    path,
    `${JSON.stringify({ capturedAt: now(), counts: { total: entries.length, byVerdict }, entries }, null, 2)}\n`,
  );
  return path;
}

/** The recorded verdicts for a unit, or null when nothing was ever recorded. */
export function readVerdicts(unitDir) {
  const path = verdictsPath(unitDir);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;
}

/**
 * The images the chapter references that carry no verdict.
 *
 * This is the whole check. A non-empty result means somebody's eyes never reached those pictures,
 * and it is reported separately from `unreadable` because "nobody looked" and "looked and could not
 * tell" call for different responses.
 *
 * Matching is on basename, the same relaxation `diffImageCoverage` makes, because a model naming an
 * image tends to give the filename rather than the full relative path it was resolved from.
 */
export function unaccountedImages(referencedSrcs, verdicts) {
  const judged = new Set((verdicts?.entries ?? []).map((entry) => basenameOf(entry.src)));
  return referencedSrcs.filter((src) => !judged.has(basenameOf(src)));
}

/** Images judged to carry teaching content, so a caller can check each became something. */
export function contentBearing(verdicts) {
  return (verdicts?.entries ?? []).filter((entry) => CONTENT_BEARING.includes(entry.verdict));
}

function basenameOf(src) {
  return String(src).split("/").pop();
}

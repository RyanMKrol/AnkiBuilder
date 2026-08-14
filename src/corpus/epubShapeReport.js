import { inspectEpubStructure } from "./epubArchive.js";
import { classifyLesson } from "./epubLessons.js";
import { unitDeckSegments } from "../deck/deckPath.js";

// Every number in this file answers one question — "will this book work?" — before a single
// paid pass runs. Nothing here writes, extracts, or spends anything: it reads the archive and
// counts what the parser is about to do silently.
//
// The thresholds are derived from the one book this pipeline is proven on, Japanese for Busy
// People Book 1 (57 spine files, 2.0 MB of content, 727 distinct images). They are not
// correctness limits — they mark "this book is materially bigger than anything that has ever
// been through here", which is the point at which a whole-book pass stops being a known
// quantity. Doubling the proven figures is a deliberate round choice, not a measurement.
const PROVEN_BOOK = { spineCount: 57, contentBytes: 2039015, distinctImages: 727 };
const SIZE_WARN = {
  spineCount: PROVEN_BOOK.spineCount * 2,
  contentBytes: PROVEN_BOOK.contentBytes * 2,
  distinctImages: PROVEN_BOOK.distinctImages * 2,
};

// A spine file with almost no readable text but several images is a page whose entire content
// is pictures — the extraction model has to open every one of them, and a chapter it could not
// read looks exactly like an empty one. 200 characters is roughly a single paragraph.
const THIN_TEXT_CHARS = 200;

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function rangeText(first, last) {
  return last > first ? `${first}-${last}` : `${first}`;
}

/**
 * The full shape of an EPUB as the pipeline will see it: `inspectEpubStructure`'s structural
 * survey, enriched with the two conventions that decide what a nav entry BECOMES —
 * `classifyLesson` (how `--list-lessons` annotates it) and `unitDeckSegments` (the live Anki
 * deck path its label produces) — plus a flat list of warnings.
 *
 * Read-only and free. Everything it reports is a degradation that happens today without any
 * message at all.
 */
export function buildShapeReport(epubPath, { cache = null, labelDecoding = 1 } = {}) {
  const inspection = inspectEpubStructure(epubPath, { labelDecoding });

  const lessons = inspection.lessons.map((lesson) => ({
    ...lesson,
    type: classifyLesson(lesson.label),
    deckSegments: unitDeckSegments(lesson.label),
  }));

  // The label is the only handle a person has on a lesson (and, via unitDeckSegments, the only
  // handle Anki has on its deck). Two entries sharing one label means --lesson "<label>" is
  // ambiguous and two lessons would file into the same deck — including when the collision is
  // between a nav entry and the <title>-tag fallback describeChapter() invents for a spine file
  // the nav never named.
  const labelSources = new Map();
  for (const lesson of lessons) {
    if (!labelSources.has(lesson.label)) labelSources.set(lesson.label, []);
    labelSources.get(lesson.label).push(`nav entry [${lesson.number}]`);
  }
  for (const file of inspection.unreachable) {
    if (!labelSources.has(file.fallbackLabel)) labelSources.set(file.fallbackLabel, []);
    labelSources.get(file.fallbackLabel).push(`describeChapter(${file.number}) <title> fallback`);
  }
  const labelCollisions = [...labelSources.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([label, sources]) => ({ label, sources }));

  const thinFiles = inspection.spine.filter(
    (file) => file.textLength < THIN_TEXT_CHARS && file.images.length > 0,
  );

  const warnings = [];
  if (!inspection.nav.source) {
    warnings.push(
      "no navigation document — this book has no selectable lessons at all; every build has to " +
        "name a raw --chapter-number",
    );
  }
  if (inspection.nav.unparsed) {
    warnings.push(
      `the ${inspection.nav.source} navigation document declares ${inspection.nav.unparsed} more ` +
        `entr(ies) than this parser could read — those lessons cannot be selected at all, and ` +
        `every --lesson ordinal after them is shifted`,
    );
  }
  if (inspection.nav.unresolved.length) {
    warnings.push(
      `${inspection.nav.unresolved.length} nav entr(ies) point at no spine file and were dropped: ` +
        inspection.nav.unresolved.map((e) => `"${e.label}" (${e.href})`).join(", "),
    );
  }
  if (inspection.nav.collapsed.length) {
    warnings.push(
      `${inspection.nav.collapsed.length} nav entr(ies) share a spine file with the entry before ` +
        `them and were collapsed away: ` +
        inspection.nav.collapsed
          .map((e) => `"${e.label}" into "${e.keptLabel}" (spine ${e.spinePosition})`)
          .join(", "),
    );
  }
  if (inspection.unreachable.length) {
    warnings.push(
      `${inspection.unreachable.length} spine file(s) fall before the first nav entry and are ` +
        `UNREACHABLE via --lesson (only --chapter-number reaches them): ` +
        inspection.unreachable.map((f) => `${f.number} (${f.href})`).join(", "),
    );
  }
  const swallowers = lessons.filter((lesson) => lesson.swallowed > 0);
  if (swallowers.length) {
    warnings.push(
      `${swallowers.length} nav entr(ies) cover spine files the nav never named — those files are ` +
        `extracted as part of the entry above them: ` +
        swallowers
          .map(
            (l) =>
              `[${l.number}] "${l.label}" spine ${rangeText(l.firstChapterNumber, l.lastChapterNumber)} ` +
              `(named ${l.namedInRange}/${l.filesInRange})`,
          )
          .join(", "),
    );
  }
  const nonMonotonic = lessons.filter((lesson) => !lesson.monotonic);
  if (nonMonotonic.length) {
    warnings.push(
      `${nonMonotonic.length} nav entr(ies) produce an INVERTED spine range (last before first) — ` +
        `the nav document is not in reading order: ` +
        nonMonotonic
          .map((l) => `[${l.number}] "${l.label}" ${l.firstChapterNumber}-${l.lastChapterNumber}`)
          .join(", "),
    );
  }
  const teaching = lessons.filter((l) => l.type === "lesson" || l.type === "unit");
  if (lessons.length > 0 && teaching.length === 0) {
    warnings.push(
      `0 of ${lessons.length} nav entries classify as a lesson or unit — this book does not label ` +
        `its sections the way a textbook does. Selection still works on any entry; the type column ` +
        `is an annotation, never a filter.`,
    );
  }
  if (labelCollisions.length) {
    warnings.push(
      `${labelCollisions.length} label collision(s) — the same human label reaches --lesson and the ` +
        `deck path from two places: ` +
        labelCollisions.map((c) => `"${c.label}" (${c.sources.join(" + ")})`).join(", "),
    );
  }
  if (inspection.imageCollisions.length) {
    warnings.push(
      `${inspection.imageCollisions.length} image filename collision(s) — different archive images ` +
        `resolve to one path in the shared chapters/ cache, so one overwrites the other: ` +
        inspection.imageCollisions
          .map((c) => `${c.dest} <- ${c.archivePaths.join(" + ")}`)
          .join(", "),
    );
  }
  if (inspection.totals.missingImages) {
    warnings.push(
      `${inspection.totals.missingImages} image reference(s) point at files not in the archive — ` +
        `the extraction model is told to open these and will find nothing`,
    );
  }
  if (inspection.totals.svgImages) {
    warnings.push(
      `${inspection.totals.svgImages} referenced image(s) are SVG — an SVG is often a wrapper ` +
        `around the real raster image, which the model cannot read from the wrapper alone`,
    );
  }
  const nonUtf8 = inspection.spine.filter((file) => file.encoding.isNonUtf8);
  if (nonUtf8.length) {
    warnings.push(
      `${nonUtf8.length} spine file(s) are not UTF-8 — this reader decodes and caches every chapter ` +
        `as UTF-8, so their text reaches the extraction model mangled: ` +
        nonUtf8
          .map(
            (f) =>
              `${f.number} (${f.encoding.declared ? `declared ${f.encoding.declared}` : `${f.encoding.replacementChars} undecodable byte(s)`})`,
          )
          .join(", "),
    );
  }
  if (thinFiles.length) {
    warnings.push(
      `${thinFiles.length} spine file(s) carry under ${THIN_TEXT_CHARS} characters of text but do ` +
        `carry images — their content is pictures, so extraction depends entirely on the model ` +
        `opening them: ` +
        thinFiles
          .map((f) => `${f.number} (${f.textLength} chars, ${f.images.length} images)`)
          .join(", "),
    );
  }
  const { totals } = inspection;
  if (
    totals.spineCount > SIZE_WARN.spineCount ||
    totals.contentBytes > SIZE_WARN.contentBytes ||
    totals.distinctImages > SIZE_WARN.distinctImages
  ) {
    warnings.push(
      `this book is materially larger than the one this pipeline is proven on ` +
        `(${totals.spineCount} spine files / ${formatBytes(totals.contentBytes)} / ` +
        `${totals.distinctImages} images vs ${PROVEN_BOOK.spineCount} / ` +
        `${formatBytes(PROVEN_BOOK.contentBytes)} / ${PROVEN_BOOK.distinctImages}) — the whole-book ` +
        `passes (conventions, taught-index) read every file inside one timeout`,
    );
  }

  // A book whose artifacts already exist behaves like an older version of this tool, so what
  // is cached (and when) belongs beside what the book contains. Optional: callers without a
  // library to consult (a probe of a file that was never registered) pass nothing.
  if (cache && cache.registered) {
    const stale = [];
    if (cache.conventions.present) stale.push("conventions.md");
    if (cache.taughtIndex.present) stale.push("taught-index.json");
    if (cache.chapters.present) stale.push("extracted chapters");
    if (stale.length) {
      warnings.push(
        `this book already has cached artifacts (${stale.join(", ")}) — every parser and prompt ` +
          `fix since they were written is inert until they are cleared ` +
          `(anki-builder epub cache ${cache.epubHash} --clear)`,
      );
    }
    if (cache.staleRoots.length) {
      warnings.push(
        `extraction output from an older cache version is still on disk (${cache.staleRoots.join(", ")}) ` +
          `— it is unused, and epub cache --clear removes it`,
      );
    }
  }

  return { ...inspection, cache, lessons, labelCollisions, thinFiles, warnings };
}

/**
 * The shape report as lines of text, for `--list-lessons` (summary + warnings) or
 * `epub-probe` (`detail: true` adds the per-entry and per-file tables). Returned as an array
 * so callers can route it through their own log function one line at a time.
 */
export function formatShapeReport(report, { detail = false } = {}) {
  const lines = [];
  const { totals } = report;

  lines.push("shape report:");
  lines.push(
    `  nav source: ${report.nav.source ?? "none (no navigation document)"} — ` +
      `${report.nav.rawCount} raw entr(ies), ${report.lessons.length} selectable lesson(s)`,
  );
  lines.push(
    `  spine: ${totals.spineCount} file(s), ${formatBytes(totals.contentBytes)} of content`,
  );
  lines.push(
    `  images: ${totals.imageRefs} reference(s), ${totals.distinctImages} distinct, ` +
      `${totals.missingImages} missing, ${totals.svgImages} SVG, ` +
      `${report.imageCollisions.length} filename collision(s)`,
  );
  if (report.cache && report.cache.registered) {
    lines.push(
      `  cache: v${report.cache.cacheVersion}, ${report.cache.chapters.files} extracted file(s), ` +
        `conventions.md ${report.cache.conventions.present ? report.cache.conventions.generatedAt : "not generated"}, ` +
        `taught-index.json ${report.cache.taughtIndex.present ? report.cache.taughtIndex.generatedAt : "not generated"}, ` +
        `${report.cache.reviewedCorpora} reviewed corpus file(s)`,
    );
  }

  if (detail) {
    lines.push("  nav entries (type is an annotation, never a filter):");
    for (const lesson of report.lessons) {
      const range = rangeText(lesson.firstChapterNumber, lesson.lastChapterNumber);
      lines.push(
        `    [${lesson.number}] (${lesson.type}) spine ${range} — named ` +
          `${lesson.namedInRange}/${lesson.filesInRange} — ${lesson.label}`,
      );
      lines.push(`         deck: ${lesson.deckSegments.join(" :: ")}`);
    }
    lines.push("  spine files:");
    for (const file of report.spine) {
      lines.push(
        `    ${file.number}: ${file.textLength} chars of text, ${file.images.length} image(s), ` +
          `${formatBytes(file.bytes)} — ${file.href}`,
      );
    }
  }

  if (report.warnings.length === 0) {
    lines.push("  no shape warnings");
    return lines;
  }
  for (const warning of report.warnings) {
    lines.push(`  WARN: ${warning}`);
  }
  return lines;
}

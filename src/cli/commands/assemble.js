// The `assemble` command: turn a source (template, EPUB chapter, dictated word list)
// into a run directory's corpus.json, then chain into `prepare` unless told not to.
// Moved verbatim from src/cli/index.js when the CLI was split per command.
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { withClaim } from "../runClaim.js";
import { validateCorpus } from "../../model/index.js";
import { resolveIso639Code } from "../../model/iso639.js";
import { listTemplates } from "../../corpus/templates.js";
import { normalizeDisplayText } from "../../model/scriptSpacing.js";
import { writeJson, runDirOrderContext } from "./shared.js";
import { runPrepare } from "./prepare.js";

function resolveAssembleRunDir(flags, ctx) {
  if (!flags["output-root"]) {
    return flags.run;
  }

  if (flags.template) {
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from a --template source");
    }
    const outputRoot = resolve(flags["output-root"]);
    const runDir = ctx.resolveTemplateRunDir(outputRoot, flags.template, flags.lang);
    ctx.log(`resolved run directory: ${runDir}`);
    return runDir;
  }

  if (flags.words) {
    if (!flags.course) {
      throw new Error("--course <name> is required when assembling from --words");
    }
    if (!flags["lesson-number"]) {
      throw new Error("--lesson-number is required when assembling from --words");
    }
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from --words");
    }

    const outputRoot = resolve(flags["output-root"]);
    const courseSlug = ctx.resolveCourseSlug(outputRoot, flags.course, flags.lang);
    const lessonNumber = Number(flags["lesson-number"]);
    // Two lessons dictated at the same time are both told "next is N" by nextLessonNumber, and
    // no filesystem primitive can catch that — the identity is chosen before the path is. So
    // refuse a number this course has already used rather than quietly producing a second
    // "Lesson N" that merges into the deck as a duplicate sub-deck.
    if (!flags.force && ctx.lessonNumberInUse(outputRoot, courseSlug, lessonNumber)) {
      throw new Error(
        `lesson ${lessonNumber} already exists in course "${courseSlug}". ` +
          `The next free number is ${ctx.nextLessonNumber(outputRoot, courseSlug)}. ` +
          `Pass --force to build over the existing lesson.`,
      );
    }
    const runDir = ctx.resolveLessonRunDir(outputRoot, courseSlug, lessonNumber);
    ctx.log(`resolved run directory: ${runDir}`);
    return runDir;
  }

  if (!flags.epub) {
    throw new Error("--output-root can only be used with --template, --epub, or --words");
  }
  if (!flags["chapter-number"]) {
    throw new Error("--chapter-number is required when assembling from --epub");
  }

  const outputRoot = resolve(flags["output-root"]);
  const { epubHash } = ctx.registerEpub(flags.epub);
  const slug = ctx.resolveBookSlug(outputRoot, flags.epub, epubHash);
  // Keep a durable copy of the EPUB in the book's output folder (+ a book.json marker)
  // so future chapters can be built with `--book <slug>` without re-locating the file.
  ctx.materializeBookInOutput(outputRoot, slug, flags.epub, epubHash, flags.lang);
  const runDir = ctx.resolveChapterRunDir(
    outputRoot,
    slug,
    epubHash,
    Number(flags["chapter-number"]),
  );
  ctx.log(`resolved run directory: ${runDir}`);
  return runDir;
}

/**
 * Warns when a book's lessons are being built out of order.
 *
 * The backward de-dup library (`.anki-builder/epubs/<hash>/corpora/`) is written by the DASHBOARD's
 * "Mark reviewed", never by a build. So a lesson's de-dup can only see lessons that have been signed
 * off — not lessons that merely exist on disk. Assembling lesson 8 before lesson 7 is reviewed means
 * everything lesson 7 taught goes unflagged as a repeat, silently, and there is nothing in the
 * output afterwards that says so.
 *
 * Warn, never refuse: getting ahead on extraction is a legitimate thing to want, and the cost is
 * duplicate cards a reviewer can still catch. Deliberately placed BEFORE the "corpus.json already
 * exists" branch, so it costs nothing, fires ahead of the multi-minute extraction, and still fires on
 * a resumed assemble that skips extraction entirely.
 */
function warnIfBuiltOutOfOrder(flags, ctx, runDir) {
  // Only sources that live in a numbered book/course folder have an order to be out of. A template
  // is one unit per language; a bare --run or --chapter has no siblings to reason about.
  const ordered = flags["output-root"] && (flags.epub || flags.book || flags.words);
  if (!ordered) return;

  const ownNumber = Number(flags["chapter-number"] ?? flags["lesson-number"]);
  const { unreviewed } = runDirOrderContext(runDir, ownNumber, ctx);
  if (unreviewed.length === 0) return;

  const named = unreviewed.map((unit) => `${unit.label} (${unit.name})`).join(", ");
  ctx.log(
    `assemble: WARNING — ${unreviewed.length} earlier lesson(s) of this book are not marked reviewed ` +
      `yet: ${named}.\n` +
      `  The backward de-dup library is written by the dashboard's "Mark reviewed", so this lesson's ` +
      `de-dup can only see lessons that have been signed off. Building out of order means vocabulary ` +
      `those lessons already taught will NOT be flagged as a repeat.\n` +
      `  Review them first ("npm run serve"), or continue and accept the duplicates.`,
  );
}

export async function runAssemble(flags, ctx) {
  // `--book <slug>` builds a new chapter of a previously-worked EPUB straight from its
  // durable output copy — desugar it into the normal `--epub <path>` flow before anything
  // else reads flags.epub (run-dir resolution, registerEpub, dedup, ...).
  if (flags.book && !flags.epub) {
    if (!flags["output-root"]) {
      throw new Error("--book <slug> requires --output-root <dir>");
    }
    const outputRoot = resolve(flags["output-root"]);
    flags.epub = ctx.resolveBookEpubPath(outputRoot, flags.book, {
      libraryHomeDir: ctx.libraryHome(),
    });
    ctx.log(`resolved book "${flags.book}" to ${flags.epub}`);
  }

  // `--list-lessons` prints the book's OWN lessons (from its nav document, as spine-position
  // ranges) so a person can pick one by name/number instead of guessing a raw spine index,
  // then exits without assembling anything.
  if (flags["list-lessons"]) {
    if (!flags.epub) {
      throw new Error("--list-lessons requires --epub <path> or --book <slug>");
    }
    const lessons = ctx.listLessons(flags.epub, { log: ctx.log });
    if (lessons.length === 0) {
      ctx.log(
        "no navigation document found — this EPUB doesn't declare its own lessons; " +
          "use --chapter-number <spine index> instead",
      );
    }
    for (const lesson of lessons) {
      const range =
        lesson.lastChapterNumber > lesson.firstChapterNumber
          ? `${lesson.firstChapterNumber}-${lesson.lastChapterNumber}`
          : `${lesson.firstChapterNumber}`;
      ctx.log(`[${lesson.number}] (${lesson.type}) spine ${range}: ${lesson.label}`);
    }
    // The lesson list alone answers "what can I select"; it does not answer "will this book
    // work". The shape report does, at the one moment a person is looking at this book and
    // before any pass has been paid for — a book whose every nav entry silently swallows
    // files, or whose labels collide, prints an entirely reasonable-looking list above.
    const cache = ctx.describeBookCache(ctx.hashEpubFile(flags.epub));
    for (const line of ctx.formatShapeReport(ctx.buildShapeReport(flags.epub, { cache }))) {
      ctx.log(line);
    }
    return;
  }

  // `--lesson <selector>` selects one of the book's OWN lessons (by nav-list number or a
  // label substring) and desugars it into the normal --chapter-number flow: the lesson's
  // FIRST spine file becomes the chapter-number (so run-dir allocation, dedup, and the saved
  // corpus all key on it exactly as before), and the resolved range is stashed for the epub
  // assemble branch to extract in full. An explicit --chapter-number wins (manual override).
  if (flags.epub && flags.lesson && !flags["chapter-number"]) {
    const lesson = ctx.resolveLesson(flags.epub, flags.lesson, { log: ctx.log });
    flags["chapter-number"] = String(lesson.firstChapterNumber);
    flags.resolvedLesson = lesson;
    const range =
      lesson.lastChapterNumber > lesson.firstChapterNumber
        ? `spine ${lesson.firstChapterNumber}-${lesson.lastChapterNumber}`
        : `spine ${lesson.firstChapterNumber}`;
    ctx.log(`resolved lesson "${flags.lesson}" to "${lesson.label}" (${range})`);
  } else if (flags.lesson && flags["chapter-number"]) {
    ctx.log("both --lesson and --chapter-number given — using --chapter-number (manual override)");
  }

  const runDir = resolveAssembleRunDir(flags, ctx);
  if (!runDir) {
    throw new Error(
      "--run <dir> is required (or --output-root <dir> with --template, --epub, or --words)",
    );
  }
  const paths = ctx.runPaths(runDir);

  warnIfBuiltOutOfOrder(flags, ctx, runDir);

  if (existsSync(paths.corpus)) {
    ctx.log(`corpus.json already exists at ${paths.corpus} — reusing`);
  } else {
    // A FAILED assemble deliberately keeps its claim (clearOnFailure: false): the run dir was
    // reserved up front but has no corpus.json yet, so the claim is the only thing that lets the
    // retry reclaim this directory instead of leaking a fresh sequence number. See runClaim.js.
    await withClaim(runDir, { stage: "assemble" }, () => assembleIntoRunDir(flags, ctx, runDir), {
      clearOnFailure: false,
    });
  }

  // corpus.json is NOT a place a lesson stops. Everything from here to the first human review —
  // translate, drill enrichment, de-dup, cross-lesson notes — is one `prepare` stage, chained
  // automatically so no lesson can be left sitting un-translated by a session that simply ended.
  // Falling through the reuse branch above is what makes re-running `assemble` the resume command
  // for a lesson whose prepare was interrupted.
  if (flags["no-prepare"]) {
    ctx.log(
      "--no-prepare given — stopping at corpus.json. This lesson is NOT reviewable yet; " +
        `run "prepare --run ${runDir}" to finish it.`,
    );
    return;
  }
  return runPrepare({ ...flags, run: runDir }, ctx);
}

async function assembleIntoRunDir(flags, ctx, runDir) {
  const paths = ctx.runPaths(runDir);
  let corpus;
  // Hoisted so the pedagogical-sort pass below can pass the book's conventions as grounding on the
  // --epub path (null for every other source).
  let bookConventions = null;
  if (flags.words) {
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from --words");
    }
    if (!flags.course) {
      throw new Error("--course <name> is required when assembling from --words");
    }
    if (!flags["lesson-number"]) {
      throw new Error("--lesson-number is required when assembling from --words");
    }

    const englishWords = readFileSync(flags.words, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    corpus = ctx.assembleCorpusFromLessonWords({
      englishWords,
      targetLanguage: flags.lang,
      log: ctx.log,
    });

    const lessonNumber = Number(flags["lesson-number"]);
    const outputRoot = resolve(flags["output-root"]);
    const courseSlug = ctx.resolveCourseSlug(outputRoot, flags.course, flags.lang);
    corpus.meta = {
      ...corpus.meta,
      courseSlug,
      chapterNumber: lessonNumber,
      chapterLabel: flags["lesson-label"] || `Lesson ${lessonNumber}`,
    };
    validateCorpus(corpus);
  } else if (flags.chapter) {
    if (flags.epub) {
      ctx.log("both --chapter and --epub given — using --chapter (manual mode, no dedup/registry)");
    }
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from a --chapter source");
    }
    corpus = ctx.assembleCorpusFromChapter({
      chapterFilePath: flags.chapter,
      targetLanguage: flags.lang,
    });
  } else if (flags.epub) {
    if (!flags["chapter-number"]) {
      throw new Error("--chapter-number is required when assembling from --epub");
    }
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from an --epub source");
    }

    const chapterNumber = Number(flags["chapter-number"]);
    const { epubHash } = ctx.registerEpub(flags.epub);

    bookConventions = ctx.loadBookConventions(epubHash);
    if (!bookConventions) {
      ctx.log(
        `no cached book conventions for epub ${epubHash} — running a one-time whole-book analysis pass`,
      );
      bookConventions = ctx.analyzeBookConventions({
        epubPath: flags.epub,
        targetLanguage: flags.lang,
      });
      ctx.saveBookConventions(epubHash, bookConventions);
      ctx.log(`saved book conventions to the local library (epub ${epubHash})`);
    }

    // A resolved --lesson may span several spine files; extract the whole range as one
    // unit. Falls back to single-file extraction for a plain --chapter-number (or a
    // one-file lesson). Range content is cached under a distinct `<first>-<last>.xhtml`
    // path so it never clobbers the per-spine-file caches other passes rely on.
    const lesson = flags.resolvedLesson;
    const lastChapterNumber = lesson ? lesson.lastChapterNumber : chapterNumber;
    const chapterFilePath =
      lastChapterNumber > chapterNumber
        ? ctx.extractChapterRangeToFile(
            flags.epub,
            chapterNumber,
            lastChapterNumber,
            ctx.chapterRangeCachePath(epubHash, chapterNumber, lastChapterNumber),
            { log: ctx.log },
          )
        : ctx.extractChapterToFile(
            flags.epub,
            chapterNumber,
            ctx.chapterCachePath(epubHash, chapterNumber),
            { log: ctx.log },
          );

    corpus = ctx.assembleCorpusFromChapter({
      chapterFilePath,
      targetLanguage: flags.lang,
      bookConventions,
    });
    const chapterLabel = lesson ? lesson.label : ctx.describeChapter(flags.epub, chapterNumber);
    corpus.meta = { ...corpus.meta, epubHash, chapterNumber, chapterLabel };
    if (lastChapterNumber > chapterNumber) {
      corpus.meta.lastChapterNumber = lastChapterNumber;
    }

    const backward = ctx.dedupBackward(
      corpus.items,
      ctx.loadPriorChapterItems(epubHash, chapterNumber),
      {
        // Candidates here still carry editorial spaces / trailing 。 (display normalization runs
        // later), while the stored library is post-normalization — the dedup normalizes both sides.
        languageCode: resolveIso639Code(flags.lang),
      },
    );
    for (const { item, matchedField, matchedPriorItem } of backward.flagged) {
      ctx.log(
        `[dedup:backward] flagged "${item.english}" (id: ${item.id}) — already introduced in ` +
          `${matchedPriorItem.__chapterLabel} (matched on ${matchedField})`,
      );
    }

    const forward = ctx.flagForwardConcerns({
      candidateItems: backward.items,
      epubPath: flags.epub,
      // Check chapters AFTER this lesson's last spine file, so a multi-file lesson's own
      // later files aren't mistaken for "taught later" (for a single-file lesson this is
      // just chapterNumber).
      chapterNumber: lastChapterNumber,
      targetLanguage: flags.lang,
      bookConventions,
      log: ctx.log,
    });
    for (const { item, laterChapterLabel, reason } of forward.flagged) {
      const where = laterChapterLabel
        ? `explicitly taught later in ${laterChapterLabel}`
        : "flagged";
      ctx.log(`[flag:forward] "${item.english}" (id: ${item.id}) — ${where} (${reason})`);
    }

    corpus.items = forward.items;
    ctx.log(
      `dedup: ${corpus.items.length} item(s) total ` +
        `(${backward.flagged.length} flagged as already-taught, ${forward.flagged.length} flagged as possibly premature)`,
    );

    validateCorpus(corpus);
  } else if (flags.template) {
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from a --template source");
    }
    corpus = ctx.loadTemplate(flags.template, flags.lang);
  } else {
    throw new Error(
      `either --template <name>, --chapter <path>, --epub <path> --chapter-number <N>, or --words <path> --course <name> --lesson-number <N> is required. Available templates: ${listTemplates().join(", ")}`,
    );
  }

  // Pedagogical sort — a dependency-aware re-ordering so a learner meets vocabulary before the
  // sentences built from it (atoms → molecules), rather than the raw textbook order (which often
  // prints a Key Sentence before the words inside it). On by default for every source; --no-sort
  // opts out. Fail-open: any trouble leaves the extracted order untouched.
  if (!flags["no-sort"]) {
    const sortResult = ctx.sortItemsPedagogically({
      items: corpus.items,
      targetLanguage: flags.lang,
      bookConventions,
      log: ctx.log,
    });
    corpus.items = sortResult.items;
    ctx.log(
      sortResult.changed
        ? `pedagogical sort: reordered ${corpus.items.length} item(s) into a vocabulary-first learning sequence`
        : `pedagogical sort: extracted order left unchanged`,
    );
  }

  // For space-free scripts (e.g. Japanese), strip editorial spaces from the display text so the
  // corpus (and its review) renders as natural spaceless script — translate does the same on the
  // resulting cards. No-op for languages whose spaces are real word boundaries.
  const displayLang = resolveIso639Code(flags.lang);
  for (const item of corpus.items) {
    if (item.target) item.target = normalizeDisplayText(item.target, displayLang);
    if (item.reading) item.reading = normalizeDisplayText(item.reading, displayLang);
  }

  writeJson(paths.corpus, corpus);
  ctx.log(`wrote corpus with ${corpus.items.length} item(s) to ${paths.corpus}`);
}

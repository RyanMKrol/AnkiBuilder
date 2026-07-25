import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { writeFileAtomic, backupFileOnce } from "../util/atomicWrite.js";
import { withClaim, updateClaim } from "./runClaim.js";
import { basename, dirname, join, resolve } from "path";
import { Buffer } from "buffer";
import {
  runPaths as defaultRunPaths,
  libraryHome as defaultLibraryHome,
  validateCorpus,
} from "../model/index.js";
import { resolveIso639Code } from "../model/iso639.js";
import { listTemplates, loadTemplate as defaultLoadTemplate } from "../corpus/templates.js";
import { assembleCorpusFromChapter as defaultAssembleCorpusFromChapter } from "../corpus/epubLlmCorpus.js";
import { assembleCorpusFromLessonWords as defaultAssembleCorpusFromLessonWords } from "../corpus/lessonCorpus.js";
import {
  extractChapterToFile as defaultExtractChapterToFile,
  extractChapterRangeToFile as defaultExtractChapterRangeToFile,
  describeChapter as defaultDescribeChapter,
} from "../corpus/epubArchive.js";
import {
  listLessons as defaultListLessons,
  resolveLesson as defaultResolveLesson,
} from "../corpus/epubLessons.js";
import {
  registerEpub as defaultRegisterEpub,
  chapterCachePath as defaultChapterCachePath,
  chapterRangeCachePath as defaultChapterRangeCachePath,
  loadPriorChapterItems as defaultLoadPriorChapterItems,
  loadBookConventions as defaultLoadBookConventions,
  saveBookConventions as defaultSaveBookConventions,
  loadBookMeta as defaultLoadBookMeta,
} from "../corpus/epubLibrary.js";
import {
  resolveBookSlug as defaultResolveBookSlug,
  resolveChapterRunDir as defaultResolveChapterRunDir,
  resolveCourseSlug as defaultResolveCourseSlug,
  resolveLessonRunDir as defaultResolveLessonRunDir,
  lessonNumberInUse as defaultLessonNumberInUse,
  nextLessonNumber as defaultNextLessonNumber,
  resolveTemplateRunDir as defaultResolveTemplateRunDir,
  loadCourseMeta as defaultLoadCourseMeta,
  materializeBookInOutput as defaultMaterializeBookInOutput,
  resolveBookEpubPath as defaultResolveBookEpubPath,
} from "./outputPaths.js";
import { dedupBackward as defaultDedupBackward } from "../corpus/epubDedup.js";
import { flagForwardConcerns as defaultFlagForwardConcerns } from "../corpus/epubForwardFlags.js";
import { sortItemsPedagogically as defaultSortItemsPedagogically } from "../corpus/pedagogicalSort.js";
import { normalizeDisplayText } from "../model/scriptSpacing.js";
import { analyzeBookConventions as defaultAnalyzeBookConventions } from "../corpus/epubBookConventions.js";
import { translateCorpus as defaultTranslateCorpus } from "../translate/index.js";
import { mineFillInBlankCards as defaultMineFillInBlankCards } from "../cards/fillInBlank.js";
import { dedupeByPattern as defaultDedupeByPattern } from "../cards/semanticDedup.js";
import {
  enhanceRunDirNotes as defaultEnhanceRunDirNotes,
  lessonSiblings as defaultLessonSiblings,
} from "../cards/crossLessonNotes.js";
import { generateAudio as defaultGenerateAudio } from "../audio/index.js";
import { getDefaultVoice as defaultGetDefaultVoice } from "../audio/voiceLibrary.js";
import { getAltAudioTransform as defaultGetAltAudioTransform } from "../audio/altAudio.js";
import { TTS_MODEL } from "../audio/ttsModel.js";
import { fetchElevenLabsTts as defaultFetchTts } from "../audio/elevenLabsTts.js";
import {
  buildDeck as defaultBuildDeck,
  buildBookDeck as defaultBuildBookDeck,
} from "../deck/index.js";
import { rebuildBookDir as defaultRebuildBookDir } from "../deck/rebuild.js";
import {
  getLanguageFont as defaultGetLanguageFont,
  readFontBytes as defaultReadFontBytes,
} from "../deck/fontLibrary.js";
import { restyleApkgBuffer as defaultRestyleApkgBuffer } from "../deck/restyleFont.js";
import { renderDeckViewPage as defaultRenderDeckViewPage } from "../review/renderDeckViewPage.js";
import { readApkg as defaultReadApkg } from "../deck/readApkg.js";
import { startDeckServer as defaultStartDeckServer } from "../server/index.js";

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    }
  }
  return flags;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, obj) {
  writeFileAtomic(path, JSON.stringify(obj, null, 2));
}

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

async function runAssemble(flags, ctx) {
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
      return;
    }
    for (const lesson of lessons) {
      const range =
        lesson.lastChapterNumber > lesson.firstChapterNumber
          ? `${lesson.firstChapterNumber}-${lesson.lastChapterNumber}`
          : `${lesson.firstChapterNumber}`;
      ctx.log(`[${lesson.number}] (${lesson.type}) spine ${range}: ${lesson.label}`);
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
          )
        : ctx.extractChapterToFile(
            flags.epub,
            chapterNumber,
            ctx.chapterCachePath(epubHash, chapterNumber),
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

async function runTranslate(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "translate" }, () => runTranslateInner(flags, ctx));
}

async function runTranslateInner(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (existsSync(paths.cards)) {
    ctx.log(`cards.json already exists at ${paths.cards} — reusing`);
    return;
  }

  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
  }

  const corpus = readJson(paths.corpus);

  // No review gate here: translation runs right after assemble so the FIRST human review (the combined
  // Corpus review in the dashboard) can show English + target + pronunciation together. The review gate
  // moved one step later — `audio` refuses to run until that Corpus review is signed off (see runAudio).

  // `--simple-script` asks the language plug-in (src/translate/targetScript.js) to constrain the
  // generated target to the language's beginner/learner script (e.g. Japanese → kana only). No-op for
  // a language with no such rule.
  const { cards, errors } = await ctx.translateCorpus(corpus, {
    simpleScript: !!flags["simple-script"],
  });

  writeJson(paths.cards, cards);
  ctx.log(`translated ${cards.items.length} item(s) to ${paths.cards}`);
  // Translation alone does NOT make a lesson reviewable — the drill, de-dup and cross-reference
  // passes all still have to run, and the dashboard holds the lesson back until they have. Say so
  // here rather than leaving someone to wonder why the review offers no sign-off button.
  if (!flags.__fromPrepare) {
    ctx.log(
      `translate: this lesson is NOT reviewable yet — run "prepare --run ${flags.run}" to finish it ` +
        `(prepare runs translate itself, so it is the normal way in).`,
    );
  }
  if (errors.length > 0) {
    ctx.log(`${errors.length} item(s) failed to translate: ${errors.map((e) => e.id).join(", ")}`);
  }
}

const FIB_BACKUP_SUFFIX = ".pre-fib.bak";

/**
 * Where a run directory sits among its book's other lessons, and whether the passes that read those
 * lessons can actually see what they need.
 *
 * This is a status, not just a vocabulary string, because "no earlier lessons" has two completely
 * different meanings and they used to collapse into one. Lesson 1 of a book genuinely has no
 * predecessors. Lesson 8 whose earlier lessons stopped at `corpus.json` has seven — it just can't
 * see them. Both used to read as "first", so lesson 8 was silently built as though it opened the
 * book, and the enrichment markers then froze that in.
 *
 *   `unknown`  — can't place this lesson at all (no readable deck dir, no usable chapter number).
 *                A bare `--run`, a template, a first-ever chapter whose book dir doesn't exist yet.
 *   `first`    — genuinely the first lesson: no siblings other than this one.
 *   `ok`       — every earlier sibling is prepared and readable.
 *   `degraded` — earlier siblings exist but have no cards.json, so they are invisible to the passes.
 *
 * `vocab` is the drill pass's allowed-vocabulary grounding, built from the earlier lessons that ARE
 * readable; `unreviewed` is what the assemble-time ordering warning reports on.
 */
function lessonOrderContext({ deckDir, unitName, ownNumber, ctx }) {
  let siblings;
  try {
    siblings = ctx.lessonSiblings(deckDir);
  } catch {
    return { status: "unknown", earlier: [], missing: [], unreviewed: [], vocab: null };
  }

  const others = siblings.filter((unit) => unit.name !== unitName);
  if (others.length === 0) {
    return { status: "first", earlier: [], missing: [], unreviewed: [], vocab: null };
  }
  if (!Number.isFinite(ownNumber)) {
    return { status: "unknown", earlier: [], missing: [], unreviewed: [], vocab: null };
  }

  const earlier = others.filter((unit) => unit.number < ownNumber);
  const missing = earlier.filter((unit) => !unit.hasCards);
  // `data` is belt-and-braces: lessonSiblings always sets it alongside hasCards, but a unit that
  // somehow arrives without it must be treated as unreadable rather than crash a different lesson.
  const readable = earlier.filter((unit) => unit.hasCards && unit.data);
  const unreviewed = earlier.filter((unit) => !unit.reviewed);

  const status = missing.length > 0 ? "degraded" : earlier.length > 0 ? "ok" : "first";
  const vocab = readable.length
    ? readable
        .map((unit) => {
          const lines = unit.data.items
            .filter((item) => !item.excluded)
            .map((item) => `- ${item.english} — ${item.target}`)
            .join("\n");
          return `### ${unit.label}\n\n${lines}`;
        })
        .join("\n\n")
    : null;

  return { status, earlier, missing, unreviewed, vocab };
}

/**
 * The breadcrumb left on a lesson whose enrichment ran without everything it needed. Its presence is
 * what tells a later `prepare` that the un-set markers are deliberate — and what lets that run drop
 * the previous, thinner drill block instead of appending a second one on top of it.
 */
function degradedMarker(order) {
  return {
    at: new Date().toISOString(),
    reason: order.status,
    missing: order.missing.map((unit) => unit.name),
  };
}

/** `lessonOrderContext` for a run directory: the unit is the folder, the deck its parent. */
function runDirOrderContext(runDir, ownNumber, ctx) {
  const absolute = resolve(runDir);
  return lessonOrderContext({
    deckDir: dirname(absolute),
    unitName: basename(absolute),
    ownNumber,
    ctx,
  });
}

/**
 * `prepare` — EVERYTHING between assemble and the first human review, as one stage:
 * translate → fill-in-the-blank enrichment → semantic de-dup → cross-lesson notes.
 *
 * This exists so a lesson has no resting state between "assembled" and "reviewable". Those four
 * steps all change what the reviewer will sign off on, so a lesson that stops partway through them
 * is a half-built lesson, not a pipeline stage — and the dashboard says so rather than offering it
 * for review. The claim is held across the whole span (its `stage` field naming the current step) and
 * deliberately NOT cleared on failure, so a crash mid-prepare surfaces as "interrupted" instead of
 * looking finished.
 *
 * Every step is idempotent and fails open, so re-running `prepare` on a partly-prepared lesson picks
 * up where it stopped. A lesson already marked reviewed is left completely alone — growing or
 * rewriting a card set someone has signed off on is the one thing this stage must never do.
 */
async function runPrepare(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "prepare" }, () => runPrepareInner(flags, ctx), {
    clearOnFailure: false,
  });
}

async function runPrepareInner(flags, ctx) {
  const runDir = flags.run;
  const paths = ctx.runPaths(runDir);

  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
  }

  updateClaim(runDir, { stage: "translate" });
  await runTranslateInner({ ...flags, __fromPrepare: true }, ctx);

  const cards = readJson(paths.cards);
  const meta = cards.meta || {};

  if (meta.reviewed === true) {
    ctx.log(
      "prepare: this lesson is already marked reviewed — skipping enrichment and notes " +
        "(they would change cards that have been signed off)",
    );
    return;
  }

  const targetLanguage = meta.targetLanguage;
  // A template is a fixed vocabulary list: there are no drills to mine and no sibling lessons to
  // cross-reference, so both enrichment and the note pass are no-ops for it by design.
  const isTemplate = meta.sourceType === "template";

  // Both remaining passes read this lesson's EARLIER siblings, so their result is only as complete
  // as what those siblings have already written. Worked out once, up front, and used to decide both
  // what to tell the operator and whether the result is worth marking done.
  const order = isTemplate
    ? { status: "unknown", earlier: [], missing: [], unreviewed: [], vocab: null }
    : runDirOrderContext(runDir, meta.chapterNumber, ctx);
  const complete = order.status === "ok" || order.status === "first";

  if (!isTemplate) {
    if (order.status === "degraded") {
      ctx.log(
        `prepare: WARNING — ${order.missing.length} earlier lesson(s) of this book have no cards.json yet ` +
          `(${order.missing.map((u) => u.name).join(", ")}). The fill-in-the-blank and cross-lesson-note ` +
          `passes only see PREPARED lessons, so this lesson is being built as if those did not exist. ` +
          `Finish them first, then re-run "prepare --run ${runDir}" — both passes are deliberately left ` +
          `un-marked so the re-run redoes them.`,
      );
    } else if (order.status === "unknown") {
      ctx.log(
        `prepare: could not place this lesson among its siblings — treating it as standalone. The ` +
          `enrichment markers are left unset so a later run can redo the passes.`,
      );
    } else if (order.status === "first") {
      ctx.log("prepare: no earlier lessons — building this as the first lesson of the book.");
    } else {
      ctx.log(
        `prepare: ${order.earlier.length} earlier lesson(s) fed to the drill and note passes as context.`,
      );
    }
  }

  if (!isTemplate && meta.enriched !== true) {
    updateClaim(runDir, { stage: "fill-in-the-blank" });

    // Reaching here means this lesson has no `enriched` marker, so the pass is about to run — and
    // mining APPENDS. Any practice cards already present therefore came from a run that never got
    // marked: a degraded one, or a lesson built before the marker existed at all. Drop them rather
    // than stack a second block on top. Precise and safe: only AI-authored practice cards carry
    // `fillInBlank`, and this whole branch is already skipped for a lesson someone has signed off.
    const stale = cards.items.filter((item) => item.fillInBlank).length;
    if (stale > 0) {
      cards.items = cards.items.filter((item) => !item.fillInBlank);
      ctx.log(
        `fill-in-the-blank: dropped ${stale} unmarked practice card(s) from an earlier run — ` +
          `re-mining so the lesson ends up with exactly one drill block`,
      );
    }

    // The source document to mine drills from, for an --epub lesson. A dictated (--words) lesson has
    // none, and composes its drills from the lesson's own patterns instead.
    let chapterFilePath = null;
    if (meta.epubHash && typeof meta.chapterNumber === "number") {
      chapterFilePath =
        typeof meta.lastChapterNumber === "number" && meta.lastChapterNumber > meta.chapterNumber
          ? ctx.chapterRangeCachePath(meta.epubHash, meta.chapterNumber, meta.lastChapterNumber)
          : ctx.chapterCachePath(meta.epubHash, meta.chapterNumber);
    }

    const mined = ctx.mineFillInBlankCards({
      items: cards.items,
      targetLanguage,
      chapterFilePath,
      earlierVocab: order.vocab,
      log: ctx.log,
    });

    if (mined.added.length > 0) {
      cards.items = mined.items;
      ctx.log(`fill-in-the-blank: added ${mined.added.length} practice card(s)`);

      updateClaim(runDir, { stage: "semantic-dedup" });
      const deduped = ctx.dedupeByPattern({
        items: cards.items,
        targetLanguage,
        patterns: mined.patterns,
        log: ctx.log,
      });
      cards.items = deduped.items;
      for (const { id, reason } of deduped.excluded) {
        ctx.log(
          `[dedup:semantic] excluded "${id}" — ${reason || "repeats a pattern the lesson covers"}`,
        );
      }
      ctx.log(
        `semantic de-dup: ${deduped.excluded.length} of ${mined.added.length} practice card(s) excluded as pattern repeats`,
      );

      backupFileOnce(paths.cards, FIB_BACKUP_SUFFIX);
    }

    // The marker means "this pass ran with everything it needed", NOT "this pass ran". Marked even
    // when nothing was mined — a lesson whose source has no usable drills has still been through the
    // pass, and re-running would just re-spend the model call. But NOT marked when the pass was
    // flying blind, or a degraded result would be frozen in and no re-run could ever repair it.
    cards.meta = complete
      ? { ...meta, enriched: true, prepareDegraded: undefined }
      : { ...meta, prepareDegraded: degradedMarker(order) };
    if (cards.meta.prepareDegraded === undefined) delete cards.meta.prepareDegraded;
    writeJson(paths.cards, cards);
  }

  if (!isTemplate && meta.notesEnhanced !== true) {
    updateClaim(runDir, { stage: "cross-lesson-notes" });
    const { changed, skipped } = ctx.enhanceRunDirNotes({
      runDir,
      targetLanguage,
      log: ctx.log,
    });
    if (skipped) {
      ctx.log(`cross-lesson notes: skipped — ${skipped}`);
    } else {
      ctx.log(`cross-lesson notes: wrote ${changed} note(s) for this lesson`);
    }
    // Re-read: the note pass rewrites cards.json itself, so the in-memory copy is stale.
    const fresh = readJson(paths.cards);
    fresh.meta = complete
      ? { ...fresh.meta, notesEnhanced: true }
      : { ...fresh.meta, prepareDegraded: degradedMarker(order) };
    writeJson(paths.cards, fresh);
  }

  ctx.log(
    `prepare: ${runDir} is ready for the corpus review — open the dashboard ("npm run serve") and sign it off`,
  );
}

async function runAudio(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "audio" }, () => runAudioInner(flags, ctx));
}

async function runAudioInner(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (!existsSync(paths.cards)) {
    throw new Error(`cards.json not found at ${paths.cards} — run "translate" first`);
  }

  const cards = readJson(paths.cards);

  if (cards.meta.reviewed !== true) {
    throw new Error(
      `cards.json at ${paths.cards} has not been reviewed yet — open the dashboard ("npm run serve"), review this lesson's corpus (English + target + pronunciation), and click "Mark reviewed" before generating audio`,
    );
  }

  // Only the DEFAULT (kana+。 for Japanese) clip is generated up front — every other variant is an
  // on-demand dashboard action. A run counts as "already done" once every card's default clip is on
  // disk (regeneration stays cheap: generateAudio only fetches cache misses).
  // Excluded cards get no audio (generateAudio skips them), so only the ACTIVE cards gate "done".
  const active = cards.items.filter((item) => !item.excluded);
  const alreadyDone =
    active.length > 0 &&
    active.every((item) => item.audio && existsSync(join(paths.audio, item.audio)));

  if (alreadyDone) {
    ctx.log(`audio already generated in ${paths.audio} — reusing`);
    return;
  }

  let voiceId = flags.voice;
  if (!voiceId) {
    const languageCode = resolveIso639Code(cards.meta.targetLanguage);
    voiceId = languageCode ? ctx.getDefaultVoice(languageCode) : undefined;
    if (voiceId) {
      ctx.log(
        `no --voice given — using the configured default for ${cards.meta.targetLanguage}: ${voiceId}`,
      );
    } else {
      throw new Error("--voice <voiceId> is required for the audio stage");
    }
  }

  const annotated = await ctx.generateAudio(cards, {
    voiceId,
    fetchTts: ctx.fetchTts,
    libraryHomeDir: ctx.libraryHome(),
    // The default (kana+。) take still uses the alt-audio transform; there's no separate alt pass.
    getAltTransform: ctx.getAltAudioTransform,
  });

  mkdirSync(paths.audio, { recursive: true });
  // Must match generateAudio's model-segmented cache path (audio/<voiceId>/<model>/).
  const cacheDir = join(ctx.libraryHome(), "audio", voiceId, TTS_MODEL);
  // Copy each card's default clip from the cache into the run's audio/ dir; the deck build reads
  // files from there. Other variants are generated on demand in the dashboard, not copied here.
  for (const item of annotated.items) {
    if (!item.audio) continue;
    const dest = join(paths.audio, item.audio);
    if (!existsSync(dest)) {
      copyFileSync(join(cacheDir, item.audio), dest);
    }
  }

  // Merge, don't overwrite. `cards` was read minutes ago, before the ElevenLabs pass; the
  // dashboard is editable during exactly that window (a lesson at the translate stage), so
  // writing the stale in-memory object back would silently discard any exclude, inline edit
  // or Replace-audio the reviewer did while this ran. Re-read and apply only what this stage
  // owns: each item's `audio` filename.
  const fresh = readJson(paths.cards);
  const generated = new Map(annotated.items.map((item) => [item.id, item.audio ?? null]));
  for (const item of fresh.items) {
    if (generated.has(item.id)) item.audio = generated.get(item.id);
  }
  writeJson(paths.cards, fresh);
  ctx.log(`generated audio for ${annotated.items.length} item(s) into ${paths.audio}`);
}

async function runBookDeck(flags, ctx) {
  const bookDir = resolve(flags["book-dir"]);
  // Assembly + merge live in src/deck/rebuild.js (shared with the dashboard's Rebuild action). This
  // always rebuilds fresh — any upstream chapter change would otherwise leave a stale merged package.
  const result = await ctx.rebuildBookDir(bookDir, {
    buildBookDeck: ctx.buildBookDeck,
    loadBookMeta: ctx.loadBookMeta,
    loadCourseMeta: ctx.loadCourseMeta,
    bookNameFallback: flags.name || null,
  });

  ctx.log(
    `built book deck with ${result.noteCount} note(s) across ${result.chapterCount} chapter(s) at ${join(bookDir, "deck.apkg")}`,
  );
}

async function runDeck(flags, ctx) {
  if (flags["book-dir"]) {
    return runBookDeck(flags, ctx);
  }

  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "deck" }, () => runDeckInner(flags, ctx));
}

async function runDeckInner(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (existsSync(paths.deck)) {
    ctx.log(`deck.apkg already exists at ${paths.deck} — reusing`);
    return;
  }

  if (!existsSync(paths.cards)) {
    throw new Error(`cards.json not found at ${paths.cards} — run "translate"/"audio" first`);
  }

  const cards = readJson(paths.cards);
  const result = ctx.buildDeck(cards, {
    outPath: paths.deck,
    audioDir: existsSync(paths.audio) ? paths.audio : null,
    deckName: flags.name || null,
  });

  ctx.log(
    `built deck with ${result.noteCount} note(s), ${result.mediaCount} media file(s) at ${paths.deck}`,
  );
}

// Applies a language's configured deck font (src/deck/fontLibrary.js) to ANY .apkg — including
// third-party decks not built here — embedding the font and pointing every note type at it.
async function runRestyleFont(flags, ctx) {
  if (!flags.apkg) {
    throw new Error("--apkg <path.apkg> is required");
  }
  if (!flags.lang) {
    throw new Error("--lang <code> is required (e.g. ja)");
  }

  const languageCode = resolveIso639Code(flags.lang) || flags.lang;
  const descriptor = ctx.getLanguageFont(languageCode);
  if (!descriptor) {
    throw new Error(`no deck font is configured for language "${flags.lang}"`);
  }

  const inputPath = resolve(flags.apkg);
  if (!existsSync(inputPath)) {
    throw new Error(`input .apkg not found: ${inputPath}`);
  }
  const outPath = flags.out
    ? resolve(flags.out)
    : `${inputPath.replace(/\.apkg$/i, "")}.${descriptor.family.replace(/\s+/g, "")}.apkg`;

  const freshNoteType = Boolean(flags["fresh-notetype"]);
  const outBuffer = ctx.restyleApkgBuffer(
    readFileSync(inputPath),
    descriptor,
    ctx.readFontBytes(descriptor),
    { freshNoteType },
  );
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, outBuffer);
  ctx.log(
    `restyled ${inputPath} in ${descriptor.family}${freshNoteType ? " (fresh note type)" : ""} — wrote ${outPath}`,
  );
}

// Browse a built `.apkg` as a read-only Claude Artifact: every card grouped by sub-deck, each with
// its embedded audio clip inline. Splits a large deck into parts so no single HTML page blows past
// the Artifact size limit; card numbering runs globally across the parts.
async function runViewDeck(flags, ctx) {
  if (!flags.apkg) {
    throw new Error("--apkg <file> is required");
  }
  const apkgPath = resolve(flags.apkg);
  if (!existsSync(apkgPath)) {
    throw new Error(`.apkg not found at ${apkgPath}`);
  }
  const deck = ctx.readApkg(apkgPath);

  // Embed the Japanese deck font so kana/kanji render the same everywhere; harmless for other
  // scripts (it only carries JP glyphs, so Latin text falls through to the page's own stack).
  const fontDesc = ctx.getLanguageFont("ja");
  const fontBase64 = fontDesc ? Buffer.from(ctx.readFontBytes(fontDesc)).toString("base64") : null;

  // Pack sub-decks (splitting one if needed) into parts under a raw-audio budget sized so each
  // rendered page stays under ~14 MB (comfortably below the ~16 MB Artifact limit). base64 inflates
  // bytes ~4/3, and the embedded font is a fixed per-part cost, so the audio budget is what's left of
  // the cap after the font and page overhead, converted back to raw bytes.
  const OUTPUT_CAP = 14 * 1024 * 1024;
  const perPartOverhead = (fontBase64 ? fontBase64.length : 0) + 200 * 1024;
  const BUDGET = Math.max(1024 * 1024, Math.floor(((OUTPUT_CAP - perPartOverhead) * 3) / 4));
  const parts = [];
  let cur = { sections: [], bytes: 0 };
  let frag = null;
  const closeFrag = () => {
    if (frag && frag.cards.length) cur.sections.push(frag);
    frag = null;
  };
  const pushPart = () => {
    closeFrag();
    if (cur.sections.length) parts.push(cur);
    cur = { sections: [], bytes: 0 };
  };
  for (const section of deck.sections) {
    closeFrag();
    // Keep a whole sub-deck together when it fits in one part: if it won't fit in what's left of the
    // current part but would fit in a fresh one, start a new part before it (rather than orphaning a
    // few of its cards). A sub-deck bigger than a whole part still splits mid-way, below.
    const sectionBytes = section.cards.reduce(
      (s, c) => s + (c.audioData ? c.audioData.length : 0),
      0,
    );
    if (cur.bytes > 0 && cur.bytes + sectionBytes > BUDGET && sectionBytes <= BUDGET) {
      pushPart();
    }
    frag = { leaf: section.leaf, cards: [] };
    for (const card of section.cards) {
      const size = card.audioData ? card.audioData.length : 0;
      if (cur.bytes + size > BUDGET && cur.bytes > 0) {
        pushPart();
        frag = { leaf: `${section.leaf} (cont.)`, cards: [] };
      }
      frag.cards.push(card);
      cur.bytes += size;
    }
  }
  pushPart();
  if (parts.length === 0) parts.push({ sections: [], bytes: 0 });

  const apkgBase = apkgPath.replace(/\.apkg$/i, "");
  const outBase = flags.out ? resolve(flags.out) : `${apkgBase}-view.html`;
  const n = parts.length;
  let startNumber = 1;
  for (let i = 0; i < n; i++) {
    const html = ctx.renderDeckViewPage({
      title: deck.title,
      sections: parts[i].sections,
      startNumber,
      fontBase64,
      partLabel: n > 1 ? `Part ${i + 1} of ${n}` : null,
    });
    const outPath = n === 1 ? outBase : outBase.replace(/\.html$/i, `-part${i + 1}.html`);
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, html);
    startNumber += parts[i].sections.reduce((sum, s) => sum + s.cards.length, 0);
    ctx.log(`wrote deck view to ${outPath}`);
  }
  ctx.log(
    `deck view: ${deck.totalCards} card(s) across ${deck.sections.length} sub-deck(s), ${n} part(s)`,
  );
}

// Starts the local deck-dashboard web server: a browsable index of every built deck, each opening to a
// page of collapsible lessons with audio streamed over HTTP (no Artifact size cap, unlike view-deck).
// Long-running — the listening server keeps the process alive until Ctrl+C.
async function runServe(flags, ctx) {
  const outputRoot = flags["output-root"] ? resolve(flags["output-root"]) : resolve("output");
  const port = flags.port ? Number(flags.port) : 4321;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be a valid port number (got ${JSON.stringify(flags.port)})`);
  }
  // Load .env if present so the Generate button's ElevenLabs key is available even when the server is
  // launched via `node`/`npm run serve` (which don't apply bin.js's shebang --env-file loader).
  try {
    process.loadEnvFile?.(resolve(".env"));
  } catch {
    // no .env — Generate will report the missing key if used
  }
  const editable = !flags["read-only"];
  const { url } = await ctx.startDeckServer({
    port,
    outputRoot,
    editable,
    voice: flags.voice || null,
  });
  // Keep the URL as the LAST, most prominent thing printed — it's the one thing you need.
  ctx.log(
    `Serving decks from ${outputRoot}${editable ? "" : " (read-only)"}. Press Ctrl+C to stop.`,
  );
  const line = `  Dashboard  →  ${url}  `;
  const bar = "─".repeat(line.length);
  ctx.log("");
  ctx.log(`┌${bar}┐`);
  ctx.log(`│${line}│`);
  ctx.log(`└${bar}┘`);
  ctx.log("");
}

const COMMANDS = {
  assemble: runAssemble,
  prepare: runPrepare,
  translate: runTranslate,
  audio: runAudio,
  deck: runDeck,
  "restyle-font": runRestyleFont,
  "view-deck": runViewDeck,
  serve: runServe,
};

export async function runCli(argv, deps = {}) {
  const {
    runPaths = defaultRunPaths,
    libraryHome = defaultLibraryHome,
    loadTemplate = defaultLoadTemplate,
    resolveBookSlug = defaultResolveBookSlug,
    resolveChapterRunDir = defaultResolveChapterRunDir,
    resolveCourseSlug = defaultResolveCourseSlug,
    resolveLessonRunDir = defaultResolveLessonRunDir,
    lessonNumberInUse = defaultLessonNumberInUse,
    nextLessonNumber = defaultNextLessonNumber,
    resolveTemplateRunDir = defaultResolveTemplateRunDir,
    loadCourseMeta = defaultLoadCourseMeta,
    materializeBookInOutput = defaultMaterializeBookInOutput,
    resolveBookEpubPath = defaultResolveBookEpubPath,
    assembleCorpusFromChapter = defaultAssembleCorpusFromChapter,
    assembleCorpusFromLessonWords = defaultAssembleCorpusFromLessonWords,
    extractChapterToFile = defaultExtractChapterToFile,
    extractChapterRangeToFile = defaultExtractChapterRangeToFile,
    describeChapter = defaultDescribeChapter,
    listLessons = defaultListLessons,
    resolveLesson = defaultResolveLesson,
    registerEpub = defaultRegisterEpub,
    chapterCachePath = defaultChapterCachePath,
    chapterRangeCachePath = defaultChapterRangeCachePath,
    loadPriorChapterItems = defaultLoadPriorChapterItems,
    loadBookConventions = defaultLoadBookConventions,
    saveBookConventions = defaultSaveBookConventions,
    loadBookMeta = defaultLoadBookMeta,
    analyzeBookConventions = defaultAnalyzeBookConventions,
    dedupBackward = defaultDedupBackward,
    flagForwardConcerns = defaultFlagForwardConcerns,
    sortItemsPedagogically = defaultSortItemsPedagogically,
    translateCorpus = defaultTranslateCorpus,
    mineFillInBlankCards = defaultMineFillInBlankCards,
    dedupeByPattern = defaultDedupeByPattern,
    enhanceRunDirNotes = defaultEnhanceRunDirNotes,
    lessonSiblings = defaultLessonSiblings,
    generateAudio = defaultGenerateAudio,
    getDefaultVoice = defaultGetDefaultVoice,
    getAltAudioTransform = defaultGetAltAudioTransform,
    buildDeck = defaultBuildDeck,
    buildBookDeck = defaultBuildBookDeck,
    rebuildBookDir = defaultRebuildBookDir,
    getLanguageFont = defaultGetLanguageFont,
    readFontBytes = defaultReadFontBytes,
    restyleApkgBuffer = defaultRestyleApkgBuffer,
    fetchTts = defaultFetchTts,
    renderDeckViewPage = defaultRenderDeckViewPage,
    readApkg = defaultReadApkg,
    startDeckServer = defaultStartDeckServer,
    log = console.log,
  } = deps;

  const [command, ...rest] = argv;
  const handler = COMMANDS[command];

  if (!handler) {
    throw new Error(
      `Unknown command: ${command ?? "(none)"}. Available commands: ${Object.keys(COMMANDS).join(", ")}`,
    );
  }

  const flags = parseFlags(rest);

  const ctx = {
    runPaths,
    libraryHome,
    loadTemplate,
    resolveBookSlug,
    resolveChapterRunDir,
    resolveCourseSlug,
    resolveLessonRunDir,
    lessonNumberInUse,
    nextLessonNumber,
    resolveTemplateRunDir,
    loadCourseMeta,
    materializeBookInOutput,
    resolveBookEpubPath,
    assembleCorpusFromChapter,
    assembleCorpusFromLessonWords,
    extractChapterToFile,
    extractChapterRangeToFile,
    describeChapter,
    listLessons,
    resolveLesson,
    registerEpub,
    chapterCachePath,
    chapterRangeCachePath,
    loadPriorChapterItems,
    loadBookConventions,
    saveBookConventions,
    loadBookMeta,
    analyzeBookConventions,
    dedupBackward,
    flagForwardConcerns,
    sortItemsPedagogically,
    translateCorpus,
    mineFillInBlankCards,
    dedupeByPattern,
    enhanceRunDirNotes,
    lessonSiblings,
    generateAudio,
    getDefaultVoice,
    getAltAudioTransform,
    buildDeck,
    buildBookDeck,
    rebuildBookDir,
    getLanguageFont,
    readFontBytes,
    restyleApkgBuffer,
    fetchTts,
    renderDeckViewPage,
    readApkg,
    startDeckServer,
    log,
  };

  await handler(flags, ctx);
}

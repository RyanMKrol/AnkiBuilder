import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parseEnv } from "util";
import { dirname, join, resolve } from "path";
import { runPaths as defaultRunPaths, libraryHome as defaultLibraryHome } from "../model/index.js";
import { loadTemplate as defaultLoadTemplate } from "../corpus/templates.js";
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
  buildShapeReport as defaultBuildShapeReport,
  formatShapeReport as defaultFormatShapeReport,
} from "../corpus/epubShapeReport.js";
import {
  registerEpub as defaultRegisterEpub,
  hashEpubFile as defaultHashEpubFile,
  resolveLabelDecoding as defaultResolveLabelDecoding,
  describeBookCache as defaultDescribeBookCache,
  clearBookCache as defaultClearBookCache,
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
import { analyzeBookConventions as defaultAnalyzeBookConventions } from "../corpus/epubBookConventions.js";
import { translateCorpus as defaultTranslateCorpus } from "../translate/index.js";
import { mineFillInBlankCards as defaultMineFillInBlankCards } from "../cards/fillInBlank.js";
import { dedupeByPattern as defaultDedupeByPattern } from "../cards/semanticDedup.js";
import { fillNumberReadings as defaultFillNumberReadings } from "../cards/numberReadings.js";
import {
  enhanceRunDirNotes as defaultEnhanceRunDirNotes,
  lessonSiblings as defaultLessonSiblings,
} from "../cards/crossLessonNotes.js";
import { generateAudio as defaultGenerateAudio } from "../audio/index.js";
import { getDefaultVoice as defaultGetDefaultVoice } from "../audio/voiceLibrary.js";
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
import { runAssemble } from "./commands/assemble.js";
import { runPrepare } from "./commands/prepare.js";
import { runTranslate } from "./commands/translate.js";
import { runAudio } from "./commands/audio.js";
import { runDeck } from "./commands/deck.js";
import { runRestyleFont } from "./commands/restyleFont.js";
import { runViewDeck } from "./commands/viewDeck.js";
import { runServe } from "./commands/serve.js";
import { runEpub } from "./commands/epub.js";

const CLI_MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(CLI_MODULE_DIR, "..", "..");

// Loads the package root's .env for EVERY command, never overriding variables already set in the
// environment. The bin.js shebang's `--env-file-if-exists=.env` resolves against the CWD, so
// running the CLI from any other directory silently lost the ElevenLabs key (and `npm run serve`
// needed its own ad-hoc loader).
function loadRootEnv() {
  const envPath = join(PACKAGE_ROOT, ".env");
  if (!existsSync(envPath)) return;
  try {
    const parsed = parseEnv(readFileSync(envPath, "utf-8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Malformed .env — leave the environment as-is; a missing key reports at its point of use.
  }
}

function parseFlags(args) {
  // Bare arguments land in `_` (only the `epub` subcommand reads them today). An argument
  // consumed as a preceding flag's value is never a positional, so this cannot change how any
  // existing command parses.
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
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
  epub: runEpub,
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
    buildShapeReport = defaultBuildShapeReport,
    formatShapeReport = defaultFormatShapeReport,
    registerEpub = defaultRegisterEpub,
    hashEpubFile = defaultHashEpubFile,
    resolveLabelDecoding = defaultResolveLabelDecoding,
    describeBookCache = defaultDescribeBookCache,
    clearBookCache = defaultClearBookCache,
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
    fillNumberReadings = defaultFillNumberReadings,
    lessonSiblings = defaultLessonSiblings,
    generateAudio = defaultGenerateAudio,
    getDefaultVoice = defaultGetDefaultVoice,
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

  // Every command gets the root .env (audio needs the ElevenLabs key, serve's Generate button
  // too) — resolved against the package, not the CWD.
  loadRootEnv();

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
    buildShapeReport,
    formatShapeReport,
    registerEpub,
    hashEpubFile,
    resolveLabelDecoding,
    describeBookCache,
    clearBookCache,
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
    fillNumberReadings,
    lessonSiblings,
    generateAudio,
    getDefaultVoice,
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

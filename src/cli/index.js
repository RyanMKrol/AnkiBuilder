import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
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
  saveChapterCorpus as defaultSaveChapterCorpus,
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
  resolveTemplateRunDir as defaultResolveTemplateRunDir,
  loadCourseMeta as defaultLoadCourseMeta,
  materializeBookInOutput as defaultMaterializeBookInOutput,
  resolveBookEpubPath as defaultResolveBookEpubPath,
} from "./outputPaths.js";
import { dedupBackward as defaultDedupBackward } from "../corpus/epubDedup.js";
import { flagForwardConcerns as defaultFlagForwardConcerns } from "../corpus/epubForwardFlags.js";
import { analyzeBookConventions as defaultAnalyzeBookConventions } from "../corpus/epubBookConventions.js";
import { translateCorpus as defaultTranslateCorpus } from "../translate/index.js";
import { generateAudio as defaultGenerateAudio } from "../audio/index.js";
import { getDefaultVoice as defaultGetDefaultVoice } from "../audio/voiceLibrary.js";
import {
  buildDeck as defaultBuildDeck,
  buildBookDeck as defaultBuildBookDeck,
} from "../deck/index.js";
import { defaultPromptReviewDecisions } from "./reviewPrompt.js";
import { renderCorpusReviewPage as defaultRenderCorpusReviewPage } from "../review/renderCorpusReviewPage.js";
import { renderTranslateReviewPage as defaultRenderTranslateReviewPage } from "../review/renderTranslateReviewPage.js";
import { renderAudioReviewPage as defaultRenderAudioReviewPage } from "../review/renderAudioReviewPage.js";

const REVIEW_STAGES = ["corpus", "translate", "audio"];

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

// languageCode is only ever a real ISO 639-1 code or null (see resolveIso639Code,
// src/model/iso639.js) — omitted from the request body entirely when null, rather than
// sent as an empty/invalid value, so ElevenLabs falls back to its own language
// auto-detection exactly as it did before this parameter existed.
async function defaultFetchTts(text, voiceId, apiKey, languageCode = null) {
  const response = await globalThis.fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      ...(languageCode ? { language_code: languageCode } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS request failed: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

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
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
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
    const runDir = ctx.resolveLessonRunDir(outputRoot, courseSlug, Number(flags["lesson-number"]));
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

  if (existsSync(paths.corpus)) {
    ctx.log(`corpus.json already exists at ${paths.corpus} — reusing`);
    return;
  }

  let corpus;
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

    let bookConventions = ctx.loadBookConventions(epubHash);
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

  writeJson(paths.corpus, corpus);
  ctx.log(`wrote corpus with ${corpus.items.length} item(s) to ${paths.corpus}`);
}

async function runReview(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  const paths = ctx.runPaths(flags.run);

  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
  }

  const corpus = readJson(paths.corpus);
  const reviewedItems = await ctx.promptReviewDecisions(corpus.items, { print: ctx.log });

  const updated = {
    meta: { ...corpus.meta, reviewed: true },
    items: reviewedItems,
  };

  validateCorpus(updated);
  writeJson(paths.corpus, updated);
  ctx.log(
    `reviewed corpus: kept ${reviewedItems.length}/${corpus.items.length} item(s), wrote ${paths.corpus}`,
  );

  if (updated.meta.epubHash && updated.meta.chapterNumber != null) {
    ctx.saveChapterCorpus(updated.meta.epubHash, updated.meta.chapterNumber, updated);
    ctx.log(
      `saved chapter ${updated.meta.chapterNumber} corpus to the local library (epub ${updated.meta.epubHash})`,
    );
  }
}

async function runTranslate(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  const paths = ctx.runPaths(flags.run);

  if (existsSync(paths.cards)) {
    ctx.log(`cards.json already exists at ${paths.cards} — reusing`);
    return;
  }

  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
  }

  const corpus = readJson(paths.corpus);

  if (corpus.meta.reviewed !== true) {
    throw new Error(
      `corpus.json at ${paths.corpus} has not been reviewed yet — run "review --run ${flags.run}" first`,
    );
  }

  const { cards, errors } = await ctx.translateCorpus(corpus);

  writeJson(paths.cards, cards);
  ctx.log(`translated ${cards.items.length} item(s) to ${paths.cards}`);
  if (errors.length > 0) {
    ctx.log(`${errors.length} item(s) failed to translate: ${errors.map((e) => e.id).join(", ")}`);
  }
}

async function runAudio(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  const paths = ctx.runPaths(flags.run);

  if (!existsSync(paths.cards)) {
    throw new Error(`cards.json not found at ${paths.cards} — run "translate" first`);
  }

  const cards = readJson(paths.cards);
  const alreadyDone =
    cards.items.length > 0 &&
    cards.items.every((item) => item.audio && existsSync(join(paths.audio, item.audio)));

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
  });

  mkdirSync(paths.audio, { recursive: true });
  const cacheDir = join(ctx.libraryHome(), "audio", voiceId);
  for (const item of annotated.items) {
    if (!item.audio) continue;
    const src = join(cacheDir, item.audio);
    const dest = join(paths.audio, item.audio);
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
    }
  }

  writeJson(paths.cards, annotated);
  ctx.log(`generated audio for ${annotated.items.length} item(s) into ${paths.audio}`);
}

// Matches both an EPUB book's chapter-<N>/ folders and a lesson-source course's
// lesson-<N>/ folders — the two sourceTypes share this exact "numbered sub-deck of a
// bigger merged collection" directory shape (see the courseSlug comment on
// CORPUS_SCHEMA in model/index.js), so one book-dir merge path serves both.
const BOOK_UNIT_DIR_PATTERN = /^(?:chapter|lesson)-(\d+)$/;

async function runBookDeck(flags, ctx) {
  const bookDir = resolve(flags["book-dir"]);
  const outPath = join(bookDir, "deck.apkg");

  const chapterDirs = readdirSync(bookDir)
    .map((name) => name.match(BOOK_UNIT_DIR_PATTERN))
    .filter(Boolean)
    .map((m) => ({ seq: Number(m[1]), dir: join(bookDir, m[0]) }))
    .sort((a, b) => a.seq - b.seq);

  if (chapterDirs.length === 0) {
    throw new Error(`no chapter-*/ or lesson-*/ directories found under ${bookDir}`);
  }

  const chapterDecks = [];
  let epubHash = null;
  for (const { dir } of chapterDirs) {
    const cardsPath = join(dir, "cards.json");
    if (!existsSync(cardsPath)) {
      throw new Error(
        `cards.json not found in ${dir} — run "translate"/"audio" for that chapter first`,
      );
    }

    const cards = readJson(cardsPath);
    epubHash = epubHash || cards.meta?.epubHash;
    const chapterLabel = cards.meta?.chapterLabel || `Chapter ${chapterDecks.length + 1}`;
    const audioDir = join(dir, "audio");
    chapterDecks.push({
      name: chapterLabel,
      cards,
      audioDir: existsSync(audioDir) ? audioDir : null,
    });
  }

  const bookMeta = epubHash ? ctx.loadBookMeta(epubHash) : ctx.loadCourseMeta(bookDir);
  const bookName = bookMeta?.title || bookMeta?.name || flags.name || "AnkiBuilder Book Deck";

  // Merges N independently-changeable chapter inputs — always rebuild fresh rather
  // than reusing an existing deck.apkg (unlike the single-chapter path below), since
  // any upstream chapter change (re-translation, a newly added chapter, regenerated
  // audio) would otherwise silently leave a stale merged package in place.
  const result = ctx.buildBookDeck(chapterDecks, { outPath, bookName, now: Date.now() });

  ctx.log(
    `built book deck with ${result.noteCount} note(s) across ${result.chapterCount} chapter(s) at ${outPath}`,
  );
}

async function runDeck(flags, ctx) {
  if (flags["book-dir"]) {
    return runBookDeck(flags, ctx);
  }

  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
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

async function runRenderReview(flags, ctx) {
  const stage = flags.stage;
  if (!REVIEW_STAGES.includes(stage)) {
    throw new Error(
      `--stage must be one of: ${REVIEW_STAGES.join(", ")} (got ${JSON.stringify(stage ?? null)})`,
    );
  }
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }

  const paths = ctx.runPaths(flags.run);
  const outPath = join(resolve(flags.run), `review-${stage}.html`);

  let html;
  if (stage === "corpus") {
    if (!existsSync(paths.corpus)) {
      throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
    }
    html = ctx.renderCorpusReviewPage(readJson(paths.corpus));
  } else if (stage === "translate") {
    if (!existsSync(paths.cards)) {
      throw new Error(`cards.json not found at ${paths.cards} — run "translate" first`);
    }
    html = ctx.renderTranslateReviewPage(readJson(paths.cards));
  } else {
    if (!existsSync(paths.cards)) {
      throw new Error(`cards.json not found at ${paths.cards} — run "translate" first`);
    }
    html = ctx.renderAudioReviewPage(readJson(paths.cards), { audioDir: paths.audio });
  }

  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, html);
  ctx.log(`wrote ${stage} review artifact to ${outPath}`);
}

const COMMANDS = {
  assemble: runAssemble,
  review: runReview,
  translate: runTranslate,
  audio: runAudio,
  deck: runDeck,
  "render-review": runRenderReview,
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
    saveChapterCorpus = defaultSaveChapterCorpus,
    loadPriorChapterItems = defaultLoadPriorChapterItems,
    loadBookConventions = defaultLoadBookConventions,
    saveBookConventions = defaultSaveBookConventions,
    loadBookMeta = defaultLoadBookMeta,
    analyzeBookConventions = defaultAnalyzeBookConventions,
    dedupBackward = defaultDedupBackward,
    flagForwardConcerns = defaultFlagForwardConcerns,
    promptReviewDecisions = defaultPromptReviewDecisions,
    translateCorpus = defaultTranslateCorpus,
    generateAudio = defaultGenerateAudio,
    getDefaultVoice = defaultGetDefaultVoice,
    buildDeck = defaultBuildDeck,
    buildBookDeck = defaultBuildBookDeck,
    fetchTts = defaultFetchTts,
    renderCorpusReviewPage = defaultRenderCorpusReviewPage,
    renderTranslateReviewPage = defaultRenderTranslateReviewPage,
    renderAudioReviewPage = defaultRenderAudioReviewPage,
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
    saveChapterCorpus,
    loadPriorChapterItems,
    loadBookConventions,
    saveBookConventions,
    loadBookMeta,
    analyzeBookConventions,
    dedupBackward,
    flagForwardConcerns,
    promptReviewDecisions,
    translateCorpus,
    generateAudio,
    getDefaultVoice,
    buildDeck,
    buildBookDeck,
    fetchTts,
    renderCorpusReviewPage,
    renderTranslateReviewPage,
    renderAudioReviewPage,
    log,
  };

  await handler(flags, ctx);
}

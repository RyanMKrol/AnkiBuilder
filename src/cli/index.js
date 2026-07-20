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
import { sortItemsPedagogically as defaultSortItemsPedagogically } from "../corpus/pedagogicalSort.js";
import { normalizeDisplayText } from "../model/scriptSpacing.js";
import { analyzeBookConventions as defaultAnalyzeBookConventions } from "../corpus/epubBookConventions.js";
import { translateCorpus as defaultTranslateCorpus } from "../translate/index.js";
import { generateAudio as defaultGenerateAudio } from "../audio/index.js";
import { getDefaultVoice as defaultGetDefaultVoice } from "../audio/voiceLibrary.js";
import { getAltAudioTransform as defaultGetAltAudioTransform } from "../audio/altAudio.js";
import { TTS_MODEL } from "../audio/ttsModel.js";
import {
  buildDeck as defaultBuildDeck,
  buildBookDeck as defaultBuildBookDeck,
} from "../deck/index.js";
import {
  getLanguageFont as defaultGetLanguageFont,
  readFontBytes as defaultReadFontBytes,
} from "../deck/fontLibrary.js";
import { restyleApkgBuffer as defaultRestyleApkgBuffer } from "../deck/restyleFont.js";
import { defaultPromptReviewDecisions } from "./reviewPrompt.js";
import { renderCorpusReviewPage as defaultRenderCorpusReviewPage } from "../review/renderCorpusReviewPage.js";
import { renderTranslateReviewPage as defaultRenderTranslateReviewPage } from "../review/renderTranslateReviewPage.js";
import { renderAudioReviewPage as defaultRenderAudioReviewPage } from "../review/renderAudioReviewPage.js";
import { renderDeckViewPage as defaultRenderDeckViewPage } from "../review/renderDeckViewPage.js";
import { readApkg as defaultReadApkg } from "../deck/readApkg.js";

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
      model_id: TTS_MODEL,
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

  // A language with a configured alt-audio transform gets a second recording per card, unless
  // `--no-alt` is passed. When alt audio is in play, a run only counts as "already done" if every
  // card has BOTH its clips on disk — so enabling this feature backfills alt clips for a run that
  // was processed before it existed (regeneration stays cheap: generateAudio only fetches cache
  // misses).
  const altEnabled = !flags["no-alt"];
  const hasAlt =
    altEnabled && !!ctx.getAltAudioTransform(resolveIso639Code(cards.meta.targetLanguage));
  const alreadyDone =
    cards.items.length > 0 &&
    cards.items.every(
      (item) =>
        item.audio &&
        existsSync(join(paths.audio, item.audio)) &&
        (!hasAlt || (item.altAudio && existsSync(join(paths.audio, item.altAudio)))),
    );

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
    // `--no-alt` disables the alt pass for this run by resolving no transform for any language.
    getAltTransform: altEnabled ? ctx.getAltAudioTransform : () => undefined,
  });

  mkdirSync(paths.audio, { recursive: true });
  // Must match generateAudio's model-segmented cache path (audio/<voiceId>/<model>/).
  const cacheDir = join(ctx.libraryHome(), "audio", voiceId, TTS_MODEL);
  // Copy both the default clip and (when present) the alt clip from the cache into the run's
  // audio/ dir. The deck build reads files from there; a card carrying `altAudio` needs its alt
  // clip on disk in case the review later switches the card to it.
  for (const item of annotated.items) {
    for (const filename of [item.audio, item.altAudio]) {
      if (!filename) continue;
      const dest = join(paths.audio, filename);
      if (!existsSync(dest)) {
        copyFileSync(join(cacheDir, filename), dest);
      }
    }
  }

  writeJson(paths.cards, annotated);
  const altCount = annotated.items.filter((item) => item.altAudio).length;
  ctx.log(
    `generated audio for ${annotated.items.length} item(s) into ${paths.audio}` +
      (altCount > 0 ? ` (+${altCount} alt clip(s))` : ""),
  );
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

const COMMANDS = {
  assemble: runAssemble,
  review: runReview,
  translate: runTranslate,
  audio: runAudio,
  deck: runDeck,
  "restyle-font": runRestyleFont,
  "render-review": runRenderReview,
  "view-deck": runViewDeck,
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
    sortItemsPedagogically = defaultSortItemsPedagogically,
    promptReviewDecisions = defaultPromptReviewDecisions,
    translateCorpus = defaultTranslateCorpus,
    generateAudio = defaultGenerateAudio,
    getDefaultVoice = defaultGetDefaultVoice,
    getAltAudioTransform = defaultGetAltAudioTransform,
    buildDeck = defaultBuildDeck,
    buildBookDeck = defaultBuildBookDeck,
    getLanguageFont = defaultGetLanguageFont,
    readFontBytes = defaultReadFontBytes,
    restyleApkgBuffer = defaultRestyleApkgBuffer,
    fetchTts = defaultFetchTts,
    renderCorpusReviewPage = defaultRenderCorpusReviewPage,
    renderTranslateReviewPage = defaultRenderTranslateReviewPage,
    renderAudioReviewPage = defaultRenderAudioReviewPage,
    renderDeckViewPage = defaultRenderDeckViewPage,
    readApkg = defaultReadApkg,
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
    sortItemsPedagogically,
    promptReviewDecisions,
    translateCorpus,
    generateAudio,
    getDefaultVoice,
    getAltAudioTransform,
    buildDeck,
    buildBookDeck,
    getLanguageFont,
    readFontBytes,
    restyleApkgBuffer,
    fetchTts,
    renderCorpusReviewPage,
    renderTranslateReviewPage,
    renderAudioReviewPage,
    renderDeckViewPage,
    readApkg,
    log,
  };

  await handler(flags, ctx);
}

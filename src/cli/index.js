import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { Buffer } from "buffer";
import {
  runPaths as defaultRunPaths,
  libraryHome as defaultLibraryHome,
  validateCorpus,
} from "../model/index.js";
import { listTemplates, loadTemplate as defaultLoadTemplate } from "../corpus/templates.js";
import { assembleCorpusFromChapter as defaultAssembleCorpusFromChapter } from "../corpus/epubLlmCorpus.js";
import { translateCorpus as defaultTranslateCorpus } from "../translate/index.js";
import { generateAudio as defaultGenerateAudio } from "../audio/index.js";
import { buildDeck as defaultBuildDeck } from "../deck/index.js";
import { defaultPromptReviewDecisions } from "./reviewPrompt.js";

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

async function defaultFetchTts(text, voiceId, apiKey) {
  const response = await globalThis.fetch(`${ELEVENLABS_TTS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
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

async function runAssemble(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (existsSync(paths.corpus)) {
    ctx.log(`corpus.json already exists at ${paths.corpus} — reusing`);
    return;
  }

  let corpus;
  if (flags.chapter) {
    if (!flags.lang) {
      throw new Error("--lang is required when assembling from a --chapter source");
    }
    corpus = ctx.assembleCorpusFromChapter({
      chapterFilePath: flags.chapter,
      targetLanguage: flags.lang,
    });
  } else if (flags.template) {
    corpus = ctx.loadTemplate(flags.template);
  } else {
    throw new Error(
      `either --template <name> or --chapter <path> is required. Available templates: ${listTemplates().join(", ")}`,
    );
  }

  writeJson(paths.corpus, corpus);
  ctx.log(`wrote corpus with ${corpus.items.length} item(s) to ${paths.corpus}`);
}

async function runReview(flags, ctx) {
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
}

async function runTranslate(flags, ctx) {
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

  const { cards, errors } = ctx.translateCorpus(corpus);

  writeJson(paths.cards, cards);
  ctx.log(`translated ${cards.items.length} item(s) to ${paths.cards}`);
  if (errors.length > 0) {
    ctx.log(`${errors.length} item(s) failed to translate: ${errors.map((e) => e.id).join(", ")}`);
  }
}

async function runAudio(flags, ctx) {
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

  if (!flags.voice) {
    throw new Error("--voice <voiceId> is required for the audio stage");
  }

  const annotated = await ctx.generateAudio(cards, {
    voiceId: flags.voice,
    fetchTts: ctx.fetchTts,
    libraryHomeDir: ctx.libraryHome(),
  });

  mkdirSync(paths.audio, { recursive: true });
  const cacheDir = join(ctx.libraryHome(), "audio", flags.voice);
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

async function runDeck(flags, ctx) {
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

const COMMANDS = {
  assemble: runAssemble,
  review: runReview,
  translate: runTranslate,
  audio: runAudio,
  deck: runDeck,
};

export async function runCli(argv, deps = {}) {
  const {
    runPaths = defaultRunPaths,
    libraryHome = defaultLibraryHome,
    loadTemplate = defaultLoadTemplate,
    assembleCorpusFromChapter = defaultAssembleCorpusFromChapter,
    promptReviewDecisions = defaultPromptReviewDecisions,
    translateCorpus = defaultTranslateCorpus,
    generateAudio = defaultGenerateAudio,
    buildDeck = defaultBuildDeck,
    fetchTts = defaultFetchTts,
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
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }

  const ctx = {
    runPaths,
    libraryHome,
    loadTemplate,
    assembleCorpusFromChapter,
    promptReviewDecisions,
    translateCorpus,
    generateAudio,
    buildDeck,
    fetchTts,
    log,
  };

  await handler(flags, ctx);
}

import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import { Buffer } from "buffer";
import { runCli } from "../../src/cli/index.js";
import { runPaths } from "../../src/model/index.js";

async function withTempDir(fn) {
  const tmpDir = await fs.mkdtemp(join(os.tmpdir(), "cli-test-"));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function baseCorpus({ reviewed = true } = {}) {
  return {
    meta: { targetLanguage: "es", sourceType: "template", reviewed },
    items: [{ id: "a1", english: "Hello", category: "Greetings", notes: null, target: null }],
  };
}

function baseCards() {
  return {
    meta: { targetLanguage: "es", sourceType: "template" },
    items: [
      { id: "a1", english: "Hello", category: "Greetings", target: "Hola", pronunciation: "OH-la" },
    ],
  };
}

function baseEpubCorpus() {
  return {
    meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: false },
    items: [
      { id: "hello", english: "Hello", category: "Greetings", notes: null, target: "こんにちは" },
    ],
  };
}

test("throws on unknown command", async () => {
  await assert.rejects(() => runCli(["bogus", "--run", "/tmp/x"]), /Unknown command/);
});

test("throws when --run is missing", async () => {
  await assert.rejects(() => runCli(["assemble", "--template", "travel-essentials"]), /--run/);
});

test("assemble: dispatches to loadTemplate and writes corpus.json", async () => {
  await withTempDir(async (runDir) => {
    const loadTemplate = (name) => {
      assert.equal(name, "travel-essentials");
      return baseCorpus();
    };

    await runCli(["assemble", "--run", runDir, "--template", "travel-essentials"], {
      loadTemplate,
      log: () => {},
    });

    const paths = runPaths(runDir);
    assert(existsSync(paths.corpus));
    const written = JSON.parse(await fs.readFile(paths.corpus, "utf-8"));
    assert.equal(written.items[0].id, "a1");
  });
});

test("assemble: dispatches to assembleCorpusFromChapter when --chapter is given", async () => {
  await withTempDir(async (runDir) => {
    let calledWith = null;
    const assembleCorpusFromChapter = (opts) => {
      calledWith = opts;
      return baseCorpus();
    };

    await runCli(
      ["assemble", "--run", runDir, "--chapter", "/tmp/chapter08.xhtml", "--lang", "es"],
      { assembleCorpusFromChapter, log: () => {} },
    );

    assert.equal(calledWith.chapterFilePath, "/tmp/chapter08.xhtml");
    assert.equal(calledWith.targetLanguage, "es");
    assert(existsSync(runPaths(runDir).corpus));
  });
});

test("assemble: throws when --chapter is given without --lang", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () =>
        runCli(["assemble", "--run", runDir, "--chapter", "/tmp/chapter08.xhtml"], {
          log: () => {},
        }),
      /--lang is required/,
    );
  });
});

test("assemble: dispatches to the --epub path — registers, extracts, dedups, and tags meta", async () => {
  await withTempDir(async (runDir) => {
    let registerEpubCalledWith = null;
    let extractChapterToFileCalledWith = null;
    let dedupForwardCalledWith = null;

    const registerEpub = (epubPath) => {
      registerEpubCalledWith = epubPath;
      return { epubHash: "hash123" };
    };
    const chapterCachePath = (epubHash, chapterNumber) =>
      `/cache/${epubHash}/${chapterNumber}.xhtml`;
    const extractChapterToFile = (epubPath, chapterNumber, destPath) => {
      extractChapterToFileCalledWith = { epubPath, chapterNumber, destPath };
      return destPath;
    };
    const assembleCorpusFromChapter = ({ chapterFilePath, targetLanguage }) => {
      assert.equal(chapterFilePath, "/cache/hash123/3.xhtml");
      assert.equal(targetLanguage, "Japanese");
      return baseEpubCorpus();
    };
    const loadPriorChapterItems = () => [];
    const loadBookConventions = () => "cached conventions";
    const dedupBackward = (items) => ({ kept: items, dropped: [] });
    const dedupForward = (opts) => {
      dedupForwardCalledWith = opts;
      return { kept: opts.candidateItems, dropped: [] };
    };

    await runCli(
      [
        "assemble",
        "--run",
        runDir,
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "3",
        "--lang",
        "Japanese",
      ],
      {
        registerEpub,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        dedupBackward,
        dedupForward,
        log: () => {},
      },
    );

    assert.equal(registerEpubCalledWith, "/tmp/book.epub");
    assert.equal(extractChapterToFileCalledWith.chapterNumber, 3);
    assert.equal(dedupForwardCalledWith.chapterNumber, 3);
    assert.equal(dedupForwardCalledWith.epubPath, "/tmp/book.epub");

    const written = JSON.parse(await fs.readFile(runPaths(runDir).corpus, "utf-8"));
    assert.equal(written.meta.epubHash, "hash123");
    assert.equal(written.meta.chapterNumber, 3);
  });
});

test("assemble: runs the book-conventions pass on the first --epub assemble for a book and caches it", async () => {
  await withTempDir(async (runDir) => {
    let savedConventionsCalledWith = null;
    let analyzeCalled = false;

    const registerEpub = () => ({ epubHash: "hash123" });
    const chapterCachePath = () => "/cache/1.xhtml";
    const extractChapterToFile = (epubPath, chapterNumber, destPath) => destPath;
    const assembleCorpusFromChapter = ({ bookConventions }) => {
      assert.equal(bookConventions, "generated conventions");
      return baseEpubCorpus();
    };
    const loadPriorChapterItems = () => [];
    const loadBookConventions = () => null; // nothing cached yet
    const analyzeBookConventions = () => {
      analyzeCalled = true;
      return "generated conventions";
    };
    const saveBookConventions = (epubHash, markdown) => {
      savedConventionsCalledWith = { epubHash, markdown };
    };
    const dedupBackward = (items) => ({ kept: items, dropped: [] });
    const dedupForward = ({ candidateItems }) => ({ kept: candidateItems, dropped: [] });

    await runCli(
      [
        "assemble",
        "--run",
        runDir,
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "1",
        "--lang",
        "Japanese",
      ],
      {
        registerEpub,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        analyzeBookConventions,
        saveBookConventions,
        dedupBackward,
        dedupForward,
        log: () => {},
      },
    );

    assert.equal(analyzeCalled, true);
    assert.deepEqual(savedConventionsCalledWith, {
      epubHash: "hash123",
      markdown: "generated conventions",
    });
  });
});

test("assemble: skips the book-conventions pass when it's already cached for that epub", async () => {
  await withTempDir(async (runDir) => {
    let analyzeCalled = false;
    let saveCalled = false;

    const registerEpub = () => ({ epubHash: "hash123" });
    const chapterCachePath = () => "/cache/1.xhtml";
    const extractChapterToFile = (epubPath, chapterNumber, destPath) => destPath;
    const assembleCorpusFromChapter = ({ bookConventions }) => {
      assert.equal(bookConventions, "already cached conventions");
      return baseEpubCorpus();
    };
    const loadPriorChapterItems = () => [];
    const loadBookConventions = () => "already cached conventions";
    const analyzeBookConventions = () => {
      analyzeCalled = true;
      return "should not be called";
    };
    const saveBookConventions = () => {
      saveCalled = true;
    };
    const dedupBackward = (items) => ({ kept: items, dropped: [] });
    const dedupForward = ({ candidateItems }) => ({ kept: candidateItems, dropped: [] });

    await runCli(
      [
        "assemble",
        "--run",
        runDir,
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "2",
        "--lang",
        "Japanese",
      ],
      {
        registerEpub,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        analyzeBookConventions,
        saveBookConventions,
        dedupBackward,
        dedupForward,
        log: () => {},
      },
    );

    assert.equal(analyzeCalled, false);
    assert.equal(saveCalled, false);
  });
});

test("assemble: --chapter takes precedence when both --chapter and --epub are given", async () => {
  await withTempDir(async (runDir) => {
    const logs = [];
    let assembleCalledWith = null;
    let registerEpubCalled = false;

    const assembleCorpusFromChapter = (opts) => {
      assembleCalledWith = opts;
      return baseCorpus();
    };
    const registerEpub = () => {
      registerEpubCalled = true;
      return { epubHash: "x" };
    };

    await runCli(
      [
        "assemble",
        "--run",
        runDir,
        "--chapter",
        "/tmp/manual.xhtml",
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "1",
        "--lang",
        "es",
      ],
      { assembleCorpusFromChapter, registerEpub, log: (msg) => logs.push(msg) },
    );

    assert.equal(assembleCalledWith.chapterFilePath, "/tmp/manual.xhtml");
    assert.equal(registerEpubCalled, false);
    assert.ok(logs.some((msg) => msg.includes("both --chapter and --epub")));
  });
});

test("assemble: throws when --epub is given without --chapter-number", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () =>
        runCli(["assemble", "--run", runDir, "--epub", "/tmp/book.epub", "--lang", "es"], {
          log: () => {},
        }),
      /--chapter-number is required/,
    );
  });
});

test("assemble: throws when --epub is given without --lang", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () =>
        runCli(["assemble", "--run", runDir, "--epub", "/tmp/book.epub", "--chapter-number", "1"], {
          log: () => {},
        }),
      /--lang is required/,
    );
  });
});

test("assemble: logs one line per dropped item for both dedup passes, not just a count", async () => {
  await withTempDir(async (runDir) => {
    const logs = [];

    const registerEpub = () => ({ epubHash: "hash1" });
    const chapterCachePath = () => "/cache/1.xhtml";
    const extractChapterToFile = (epubPath, chapterNumber, destPath) => destPath;
    const assembleCorpusFromChapter = () => ({
      meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: false },
      items: [
        { id: "old-item", english: "Old", category: "Other", notes: null, target: "古い" },
        { id: "later-item", english: "Later", category: "Other", notes: null, target: "後で" },
        { id: "keep-item", english: "Keep", category: "Other", notes: null, target: "保つ" },
      ],
    });
    const loadPriorChapterItems = () => [
      {
        id: "prior",
        english: "Old",
        category: "Other",
        notes: null,
        target: "古い",
        __chapterNumber: 1,
      },
    ];
    const loadBookConventions = () => "cached conventions";
    const dedupBackward = (items, priorItems) => ({
      kept: items.slice(1),
      dropped: [{ item: items[0], matchedField: "english", matchedPriorItem: priorItems[0] }],
    });
    const dedupForward = ({ candidateItems }) => ({
      kept: candidateItems.slice(1),
      dropped: [{ item: candidateItems[0], laterChapter: 5, reason: "taught later" }],
    });

    await runCli(
      [
        "assemble",
        "--run",
        runDir,
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "2",
        "--lang",
        "Japanese",
      ],
      {
        registerEpub,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        dedupBackward,
        dedupForward,
        log: (msg) => logs.push(msg),
      },
    );

    assert.ok(
      logs.some(
        (msg) => msg.includes('[dedup:backward] dropped "Old"') && msg.includes("chapter 1"),
      ),
      "expected an individual backward-drop log line naming the item and matched chapter",
    );
    assert.ok(
      logs.some(
        (msg) => msg.includes('[dedup:forward] dropped "Later"') && msg.includes("chapter 5"),
      ),
      "expected an individual forward-drop log line naming the item and later chapter",
    );
  });
});

test("assemble: is resumable — skips work when corpus.json already exists", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus()));

    let called = false;
    const loadTemplate = () => {
      called = true;
      return baseCorpus();
    };

    await runCli(["assemble", "--run", runDir, "--template", "travel-essentials"], {
      loadTemplate,
      log: () => {},
    });

    assert.equal(called, false);
  });
});

test("review: filters excluded items and marks the corpus as reviewed", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    const corpus = {
      meta: { targetLanguage: "es", sourceType: "template", reviewed: false },
      items: [
        { id: "a1", english: "Hello", category: "Greetings", notes: null, target: null },
        { id: "a2", english: "Goodbye", category: "Greetings", notes: null, target: null },
      ],
    };
    writeFileSync(paths.corpus, JSON.stringify(corpus));

    const promptReviewDecisions = async (items) => items.filter((item) => item.id !== "a2");

    await runCli(["review", "--run", runDir], { promptReviewDecisions, log: () => {} });

    const written = JSON.parse(await fs.readFile(paths.corpus, "utf-8"));
    assert.equal(written.items.length, 1);
    assert.equal(written.items[0].id, "a1");
    assert.equal(written.meta.reviewed, true);
  });
});

test("review: saves to the local library when the corpus is epub-tracked", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    const corpus = {
      meta: {
        targetLanguage: "Japanese",
        sourceType: "epub",
        reviewed: false,
        epubHash: "hash1",
        chapterNumber: 2,
      },
      items: [
        { id: "a1", english: "Hello", category: "Greetings", notes: null, target: "こんにちは" },
      ],
    };
    writeFileSync(paths.corpus, JSON.stringify(corpus));

    let savedWith = null;
    const saveChapterCorpus = (epubHash, chapterNumber) => {
      savedWith = { epubHash, chapterNumber };
    };
    const promptReviewDecisions = async (items) => items;

    await runCli(["review", "--run", runDir], {
      promptReviewDecisions,
      saveChapterCorpus,
      log: () => {},
    });

    assert.equal(savedWith.epubHash, "hash1");
    assert.equal(savedWith.chapterNumber, 2);
  });
});

test("review: does not save to the local library for a template-sourced corpus", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus({ reviewed: false })));

    let saveChapterCorpusCalled = false;
    const saveChapterCorpus = () => {
      saveChapterCorpusCalled = true;
    };
    const promptReviewDecisions = async (items) => items;

    await runCli(["review", "--run", runDir], {
      promptReviewDecisions,
      saveChapterCorpus,
      log: () => {},
    });

    assert.equal(saveChapterCorpusCalled, false);
  });
});

test("review: throws when corpus.json is missing", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () => runCli(["review", "--run", runDir], { log: () => {} }),
      /corpus\.json not found/,
    );
  });
});

test("translate: throws when the corpus has not been reviewed yet", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus({ reviewed: false })));

    await assert.rejects(
      () => runCli(["translate", "--run", runDir], { log: () => {} }),
      /has not been reviewed yet/,
    );
  });
});

test("translate: reads corpus.json and writes cards.json", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus()));

    let receivedCorpus = null;
    const translateCorpus = (corpus) => {
      receivedCorpus = corpus;
      return { cards: baseCards(), errors: [] };
    };

    await runCli(["translate", "--run", runDir], { translateCorpus, log: () => {} });

    assert.equal(receivedCorpus.items[0].id, "a1");
    assert(existsSync(paths.cards));
    const written = JSON.parse(await fs.readFile(paths.cards, "utf-8"));
    assert.equal(written.items[0].target, "Hola");
  });
});

test("translate: is resumable — skips work when cards.json already exists", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus()));
    writeFileSync(paths.cards, JSON.stringify(baseCards()));

    let called = false;
    const translateCorpus = () => {
      called = true;
      return { cards: baseCards(), errors: [] };
    };

    await runCli(["translate", "--run", runDir], { translateCorpus, log: () => {} });
    assert.equal(called, false);
  });
});

test("translate: throws when corpus.json is missing", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () => runCli(["translate", "--run", runDir], { log: () => {} }),
      /corpus\.json not found/,
    );
  });
});

test("audio: dispatches to generateAudio, copies files into run audio dir, and rewrites cards.json", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      writeFileSync(paths.cards, JSON.stringify(baseCards()));

      const cacheDir = join(libraryHomeDir, "audio", "voice1");
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "hola.mp3"), Buffer.from("mp3-bytes"));

      let receivedOpts = null;
      const generateAudio = (cards, opts) => {
        receivedOpts = opts;
        return {
          ...cards,
          items: cards.items.map((item) => ({ ...item, audio: "hola.mp3" })),
        };
      };

      await runCli(["audio", "--run", runDir, "--voice", "voice1"], {
        generateAudio,
        libraryHome: () => libraryHomeDir,
        log: () => {},
      });

      assert.equal(receivedOpts.voiceId, "voice1");
      assert(existsSync(join(paths.audio, "hola.mp3")));
      const written = JSON.parse(await fs.readFile(paths.cards, "utf-8"));
      assert.equal(written.items[0].audio, "hola.mp3");
    }),
  );
});

test("audio: is resumable — skips work when every card's audio file already exists", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    mkdirSync(paths.audio, { recursive: true });
    const cards = { ...baseCards(), items: [{ ...baseCards().items[0], audio: "hola.mp3" }] };
    writeFileSync(paths.cards, JSON.stringify(cards));
    writeFileSync(join(paths.audio, "hola.mp3"), Buffer.from("mp3-bytes"));

    let called = false;
    const generateAudio = () => {
      called = true;
      return cards;
    };

    await runCli(["audio", "--run", runDir, "--voice", "voice1"], { generateAudio, log: () => {} });
    assert.equal(called, false);
  });
});

test("audio: throws when --voice is missing and audio is not already generated", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards()));

    await assert.rejects(() => runCli(["audio", "--run", runDir], { log: () => {} }), /--voice/);
  });
});

test("deck: dispatches to buildDeck with cards.json and audio dir", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards()));

    let received = null;
    const buildDeck = (cards, opts) => {
      received = { cards, opts };
      return { outPath: opts.outPath, noteCount: cards.items.length, mediaCount: 0 };
    };

    await runCli(["deck", "--run", runDir, "--name", "My Deck"], { buildDeck, log: () => {} });

    assert.equal(received.opts.outPath, paths.deck);
    assert.equal(received.opts.deckName, "My Deck");
    assert.equal(received.cards.items[0].id, "a1");
  });
});

test("deck: is resumable — skips work when deck.apkg already exists", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards()));
    writeFileSync(paths.deck, Buffer.from("fake-apkg"));

    let called = false;
    const buildDeck = () => {
      called = true;
      return { outPath: paths.deck, noteCount: 0, mediaCount: 0 };
    };

    await runCli(["deck", "--run", runDir], { buildDeck, log: () => {} });
    assert.equal(called, false);
  });
});

test("render-review: throws when --stage is missing or unrecognized", async () => {
  await withTempDir(async (runDir) => {
    mkdirSync(runDir, { recursive: true });
    await assert.rejects(
      () => runCli(["render-review", "--run", runDir], { log: () => {} }),
      /--stage must be one of/,
    );
    await assert.rejects(
      () => runCli(["render-review", "--run", runDir, "--stage", "bogus"], { log: () => {} }),
      /--stage must be one of/,
    );
  });
});

test("render-review --stage corpus: reads corpus.json, calls renderCorpusReviewPage, writes review-corpus.html", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus()));

    let received = null;
    const renderCorpusReviewPage = (corpus) => {
      received = corpus;
      return "<title>fake corpus review</title>";
    };

    await runCli(["render-review", "--run", runDir, "--stage", "corpus"], {
      renderCorpusReviewPage,
      log: () => {},
    });

    assert.equal(received.items[0].id, "a1");
    const outPath = join(runDir, "review-corpus.html");
    assert(existsSync(outPath));
    assert.equal(await fs.readFile(outPath, "utf-8"), "<title>fake corpus review</title>");
  });
});

test("render-review --stage corpus: throws when corpus.json doesn't exist yet", async () => {
  await withTempDir(async (runDir) => {
    mkdirSync(runDir, { recursive: true });
    await assert.rejects(
      () => runCli(["render-review", "--run", runDir, "--stage", "corpus"], { log: () => {} }),
      /corpus\.json not found/,
    );
  });
});

test("render-review --stage translate: reads cards.json, calls renderTranslateReviewPage, writes review-translate.html", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards()));

    let received = null;
    const renderTranslateReviewPage = (cards) => {
      received = cards;
      return "<title>fake translate review</title>";
    };

    await runCli(["render-review", "--run", runDir, "--stage", "translate"], {
      renderTranslateReviewPage,
      log: () => {},
    });

    assert.equal(received.items[0].id, "a1");
    const outPath = join(runDir, "review-translate.html");
    assert(existsSync(outPath));
    assert.equal(await fs.readFile(outPath, "utf-8"), "<title>fake translate review</title>");
  });
});

test("render-review --stage audio: reads cards.json, passes the run's audio dir, writes review-audio.html", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards()));

    let received = null;
    const renderAudioReviewPage = (cards, opts) => {
      received = { cards, opts };
      return "<title>fake audio review</title>";
    };

    await runCli(["render-review", "--run", runDir, "--stage", "audio"], {
      renderAudioReviewPage,
      log: () => {},
    });

    assert.equal(received.cards.items[0].id, "a1");
    assert.equal(received.opts.audioDir, paths.audio);
    const outPath = join(runDir, "review-audio.html");
    assert(existsSync(outPath));
  });
});

test("render-review --stage translate: throws when cards.json doesn't exist yet", async () => {
  await withTempDir(async (runDir) => {
    mkdirSync(runDir, { recursive: true });
    await assert.rejects(
      () => runCli(["render-review", "--run", runDir, "--stage", "translate"], { log: () => {} }),
      /cards\.json not found/,
    );
  });
});

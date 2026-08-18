import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs, readFileSync } from "fs";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import { Buffer } from "buffer";
import { runCli } from "../../src/cli/index.js";
import { runPaths, validateCards } from "../../src/model/index.js";
import { TTS_MODEL } from "../../src/audio/ttsModel.js";
import { deckPathForDir } from "../../src/deck/deckFileName.js";

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
    items: [{ id: "a1", english: "Hello", category: "Greetings", target: null }],
  };
}

function baseCards({ reviewed = true } = {}) {
  return {
    meta: { targetLanguage: "es", sourceType: "template", reviewed },
    items: [
      { id: "a1", english: "Hello", category: "Greetings", target: "Hola", pronunciation: "OH-la" },
    ],
  };
}

function baseEpubCorpus() {
  return {
    meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: false },
    items: [{ id: "hello", english: "Hello", category: "Greetings", target: "こんにちは" }],
  };
}

// Passthrough stub for the assemble-time pedagogical sort so multi-item test corpora don't spawn a
// real `claude`. (Single-item corpora no-op in the real default, so those tests don't need this.)
const passthroughSort = ({ items }) => ({ items, changed: false });

// Every assemble-only test passes --no-prepare. `assemble` chains into `prepare` (translate → drills →
// de-dup → notes) by default so no lesson can be left un-translated, and these tests are about what
// assemble itself writes — the chain has its own tests at the bottom of this file.

test("throws on unknown command", async () => {
  await assert.rejects(() => runCli(["bogus", "--run", "/tmp/x"]), /Unknown command/);
});

test("throws when --run is missing", async () => {
  await assert.rejects(
    () => runCli(["assemble", "--no-prepare", "--template", "travel-essentials"]),
    /--run/,
  );
});

test("assemble: dispatches to loadTemplate and writes corpus.json", async () => {
  await withTempDir(async (runDir) => {
    const loadTemplate = (name, targetLanguage) => {
      assert.equal(name, "travel-essentials");
      assert.equal(targetLanguage, "es");
      return baseCorpus();
    };

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--run",
        runDir,
        "--template",
        "travel-essentials",
        "--lang",
        "es",
      ],
      {
        loadTemplate,
        log: () => {},
      },
    );

    const paths = runPaths(runDir);
    assert(existsSync(paths.corpus));
    const written = JSON.parse(await fs.readFile(paths.corpus, "utf-8"));
    assert.equal(written.items[0].id, "a1");
  });
});

test("assemble: --output-root + --template resolves output/templates/<name>/<lang>/ and writes there", async () => {
  await withTempDir(async (outputRoot) => {
    const loadTemplate = (name, targetLanguage) => {
      assert.equal(name, "numbers");
      assert.equal(targetLanguage, "ja");
      return baseCorpus();
    };

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--output-root",
        outputRoot,
        "--template",
        "numbers",
        "--lang",
        "ja",
      ],
      { loadTemplate, log: () => {} },
    );

    const runDir = join(outputRoot, "templates", "numbers", "ja");
    const paths = runPaths(runDir);
    assert(existsSync(paths.corpus), "corpus.json should be written under templates/numbers/ja/");
    const written = JSON.parse(await fs.readFile(paths.corpus, "utf-8"));
    assert.equal(written.items[0].id, "a1");
  });
});

test("assemble: --output-root + --template requires --lang", async () => {
  await withTempDir(async (outputRoot) => {
    await assert.rejects(
      () =>
        runCli(["assemble", "--no-prepare", "--output-root", outputRoot, "--template", "numbers"], {
          loadTemplate: () => {
            throw new Error("loadTemplate should not be reached without --lang");
          },
          log: () => {},
        }),
      /--lang is required/,
    );
  });
});

test("assemble: throws when --template is given without --lang", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () =>
        runCli(["assemble", "--no-prepare", "--run", runDir, "--template", "travel-essentials"], {
          loadTemplate: () => {
            throw new Error("loadTemplate should not be reached without --lang");
          },
          log: () => {},
        }),
      /--lang is required/,
    );
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
      [
        "assemble",
        "--no-prepare",
        "--run",
        runDir,
        "--chapter",
        "/tmp/chapter08.xhtml",
        "--lang",
        "es",
      ],
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
        runCli(["assemble", "--no-prepare", "--run", runDir, "--chapter", "/tmp/chapter08.xhtml"], {
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
    let flagForwardConcernsCalledWith = null;

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
    const dedupBackward = (items) => ({ items, flagged: [] });
    const flagForwardConcerns = (opts) => {
      flagForwardConcernsCalledWith = opts;
      return { items: opts.candidateItems, flagged: [] };
    };
    const describeChapter = (epubPath, chapterNumber) => `Lesson ${chapterNumber}`;

    await runCli(
      [
        "assemble",
        "--no-prepare",
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
        resolveLabelDecoding: () => 1,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        dedupBackward,
        flagForwardConcerns,
        describeChapter,
        log: () => {},
      },
    );

    assert.equal(registerEpubCalledWith, "/tmp/book.epub");
    assert.equal(extractChapterToFileCalledWith.chapterNumber, 3);
    assert.equal(flagForwardConcernsCalledWith.chapterNumber, 3);
    assert.equal(flagForwardConcernsCalledWith.epubPath, "/tmp/book.epub");

    const written = JSON.parse(await fs.readFile(runPaths(runDir).corpus, "utf-8"));
    assert.equal(written.meta.epubHash, "hash123");
    assert.equal(written.meta.chapterNumber, 3);
    assert.equal(written.meta.chapterLabel, "Lesson 3");
  });
});

test("assemble: --lesson resolves a multi-file lesson, extracts the whole spine range, and tags meta", async () => {
  await withTempDir(async (runDir) => {
    let extractRangeCalledWith = null;
    let flagForwardConcernsCalledWith = null;

    const registerEpub = () => ({ epubHash: "hash123" });
    const resolveLesson = (epubPath, selector) => {
      assert.equal(selector, "Lesson 3");
      return {
        number: 17,
        label: "Lesson 3: Asking the Time",
        type: "lesson",
        firstChapterNumber: 17,
        lastChapterNumber: 18,
        source: "nav",
      };
    };
    const chapterRangeCachePath = (epubHash, first, last) =>
      `/cache/${epubHash}/${first}-${last}.xhtml`;
    const extractChapterRangeToFile = (epubPath, first, last, destPath) => {
      extractRangeCalledWith = { epubPath, first, last, destPath };
      return destPath;
    };
    const extractChapterToFile = () => {
      throw new Error("single-file extract should not be called for a multi-file lesson");
    };
    const assembleCorpusFromChapter = ({ chapterFilePath }) => {
      assert.equal(chapterFilePath, "/cache/hash123/17-18.xhtml");
      return baseEpubCorpus();
    };
    const loadPriorChapterItems = () => [];
    const loadBookConventions = () => "cached conventions";
    const dedupBackward = (items) => ({ items, flagged: [] });
    const flagForwardConcerns = (opts) => {
      flagForwardConcernsCalledWith = opts;
      return { items: opts.candidateItems, flagged: [] };
    };

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--run",
        runDir,
        "--epub",
        "/tmp/book.epub",
        "--lesson",
        "Lesson 3",
        "--lang",
        "Japanese",
      ],
      {
        registerEpub,
        resolveLabelDecoding: () => 1,
        resolveLesson,
        chapterRangeCachePath,
        extractChapterRangeToFile,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        dedupBackward,
        flagForwardConcerns,
        log: () => {},
      },
    );

    assert.deepEqual(
      { first: extractRangeCalledWith.first, last: extractRangeCalledWith.last },
      { first: 17, last: 18 },
    );
    // Forward-flag boundary is the lesson's LAST spine file, so the lesson's own files
    // aren't mistaken for "taught later".
    assert.equal(flagForwardConcernsCalledWith.chapterNumber, 18);

    const written = JSON.parse(await fs.readFile(runPaths(runDir).corpus, "utf-8"));
    assert.equal(written.meta.chapterNumber, 17);
    assert.equal(written.meta.lastChapterNumber, 18);
    assert.equal(written.meta.chapterLabel, "Lesson 3: Asking the Time");
  });
});

test("assemble: --list-lessons prints the book's lessons and exits without assembling", async () => {
  await withTempDir(async (runDir) => {
    const logs = [];
    const listLessons = () => [
      {
        number: 1,
        label: "Cover",
        type: "front-matter",
        firstChapterNumber: 1,
        lastChapterNumber: 1,
      },
      {
        number: 2,
        label: "Lesson 1: Meeting",
        type: "lesson",
        firstChapterNumber: 2,
        lastChapterNumber: 3,
      },
    ];
    const assembleCorpusFromChapter = () => {
      throw new Error("--list-lessons must not assemble anything");
    };

    await runCli(
      ["assemble", "--no-prepare", "--run", runDir, "--epub", "/tmp/book.epub", "--list-lessons"],
      {
        listLessons,
        assembleCorpusFromChapter,
        hashEpubFile: () => "stubhash",
        resolveLabelDecoding: () => 1,
        describeBookCache: () => ({ registered: false, epubHash: "stubhash" }),
        buildShapeReport: () => ({ stub: true }),
        formatShapeReport: () => ["shape report:", "  WARN: something is off"],
        log: (msg) => logs.push(msg),
      },
    );

    assert.ok(logs.some((m) => m.includes("Lesson 1: Meeting") && m.includes("spine 2-3")));
    // The shape report is the half that says whether the book will WORK, so it prints at the
    // same moment as the list a person picks from.
    assert.ok(logs.some((m) => m.includes("WARN: something is off")));
    assert.ok(!existsSync(runPaths(runDir).corpus));
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
    const dedupBackward = (items) => ({ items, flagged: [] });
    const flagForwardConcerns = ({ candidateItems }) => ({ items: candidateItems, flagged: [] });
    const describeChapter = () => "chapter label";

    await runCli(
      [
        "assemble",
        "--no-prepare",
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
        resolveLabelDecoding: () => 1,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        analyzeBookConventions,
        saveBookConventions,
        dedupBackward,
        flagForwardConcerns,
        describeChapter,
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
    const dedupBackward = (items) => ({ items, flagged: [] });
    const flagForwardConcerns = ({ candidateItems }) => ({ items: candidateItems, flagged: [] });
    const describeChapter = () => "chapter label";

    await runCli(
      [
        "assemble",
        "--no-prepare",
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
        resolveLabelDecoding: () => 1,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        analyzeBookConventions,
        saveBookConventions,
        dedupBackward,
        flagForwardConcerns,
        describeChapter,
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
        "--no-prepare",
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
        runCli(
          ["assemble", "--no-prepare", "--run", runDir, "--epub", "/tmp/book.epub", "--lang", "es"],
          {
            log: () => {},
          },
        ),
      /--chapter-number is required/,
    );
  });
});

test("assemble: throws when --epub is given without --lang", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () =>
        runCli(
          [
            "assemble",
            "--no-prepare",
            "--run",
            runDir,
            "--epub",
            "/tmp/book.epub",
            "--chapter-number",
            "1",
          ],
          {
            log: () => {},
          },
        ),
      /--lang is required/,
    );
  });
});

test("assemble: throws when --output-root is given with an unsupported source (--chapter)", async () => {
  await assert.rejects(
    () =>
      runCli(
        [
          "assemble",
          "--no-prepare",
          "--output-root",
          "/tmp/output",
          "--chapter",
          "/tmp/ch.xhtml",
          "--lang",
          "es",
        ],
        {
          log: () => {},
        },
      ),
    /--output-root can only be used with --template, --epub, or --words/,
  );
});

test("assemble: throws when --output-root is given without --chapter-number", async () => {
  await assert.rejects(
    () =>
      runCli(
        [
          "assemble",
          "--no-prepare",
          "--output-root",
          "/tmp/output",
          "--epub",
          "/tmp/book.epub",
          "--lang",
          "es",
        ],
        {
          log: () => {},
        },
      ),
    /--chapter-number is required/,
  );
});

test("assemble: --output-root resolves the run dir via resolveBookSlug/resolveChapterRunDir and writes corpus.json there", async () => {
  await withTempDir(async (outputRoot) => {
    const resolvedRunDir = join(outputRoot, "my-book", "chapter-0");
    const logs = [];

    let resolveBookSlugCalledWith = null;
    let resolveChapterRunDirCalledWith = null;
    let materializeBookCalledWith = null;

    const registerEpub = () => ({ epubHash: "hash123" });
    const resolveBookSlug = (...args) => {
      resolveBookSlugCalledWith = args;
      return "my-book";
    };
    const materializeBookInOutput = (...args) => {
      materializeBookCalledWith = args;
      return join(outputRoot, "my-book", "book.epub");
    };
    const resolveChapterRunDir = (...args) => {
      resolveChapterRunDirCalledWith = args;
      return resolvedRunDir;
    };
    const chapterCachePath = () => "/cache/1.xhtml";
    const extractChapterToFile = (epubPath, chapterNumber, destPath) => destPath;
    const assembleCorpusFromChapter = () => baseEpubCorpus();
    const loadPriorChapterItems = () => [];
    const loadBookConventions = () => "cached conventions";
    const dedupBackward = (items) => ({ items, flagged: [] });
    const flagForwardConcerns = ({ candidateItems }) => ({ items: candidateItems, flagged: [] });
    const describeChapter = () => "Lesson 2: Possession";

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--output-root",
        outputRoot,
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "15",
        "--lang",
        "Japanese",
      ],
      {
        registerEpub,
        resolveLabelDecoding: () => 1,
        resolveBookSlug,
        materializeBookInOutput,
        resolveChapterRunDir,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        dedupBackward,
        flagForwardConcerns,
        describeChapter,
        sortItemsPedagogically: passthroughSort,
        log: (msg) => logs.push(msg),
      },
    );

    assert.deepEqual(resolveBookSlugCalledWith, [outputRoot, "/tmp/book.epub", "hash123"]);
    assert.deepEqual(materializeBookCalledWith, [
      outputRoot,
      "my-book",
      "/tmp/book.epub",
      "hash123",
      "Japanese",
    ]);
    assert.deepEqual(resolveChapterRunDirCalledWith, [outputRoot, "my-book", "hash123", 15]);
    assert.ok(logs.some((msg) => msg.includes(`resolved run directory: ${resolvedRunDir}`)));

    const written = JSON.parse(await fs.readFile(runPaths(resolvedRunDir).corpus, "utf-8"));
    assert.equal(written.meta.epubHash, "hash123");
    assert.equal(written.meta.chapterNumber, 15);
  });
});

test("assemble: --words resolves the run dir via resolveCourseSlug/resolveLessonRunDir and writes corpus.json there", async () => {
  await withTempDir(async (outputRoot) => {
    const wordsPath = join(outputRoot, "words.txt");
    await fs.writeFile(wordsPath, "Good morning\n\nChina\n");

    const resolvedRunDir = join(outputRoot, "my-course", "lesson-0");
    const logs = [];

    let resolveCourseSlugCalledWith = null;
    let resolveLessonRunDirCalledWith = null;
    let assembleCalledWith = null;

    const resolveCourseSlug = (...args) => {
      resolveCourseSlugCalledWith = args;
      return "my-course";
    };
    const resolveLessonRunDir = (...args) => {
      resolveLessonRunDirCalledWith = args;
      return resolvedRunDir;
    };
    const assembleCorpusFromLessonWords = (args) => {
      assembleCalledWith = args;
      return {
        meta: { targetLanguage: "ja", sourceType: "manual", reviewed: false },
        items: [
          {
            id: "good-morning",
            english: "Good morning",
            category: "Greetings",
            target: null,
          },
          {
            id: "china",
            english: "China",
            category: "Nationalities & Countries",
            target: null,
          },
        ],
      };
    };

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--output-root",
        outputRoot,
        "--words",
        wordsPath,
        "--course",
        "Intensive Japanese 1",
        "--lesson-number",
        "1",
        "--lang",
        "ja",
      ],
      {
        resolveCourseSlug,
        resolveLessonRunDir,
        assembleCorpusFromLessonWords,
        sortItemsPedagogically: passthroughSort,
        log: (msg) => logs.push(msg),
      },
    );

    assert.deepEqual(resolveCourseSlugCalledWith, [outputRoot, "Intensive Japanese 1", "ja"]);
    assert.deepEqual(resolveLessonRunDirCalledWith, [outputRoot, "my-course", 1]);
    assert.deepEqual(assembleCalledWith.englishWords, ["Good morning", "China"]);
    assert.equal(assembleCalledWith.targetLanguage, "ja");
    assert.ok(logs.some((msg) => msg.includes(`resolved run directory: ${resolvedRunDir}`)));

    const written = JSON.parse(await fs.readFile(runPaths(resolvedRunDir).corpus, "utf-8"));
    assert.equal(written.meta.courseSlug, "my-course");
    assert.equal(written.meta.chapterNumber, 1);
    assert.equal(written.meta.chapterLabel, "Lesson 1");
  });
});

test("assemble: --words --lesson-label overrides the default 'Lesson <N>' chapterLabel", async () => {
  await withTempDir(async (outputRoot) => {
    const wordsPath = join(outputRoot, "words.txt");
    await fs.writeFile(wordsPath, "Good morning\n");

    const resolvedRunDir = join(outputRoot, "my-course", "lesson-0");

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--output-root",
        outputRoot,
        "--words",
        wordsPath,
        "--course",
        "Intensive Japanese 1",
        "--lesson-number",
        "1",
        "--lesson-label",
        "Lesson 1: Greetings",
        "--lang",
        "ja",
      ],
      {
        resolveCourseSlug: () => "my-course",
        resolveLessonRunDir: () => resolvedRunDir,
        assembleCorpusFromLessonWords: () => ({
          meta: { targetLanguage: "ja", sourceType: "manual", reviewed: false },
          items: [
            {
              id: "good-morning",
              english: "Good morning",
              category: "Greetings",
              target: null,
            },
          ],
        }),
        log: () => {},
      },
    );

    const written = JSON.parse(await fs.readFile(runPaths(resolvedRunDir).corpus, "utf-8"));
    assert.equal(written.meta.chapterLabel, "Lesson 1: Greetings");
  });
});

test("assemble: --words requires --course, --lesson-number, and --lang", async () => {
  await withTempDir(async (outputRoot) => {
    const wordsPath = join(outputRoot, "words.txt");
    await fs.writeFile(wordsPath, "Good morning\n");

    await assert.rejects(
      () =>
        runCli(
          [
            "assemble",
            "--no-prepare",
            "--output-root",
            outputRoot,
            "--words",
            wordsPath,
            "--lang",
            "ja",
          ],
          {
            log: () => {},
          },
        ),
      /--course <name> is required/,
    );

    await assert.rejects(
      () =>
        runCli(
          [
            "assemble",
            "--no-prepare",
            "--output-root",
            outputRoot,
            "--words",
            wordsPath,
            "--course",
            "Intensive Japanese 1",
            "--lang",
            "ja",
          ],
          { log: () => {} },
        ),
      /--lesson-number is required/,
    );
  });
});

test("assemble: logs one line per flagged item for both passes, not just a count", async () => {
  await withTempDir(async (runDir) => {
    const logs = [];

    const registerEpub = () => ({ epubHash: "hash1" });
    const chapterCachePath = () => "/cache/1.xhtml";
    const extractChapterToFile = (epubPath, chapterNumber, destPath) => destPath;
    const assembleCorpusFromChapter = () => ({
      meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: false },
      items: [
        { id: "old-item", english: "Old", category: "Other", target: "古い" },
        { id: "later-item", english: "Later", category: "Other", target: "後で" },
        { id: "keep-item", english: "Keep", category: "Other", target: "保つ" },
      ],
    });
    const loadPriorChapterItems = () => [
      {
        id: "prior",
        english: "Old",
        category: "Other",
        target: "古い",
        __chapterNumber: 1,
        __chapterLabel: "Lesson 1: Meeting",
      },
    ];
    const loadBookConventions = () => "cached conventions";
    const dedupBackward = (items, priorItems) => ({
      items: items.map((item, index) =>
        index === 0
          ? { ...item, uncertain: true, reviewNote: "Possibly already taught — matched Lesson 1" }
          : item,
      ),
      flagged: [{ item: items[0], matchedField: "english", matchedPriorItem: priorItems[0] }],
    });
    const flagForwardConcerns = ({ candidateItems }) => ({
      items: candidateItems.map((item, index) =>
        index === 1
          ? { ...item, uncertain: true, reviewNote: "Possibly premature — taught later" }
          : item,
      ),
      flagged: [
        {
          item: candidateItems[1],
          laterChapter: 5,
          laterChapterLabel: "Lesson 5: Shopping (2)",
          reason: "taught later",
        },
      ],
    });
    const describeChapter = () => "Lesson 2: Possession";

    await runCli(
      [
        "assemble",
        "--no-prepare",
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
        resolveLabelDecoding: () => 1,
        chapterCachePath,
        extractChapterToFile,
        assembleCorpusFromChapter,
        loadPriorChapterItems,
        loadBookConventions,
        dedupBackward,
        flagForwardConcerns,
        describeChapter,
        sortItemsPedagogically: passthroughSort,
        log: (msg) => logs.push(msg),
      },
    );

    assert.ok(
      logs.some(
        (msg) =>
          msg.includes('[dedup:backward] flagged "Old"') && msg.includes("Lesson 1: Meeting"),
      ),
      "expected an individual backward-flag log line naming the item and matched chapter",
    );
    assert.ok(
      logs.some(
        (msg) => msg.includes('[flag:forward] "Later"') && msg.includes("Lesson 5: Shopping (2)"),
      ),
      "expected an individual forward-flag log line naming the item and later chapter",
    );

    const written = JSON.parse(await fs.readFile(runPaths(runDir).corpus, "utf-8"));
    assert.equal(
      written.items.length,
      3,
      "backward dedup never drops — all items stay in the corpus",
    );
    assert.equal(written.items[0].id, "old-item");
    assert.equal(written.items[0].uncertain, true);
    assert.equal(written.items[1].id, "later-item");
    assert.equal(written.items[1].uncertain, true);
    assert.equal(written.items[2].id, "keep-item");
    assert.ok(!written.items[2].uncertain);
    assert.equal(written.meta.chapterLabel, "Lesson 2: Possession");
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

    await runCli(["assemble", "--no-prepare", "--run", runDir, "--template", "travel-essentials"], {
      loadTemplate,
      log: () => {},
    });

    assert.equal(called, false);
  });
});

test("translate: runs on an un-reviewed corpus (the gate moved to audio)", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus({ reviewed: false })));

    const translateCorpus = () => ({ cards: baseCards({ reviewed: false }), errors: [] });
    await runCli(["translate", "--run", runDir], { translateCorpus, log: () => {} });

    assert.ok(existsSync(paths.cards)); // translated despite meta.reviewed === false
  });
});

test("audio: throws when the corpus review has not been marked reviewed yet", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards({ reviewed: false })));

    await assert.rejects(
      () => runCli(["audio", "--run", runDir, "--voice", "voice1"], { log: () => {} }),
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

test("translate: --simple-script passes simpleScript:true through to translateCorpus (else false)", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });

    const run = async (argv) => {
      writeFileSync(paths.corpus, JSON.stringify(baseCorpus()));
      let opts = null;
      const translateCorpus = (_corpus, o) => {
        opts = o;
        return { cards: baseCards(), errors: [] };
      };
      await runCli(argv, { translateCorpus, log: () => {} });
      await fs.rm(paths.cards, { force: true });
      return opts;
    };

    assert.equal((await run(["translate", "--run", runDir, "--simple-script"])).simpleScript, true);
    assert.equal((await run(["translate", "--run", runDir])).simpleScript, false);
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

      const cacheDir = join(libraryHomeDir, "audio", "voice1", TTS_MODEL);
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

test("audio: falls back to the configured default voice for the language when --voice is omitted", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = { ...baseCards(), meta: { ...baseCards().meta, targetLanguage: "ja" } };
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "default-voice-id", TTS_MODEL);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "hola.mp3"), Buffer.from("mp3-bytes"));

      const getDefaultVoice = (code) => {
        assert.equal(code, "ja");
        return "default-voice-id";
      };

      let receivedOpts = null;
      const generateAudio = (cardsArg, opts) => {
        receivedOpts = opts;
        return {
          ...cardsArg,
          items: cardsArg.items.map((item) => ({ ...item, audio: "hola.mp3" })),
        };
      };

      const logs = [];
      await runCli(["audio", "--run", runDir], {
        generateAudio,
        getDefaultVoice,
        libraryHome: () => libraryHomeDir,
        log: (msg) => logs.push(msg),
      });

      assert.equal(receivedOpts.voiceId, "default-voice-id");
      assert.ok(logs.some((msg) => msg.includes("default-voice-id")));
    }),
  );
});

test("audio: an explicit --voice overrides the configured default", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = { ...baseCards(), meta: { ...baseCards().meta, targetLanguage: "ja" } };
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "explicit-voice", TTS_MODEL);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "hola.mp3"), Buffer.from("mp3-bytes"));

      const getDefaultVoice = () => "default-voice-id";
      let receivedOpts = null;
      const generateAudio = (cardsArg, opts) => {
        receivedOpts = opts;
        return {
          ...cardsArg,
          items: cardsArg.items.map((item) => ({ ...item, audio: "hola.mp3" })),
        };
      };

      await runCli(["audio", "--run", runDir, "--voice", "explicit-voice"], {
        generateAudio,
        getDefaultVoice,
        libraryHome: () => libraryHomeDir,
        log: () => {},
      });

      assert.equal(receivedOpts.voiceId, "explicit-voice");
    }),
  );
});

test("audio: still throws when --voice is missing and no default is configured for the language", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.cards, JSON.stringify(baseCards())); // targetLanguage: "es", no default

    await assert.rejects(
      () => runCli(["audio", "--run", runDir], { getDefaultVoice: () => undefined, log: () => {} }),
      /--voice/,
    );
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

function writeChapter(bookDir, seq, { chapterLabel, epubHash, items }) {
  const dir = join(bookDir, `chapter-${seq}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", sourceType: "epub", epubHash, chapterLabel, done: true },
      items,
    }),
  );
  return dir;
}

function writeLesson(courseDir, seq, { chapterLabel, courseSlug, items }) {
  const dir = join(courseDir, `lesson-${seq}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "cards.json"),
    JSON.stringify({
      meta: { targetLanguage: "ja", sourceType: "manual", courseSlug, chapterLabel, done: true },
      items,
    }),
  );
  return dir;
}

test("deck --book-dir: discovers chapter-*/cards.json in seq order and merges via buildBookDeck", async () => {
  await withTempDir(async (bookDir) => {
    writeChapter(bookDir, 0, {
      chapterLabel: "Lesson 1: Meeting",
      epubHash: "hash123",
      items: [{ id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" }],
    });
    writeChapter(bookDir, 1, {
      chapterLabel: "Lesson 2: Possession",
      epubHash: "hash123",
      items: [{ id: "a2", english: "Pen", category: "Objects", target: "ペン" }],
    });

    let receivedChapterDecks = null;
    let receivedOpts = null;
    const buildBookDeck = (chapterDecks, opts) => {
      receivedChapterDecks = chapterDecks;
      receivedOpts = opts;
      return { outPath: opts.outPath, noteCount: 2, chapterCount: 2, mediaCount: 0 };
    };
    const loadBookMeta = (epubHash) => {
      assert.equal(epubHash, "hash123");
      return { title: "Japanese for Busy People", slug: "japanese-for-busy-people" };
    };

    await runCli(["deck", "--book-dir", bookDir], { buildBookDeck, loadBookMeta, log: () => {} });

    assert.equal(receivedChapterDecks.length, 2);
    assert.equal(receivedChapterDecks[0].name, "Lesson 1: Meeting");
    assert.equal(receivedChapterDecks[1].name, "Lesson 2: Possession");
    assert.equal(receivedOpts.bookName, "Japanese for Busy People");
    assert.equal(receivedOpts.outPath, deckPathForDir(bookDir));
  });
});

test("deck --book-dir: throws when no chapter-*/ directories exist", async () => {
  await withTempDir(async (bookDir) => {
    mkdirSync(bookDir, { recursive: true });
    await assert.rejects(
      () => runCli(["deck", "--book-dir", bookDir], { log: () => {} }),
      /no chapter-\*\/ or lesson-\*\/ directories found/,
    );
  });
});

test("deck --book-dir: throws when no lesson is finished (a chapter with no cards.json is skipped)", async () => {
  await withTempDir(async (bookDir) => {
    mkdirSync(join(bookDir, "chapter-0"), { recursive: true });
    await assert.rejects(
      () => runCli(["deck", "--book-dir", bookDir], { log: () => {} }),
      /no finished lessons to build/,
    );
  });
});

test("deck --book-dir: always rebuilds, even when deck.apkg already exists", async () => {
  await withTempDir(async (bookDir) => {
    writeChapter(bookDir, 0, {
      chapterLabel: "Lesson 1",
      epubHash: "hash123",
      items: [{ id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" }],
    });
    writeFileSync(deckPathForDir(bookDir), Buffer.from("stale-apkg"));

    let called = false;
    const buildBookDeck = (chapterDecks, opts) => {
      called = true;
      return { outPath: opts.outPath, noteCount: 1, chapterCount: 1, mediaCount: 0 };
    };
    const loadBookMeta = () => null;

    await runCli(["deck", "--book-dir", bookDir], { buildBookDeck, loadBookMeta, log: () => {} });

    assert.equal(called, true, "buildBookDeck must run even though deck.apkg already existed");
  });
});

test("deck --book-dir: falls back to --name then a generic string when no book title is found", async () => {
  await withTempDir(async (bookDir) => {
    writeChapter(bookDir, 0, {
      chapterLabel: "Lesson 1",
      epubHash: null,
      items: [{ id: "a1", english: "Hello", category: "Greetings", target: "こんにちは" }],
    });

    let receivedBookName = null;
    const buildBookDeck = (chapterDecks, opts) => {
      receivedBookName = opts.bookName;
      return { outPath: opts.outPath, noteCount: 1, chapterCount: 1, mediaCount: 0 };
    };

    await runCli(["deck", "--book-dir", bookDir, "--name", "Custom Name"], {
      buildBookDeck,
      log: () => {},
    });
    assert.equal(receivedBookName, "Custom Name");
  });
});

test("deck --book-dir: discovers lesson-*/cards.json in seq order and uses the course name via loadCourseMeta", async () => {
  await withTempDir(async (courseDir) => {
    writeLesson(courseDir, 0, {
      chapterLabel: "Lesson 1",
      courseSlug: "intensive-japanese-1",
      items: [{ id: "a1", english: "Good morning", category: "Greetings", target: "おはよう" }],
    });
    writeLesson(courseDir, 1, {
      chapterLabel: "Lesson 2",
      courseSlug: "intensive-japanese-1",
      items: [
        { id: "a2", english: "China", category: "Nationalities & Countries", target: "ちゅうごく" },
      ],
    });

    let receivedChapterDecks = null;
    let receivedOpts = null;
    const buildBookDeck = (chapterDecks, opts) => {
      receivedChapterDecks = chapterDecks;
      receivedOpts = opts;
      return { outPath: opts.outPath, noteCount: 2, chapterCount: 2, mediaCount: 0 };
    };
    const loadCourseMeta = (dir) => {
      assert.equal(dir, courseDir);
      return { name: "Intensive Japanese 1", targetLanguage: "ja" };
    };

    await runCli(["deck", "--book-dir", courseDir], {
      buildBookDeck,
      loadCourseMeta,
      log: () => {},
    });

    assert.equal(receivedChapterDecks.length, 2);
    assert.equal(receivedChapterDecks[0].name, "Lesson 1");
    assert.equal(receivedChapterDecks[1].name, "Lesson 2");
    assert.equal(receivedOpts.bookName, "Intensive Japanese 1");
  });
});

test("audio: copies the default clip into the run dir and writes no legacy alt field", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = { ...baseCards(), meta: { ...baseCards().meta, targetLanguage: "ja" } };
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "voice1", TTS_MODEL);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "def.mp3"), Buffer.from("default"));

      let receivedOpts = null;
      const generateAudio = (cardsArg, opts) => {
        receivedOpts = opts;
        return {
          ...cardsArg,
          items: cardsArg.items.map((item) => ({ ...item, audio: "def.mp3" })),
        };
      };

      await runCli(["audio", "--run", runDir, "--voice", "voice1"], {
        generateAudio,
        libraryHome: () => libraryHomeDir,
        log: () => {},
      });

      // The stage no longer threads an alt-audio transform: the with-。 / no-。 pair is gone, and the
      // 。 now lives inside the end marker (src/audio/ttsMarker.js).
      assert.equal("getAltTransform" in receivedOpts, false);
      // only the default clip lands in the run's audio dir; no legacy altAudio field is written
      assert(existsSync(join(paths.audio, "def.mp3")));
      const written = JSON.parse(await fs.readFile(paths.cards, "utf-8"));
      assert.equal(written.items[0].audio, "def.mp3");
      assert.equal("altAudio" in written.items[0], false);
    }),
  );
});

test("restyle-font: applies the language font and writes the output apkg", async () => {
  await withTempDir(async (dir) => {
    const input = join(dir, "in.apkg");
    writeFileSync(input, Buffer.from("original-apkg-bytes"));
    const out = join(dir, "out.apkg");

    let received = null;
    await runCli(["restyle-font", "--apkg", input, "--lang", "ja", "--out", out], {
      getLanguageFont: (code) =>
        code === "ja" ? { family: "Klee One", mediaName: "_k.woff2" } : undefined,
      readFontBytes: () => Buffer.from("FONT"),
      restyleApkgBuffer: (buf, desc, font) => {
        received = { input: buf.toString(), family: desc.family, font: font.toString() };
        return Buffer.from("restyled-apkg-bytes");
      },
      log: () => {},
    });

    assert.equal(existsSync(out), true);
    assert.equal(await fs.readFile(out, "utf-8"), "restyled-apkg-bytes");
    assert.equal(received.input, "original-apkg-bytes");
    assert.equal(received.family, "Klee One");
    assert.equal(received.font, "FONT");
  });
});

test("restyle-font: errors when the language has no configured font", async () => {
  await withTempDir(async (dir) => {
    const input = join(dir, "in.apkg");
    writeFileSync(input, Buffer.from("x"));
    await assert.rejects(
      () =>
        runCli(["restyle-font", "--apkg", input, "--lang", "en"], {
          getLanguageFont: () => undefined,
          log: () => {},
        }),
      /no deck font is configured/,
    );
  });
});

// The audio stage reads cards.json, spends minutes on ElevenLabs, then writes back. The
// dashboard is editable during exactly that window, so writing the stale in-memory object
// would silently discard whatever the reviewer did while it ran. It must merge instead.
test("audio: preserves dashboard edits made while the stage was running", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = baseCards();
      cards.items.push({
        id: "a2",
        english: "Goodbye",
        category: "Greetings",
        target: "Adios",
        pronunciation: "ah-DYOS",
      });
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "voice1", TTS_MODEL);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "hola.mp3"), Buffer.from("mp3-bytes"));

      const generateAudio = (input) => {
        // Stand in for the reviewer excluding a card and fixing a translation in the dashboard
        // while ElevenLabs is still working.
        const onDisk = JSON.parse(readFileSync(paths.cards, "utf-8"));
        onDisk.items[0].excluded = true;
        onDisk.items[0].target = "edited-in-dashboard";
        writeFileSync(paths.cards, JSON.stringify(onDisk));

        return { ...input, items: input.items.map((item) => ({ ...item, audio: "hola.mp3" })) };
      };

      await runCli(["audio", "--run", runDir, "--voice", "voice1"], {
        generateAudio,
        libraryHome: () => libraryHomeDir,
        log: () => {},
      });

      const written = JSON.parse(await fs.readFile(paths.cards, "utf-8"));
      assert.equal(written.items[0].excluded, true, "the exclude made mid-stage must survive");
      assert.equal(
        written.items[0].target,
        "edited-in-dashboard",
        "the inline edit made mid-stage must survive",
      );
      // The stage read `cards` before that exclude landed, so it generated a clip for a card the
      // reviewer has since dropped. The merge reads the exclusion off DISK, so the clip is discarded
      // rather than reinstated on a card that ships nothing.
      assert.equal(
        "audio" in written.items[0],
        false,
        "a card excluded mid-stage gets no audio written back",
      );
      assert.equal(written.items[1].audio, "hola.mp3", "and the generated audio must still land");
    }),
  );
});

// ---------------------------------------------------------------------------
// `prepare` — everything between assemble and the first human review, as ONE stage.
// ---------------------------------------------------------------------------

// Stubs for the four passes prepare runs, recording the order they fire in.
function prepareDeps(calls, overrides = {}) {
  return {
    // Mirrors the real stage: cards.json inherits the corpus's meta verbatim.
    translateCorpus: (corpus) => {
      calls.push("translate");
      return {
        cards: { meta: corpus.meta, items: baseCards({ reviewed: false }).items },
        errors: [],
      };
    },
    mineFillInBlankCards: ({ items }) => {
      calls.push("fib");
      const added = [
        {
          id: "fib-1",
          english: "Practice.",
          category: "Greetings",
          target: "Practica",
          pronunciation: "prak-TEE-ka",
          fillInBlank: true,
          aiSuggested: true,
        },
      ];
      return { items: [...items, ...added], added, patterns: { "fib-1": "[verb]" } };
    },
    dedupeByPattern: ({ items }) => {
      calls.push("dedup");
      return { items, excluded: [] };
    },
    enhanceRunDirNotes: () => {
      calls.push("notes");
      return { changed: 1 };
    },
    lessonSiblings: () => [],
    log: () => {},
    ...overrides,
  };
}

test("assemble chains straight into prepare — no un-translated resting state", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    const calls = [];
    await runCli(["assemble", "--run", runDir, "--chapter", "/tmp/ch.xhtml", "--lang", "ja"], {
      assembleCorpusFromChapter: () => baseEpubCorpus(),
      ...prepareDeps(calls),
    });

    assert.ok(existsSync(paths.corpus));
    assert.ok(existsSync(paths.cards)); // reviewable, not just assembled
    assert.deepEqual(calls, ["translate", "fib", "dedup", "notes"]);
  });
});

test("assemble --no-prepare stops at corpus.json and says the lesson isn't reviewable", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    const calls = [];
    const logged = [];
    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--run",
        runDir,
        "--template",
        "travel-essentials",
        "--lang",
        "es",
      ],
      {
        loadTemplate: () => baseCorpus({ reviewed: false }),
        ...prepareDeps(calls),
        log: (line) => logged.push(line),
      },
    );

    assert.ok(existsSync(paths.corpus));
    assert.equal(existsSync(paths.cards), false);
    assert.deepEqual(calls, []);
    assert.match(logged.join("\n"), /NOT reviewable yet/);
  });
});

test("re-running assemble on an unfinished lesson resumes it through prepare", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    // The exact state a stopped build leaves behind: corpus.json, no cards.json.
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    const calls = [];
    let assembled = false;
    await runCli(["assemble", "--run", runDir, "--chapter", "/tmp/ch.xhtml", "--lang", "ja"], {
      assembleCorpusFromChapter: () => {
        assembled = true;
        return baseEpubCorpus();
      },
      ...prepareDeps(calls),
    });

    assert.equal(assembled, false); // the corpus is reused, not re-extracted
    assert.ok(existsSync(paths.cards));
    assert.deepEqual(calls, ["translate", "fib", "dedup", "notes"]);
  });
});

test("prepare: marks each pass done so a re-run resumes instead of re-spending model calls", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    const calls = [];
    await runCli(["prepare", "--run", runDir], prepareDeps(calls));
    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.meta.enriched, true);
    assert.equal(cards.meta.notesEnhanced, true);
    assert.deepEqual(calls, ["translate", "fib", "dedup", "notes"]);

    calls.length = 0;
    await runCli(["prepare", "--run", runDir], prepareDeps(calls));
    assert.deepEqual(calls, []); // translate skips on cards.json; the rest on their meta markers
  });
});

test("translate: re-sorts a generated-target source once targets exist; leaves epub order alone", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    const corpus = {
      meta: { targetLanguage: "ja", sourceType: "manual" },
      items: [
        { id: "a", english: "A", category: "Greetings", hint: null, target: null },
        { id: "b", english: "B", category: "Greetings", hint: null, target: null },
      ],
    };
    writeFileSync(paths.corpus, JSON.stringify(corpus));

    let sortedWith = null;
    await runCli(["translate", "--run", runDir], {
      translateCorpus: (c) => ({
        cards: {
          meta: c.meta,
          items: [
            { id: "a", english: "A", category: "Greetings", target: "あ" },
            { id: "b", english: "B", category: "Greetings", target: "ぼ" },
          ],
        },
        errors: [],
      }),
      sortItemsPedagogically: ({ items }) => {
        sortedWith = items.map((i) => i.target);
        return { items: [...items].reverse(), changed: true };
      },
    });

    // The sort ran AFTER translation, over the real targets, and its order was written.
    assert.deepEqual(sortedWith, ["あ", "ぼ"]);
    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.deepEqual(
      cards.items.map((i) => i.id),
      ["b", "a"],
    );
  });
});

test("translate: an epub source is NOT re-sorted (its assemble-time sort saw the targets)", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    let sortCalled = false;
    await runCli(["translate", "--run", runDir], {
      translateCorpus: (c) => ({
        cards: { meta: c.meta, items: baseCards({ reviewed: false }).items },
        errors: [],
      }),
      sortItemsPedagogically: () => {
        sortCalled = true;
        return { items: [], changed: false };
      },
    });

    assert.equal(sortCalled, false);
  });
});

test("translate: records failed items on cards.json and a re-run retries ONLY that subset", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    const corpus = baseEpubCorpus();
    corpus.items = [
      { id: "a", english: "A", category: "Greetings", hint: null, target: null },
      { id: "b", english: "B", category: "Greetings", hint: null, target: null },
    ];
    writeFileSync(paths.corpus, JSON.stringify(corpus));

    // First run: "b" fails to translate.
    await runCli(["translate", "--run", runDir], {
      translateCorpus: (c) => ({
        cards: {
          meta: c.meta,
          items: [{ id: "a", english: "A", category: "Greetings", target: "あ" }],
        },
        errors: [{ id: "b", error: "missing an entry" }],
      }),
    });

    let cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.deepEqual(cards.meta.translateErrors, [{ id: "b", error: "missing an entry" }]);

    // Re-run: only "b" is sent, the recovered card merges in at its corpus position,
    // and the error record clears.
    const sentIds = [];
    await runCli(["translate", "--run", runDir], {
      translateCorpus: (c) => {
        sentIds.push(...c.items.map((i) => i.id));
        return {
          cards: {
            meta: c.meta,
            items: [{ id: "b", english: "B", category: "Greetings", target: "ぼ" }],
          },
          errors: [],
        };
      },
    });

    assert.deepEqual(sentIds, ["b"]);
    cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.meta.translateErrors, undefined);
    assert.deepEqual(
      cards.items.map((i) => i.id),
      ["a", "b"],
    );
  });
});

test("prepare: stops before enrichment while translate errors remain", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    const calls = [];
    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      translateCorpus: (c) => {
        calls.push("translate");
        return {
          cards: { meta: c.meta, items: [] },
          errors: [{ id: "hello", error: "not valid JSON" }],
        };
      },
      log: (line) => logged.push(line),
    });

    // Only translate ran; the enrichment passes never fired and no markers were written.
    assert.deepEqual(calls, ["translate"]);
    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.meta.enriched, undefined);
    assert.equal(cards.meta.notesEnhanced, undefined);
    assert.match(logged.join("\n"), /prepare: stopping/);
  });
});

test("prepare: a FAILED mining pass leaves enriched unset, so a re-run retries it", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    const calls = [];
    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      mineFillInBlankCards: ({ items }) => {
        calls.push("fib");
        return { items, added: [], patterns: {}, failed: true };
      },
      log: (line) => logged.push(line),
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.meta.enriched, undefined); // NOT frozen in as done
    assert.equal(cards.meta.notesEnhanced, true); // the notes pass still ran and completed
    assert.match(logged.join("\n"), /marker left unset/);

    // The re-run retries mining (and only mining — notes are already marked).
    calls.length = 0;
    await runCli(["prepare", "--run", runDir], prepareDeps(calls));
    assert.deepEqual(calls, ["fib", "dedup"]);
    const after = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(after.meta.enriched, true);
  });
});

test("prepare: a failed pass makes the closing line say NOT ready, and name it", async () => {
  // Lesson 15 of the Japanese book was built while five model passes were failing on a usage limit.
  // The markers were all correct and the dashboard correctly withheld Mark reviewed, but prepare
  // still signed off with "is ready for the corpus review", so the only surface an operator reads
  // said the opposite of the truth. Gate 1 has to see the FINAL card set, and a lesson missing its
  // drill mining does not have one.
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    const calls = [];
    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      mineFillInBlankCards: ({ items }) => {
        calls.push("fib");
        return { items, added: [], patterns: {}, failed: true };
      },
      enhanceRunDirNotes: () => {
        calls.push("notes");
        return { changed: 0, failed: true };
      },
      log: (line) => logged.push(line),
    });

    const out = logged.join("\n");
    assert.match(out, /is NOT ready for the corpus review/);
    assert.match(out, /fill-in-the-blank/, "names the pass that failed");
    assert.match(out, /cross-lesson notes/, "names the other one");
    assert.match(out, /anki-builder prepare --run/, "gives the command that retries them");
    assert.doesNotMatch(out, /is ready for the corpus review/, "must not also claim it is ready");

    // And the happy path still signs off, or this fix would have broken every normal build.
    calls.length = 0;
    logged.length = 0;
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      log: (l) => logged.push(l),
    });
    assert.match(logged.join("\n"), /is ready for the corpus review/);
  });
});

test("prepare: a FAILED notes pass leaves notesEnhanced unset, so a re-run retries it", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    const calls = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      enhanceRunDirNotes: () => {
        calls.push("notes");
        return { changed: 0, failed: true };
      },
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.meta.enriched, true);
    assert.equal(cards.meta.notesEnhanced, undefined); // NOT frozen in as done

    calls.length = 0;
    await runCli(["prepare", "--run", runDir], prepareDeps(calls));
    assert.deepEqual(calls, ["notes"]);
    const after = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(after.meta.notesEnhanced, true);
  });
});

test("prepare: leaves a lesson that has already been reviewed completely alone", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus()));
    writeFileSync(paths.cards, JSON.stringify(baseCards({ reviewed: true })));

    const calls = [];
    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      log: (line) => logged.push(line),
    });

    // Growing or rewriting a signed-off card set is the one thing this stage must never do.
    assert.deepEqual(calls, []);
    assert.match(logged.join("\n"), /already marked reviewed/);
  });
});

test("prepare: skips drills and notes for a template (no drills to mine, no sibling lessons)", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseCorpus({ reviewed: false })));

    const calls = [];
    await runCli(["prepare", "--run", runDir], prepareDeps(calls));
    assert.deepEqual(calls, ["translate"]);
  });
});

test("prepare: throws when there's no corpus to prepare", async () => {
  await withTempDir(async (runDir) => {
    await assert.rejects(
      () => runCli(["prepare", "--run", runDir], prepareDeps([])),
      /corpus\.json not found/,
    );
  });
});

test("prepare: keeps its claim when it fails, so a crash reads as interrupted", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(baseEpubCorpus()));

    await assert.rejects(
      () =>
        runCli(["prepare", "--run", runDir], {
          ...prepareDeps([]),
          translateCorpus: () => {
            throw new Error("boom");
          },
        }),
      /boom/,
    );
    assert.ok(existsSync(join(runDir, "claim.json")));
  });
});

// A sibling scan result shaped like lessonSiblings returns. `hasCards: false` is the case that
// matters: an earlier lesson that stopped at assemble is invisible to the drill and note passes.
function sibling(name, number, { hasCards = true, reviewed = false, items = [] } = {}) {
  return {
    file: `${name}/cards.json`,
    name,
    number,
    label: `Lesson ${number}`,
    hasCards,
    reviewed,
    done: false,
    data: hasCards ? { meta: {}, items } : null,
  };
}

// The lesson under test in these is "chapter-1", chapterNumber 2 (see baseEpubCorpus).
const epubCorpusNumbered = () => ({
  meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: false, chapterNumber: 2 },
  items: [{ id: "hello", english: "Hello", category: "Greetings", target: "こんにちは" }],
});

test("prepare: leaves the enrichment markers unset when an earlier lesson has no cards.json", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-1");
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(epubCorpusNumbered()));

    const calls = [];
    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      lessonSiblings: () => [sibling("chapter-0", 1, { hasCards: false }), sibling("chapter-1", 2)],
      log: (line) => logged.push(line),
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    // Both passes ran — they fail open, not closed — but neither is marked done, so a later run redoes them.
    assert.deepEqual(calls, ["translate", "fib", "dedup", "notes"]);
    assert.equal(cards.meta.enriched, undefined);
    assert.equal(cards.meta.notesEnhanced, undefined);
    assert.equal(cards.meta.prepareDegraded.reason, "degraded");
    assert.deepEqual(cards.meta.prepareDegraded.missing, ["chapter-0"]);
    assert.match(logged.join("\n"), /WARNING — 1 earlier lesson\(s\)/);
  });
});

test("prepare: a repaired re-run redoes both passes without doubling the drill block", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-1");
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(epubCorpusNumbered()));

    // First run: the earlier lesson isn't prepared yet.
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps([]),
      lessonSiblings: () => [sibling("chapter-0", 1, { hasCards: false }), sibling("chapter-1", 2)],
    });
    const first = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(first.items.filter((i) => i.fillInBlank).length, 1);

    // Second run: chapter-0 has since been prepared.
    const calls = [];
    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps(calls),
      lessonSiblings: () => [sibling("chapter-0", 1), sibling("chapter-1", 2)],
      log: (line) => logged.push(line),
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.deepEqual(calls, ["fib", "dedup", "notes"]); // translate skips: cards.json exists
    assert.equal(cards.meta.enriched, true);
    assert.equal(cards.meta.notesEnhanced, true);
    assert.equal(cards.meta.prepareDegraded, undefined);
    assert.equal(
      cards.items.filter((i) => i.fillInBlank).length,
      1,
      "the thin run's drills must be replaced, not appended to",
    );
    assert.match(logged.join("\n"), /dropped 1 unmarked practice card/);
  });
});

test("prepare: a genuine first lesson is marked done — an empty sibling list is not 'degraded'", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-0");
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(epubCorpusNumbered()));

    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps([]),
      lessonSiblings: () => [sibling("chapter-0", 2)],
      log: (line) => logged.push(line),
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.meta.enriched, true);
    assert.equal(cards.meta.notesEnhanced, true);
    assert.equal(cards.meta.prepareDegraded, undefined);
    assert.match(logged.join("\n"), /no earlier lessons/);
  });
});

// The de-dup library is written by the dashboard's "Mark reviewed", not by a build, so a lesson's
// backward de-dup can only see lessons that have been SIGNED OFF. Building out of order degrades it
// silently, and nothing in the output afterwards says so — hence the warning.
test("assemble: warns when an earlier lesson of the book is not marked reviewed", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-2");
    mkdirSync(runDir, { recursive: true });
    const logged = [];

    await runCli(
      [
        "assemble",
        "--no-prepare",
        "--output-root",
        parent,
        "--epub",
        "/tmp/book.epub",
        "--chapter-number",
        "9",
        "--lang",
        "ja",
      ],
      {
        registerEpub: () => ({ epubHash: "hash" }),
        resolveLabelDecoding: () => 1,
        resolveBookSlug: () => "book",
        materializeBookInOutput: () => {},
        resolveChapterRunDir: () => runDir,
        assembleCorpusFromChapter: () => baseEpubCorpus(),
        loadBookConventions: () => "conventions",
        chapterCachePath: () => join(parent, "cache.xhtml"),
        extractChapterToFile: () => join(parent, "cache.xhtml"),
        describeChapter: () => "Lesson 9",
        loadPriorChapterItems: () => [],
        dedupBackward: (items) => ({ items, flagged: [] }),
        flagForwardConcerns: ({ candidateItems }) => ({ items: candidateItems, flagged: [] }),
        sortItemsPedagogically: passthroughSort,
        lessonSiblings: () => [
          sibling("chapter-0", 7, { reviewed: true }),
          sibling("chapter-1", 8),
          sibling("chapter-2", 9, { hasCards: false }),
        ],
        log: (line) => logged.push(line),
      },
    );

    const out = logged.join("\n");
    assert.match(out, /WARNING — 1 earlier lesson\(s\)/);
    assert.match(out, /Lesson 8 \(chapter-1\)/);
    assert.doesNotMatch(out, /Lesson 7/, "an already-reviewed lesson must not be reported");
  });
});

test("assemble: says nothing about ordering for a template", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "templates", "t", "es");
    const logged = [];
    await runCli(
      ["assemble", "--no-prepare", "--output-root", parent, "--template", "t", "--lang", "es"],
      {
        resolveTemplateRunDir: () => runDir,
        loadTemplate: () => baseCorpus({ reviewed: false }),
        lessonSiblings: () => {
          throw new Error("a template has no book directory to scan");
        },
        log: (line) => logged.push(line),
      },
    );
    assert.doesNotMatch(logged.join("\n"), /WARNING/);
  });
});

// A lesson built before the enrichment markers existed has drills but no `enriched` flag, so the
// next prepare re-mines. Without dropping first, it would end up with two drill blocks.
test("prepare: a lesson with unmarked drills is re-mined, not stacked on", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-1");
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(epubCorpusNumbered()));
    // Exactly the legacy shape: drills present, no enriched marker, no prepareDegraded.
    writeFileSync(
      paths.cards,
      JSON.stringify({
        meta: { targetLanguage: "Japanese", sourceType: "epub", reviewed: false, chapterNumber: 2 },
        items: [
          { id: "a", english: "One", category: "Numbers", target: "いち", pronunciation: "ichi" },
          {
            id: "old-fib",
            english: "Old drill.",
            category: "Numbers",
            target: "ふるい",
            pronunciation: "furui",
            fillInBlank: true,
          },
        ],
      }),
    );

    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps([]),
      lessonSiblings: () => [sibling("chapter-0", 1), sibling("chapter-1", 2)],
      log: (line) => logged.push(line),
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    const drills = cards.items.filter((i) => i.fillInBlank);
    assert.equal(drills.length, 1, "one drill block, not two");
    assert.equal(drills[0].id, "fib-1", "the freshly mined drill, not the legacy one");
    assert.match(logged.join("\n"), /dropped 1 unmarked practice card/);
  });
});

// The failure this guards: seven Lesson 7 cards had a numeral and no `ttsText`, so `speechText` sent
// "2025ねんに" to ElevenLabs, which reads digits in whatever language it likes. The rule was in the
// extraction prompt and nowhere else, so nothing caught it until the clips were listened to.
test("audio: refuses to send a raw numeral to TTS, before spending anything", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      paths.cards,
      JSON.stringify({
        meta: { targetLanguage: "ja", sourceType: "epub", reviewed: true },
        items: [
          {
            id: "ok",
            english: "Hello",
            category: "Greetings",
            target: "こんにちは",
            pronunciation: "konnichiwa",
          },
          {
            id: "bad",
            english: "In 2025",
            category: "Other",
            target: "2025ねんに",
            pronunciation: "2025-nen ni",
          },
        ],
      }),
    );

    let fetched = false;
    await assert.rejects(
      () =>
        runCli(["audio", "--run", runDir, "--voice", "v1"], {
          fetchTts: async () => {
            fetched = true;
            return Buffer.from("CLIP");
          },
          log: () => {},
        }),
      /would send a raw numeral/,
    );
    assert.equal(fetched, false, "it must refuse before any TTS call");
  });
});

test("audio: a spelled-out ttsText satisfies the guard", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      paths.cards,
      JSON.stringify({
        meta: { targetLanguage: "ja", sourceType: "epub", reviewed: true },
        items: [
          {
            id: "ok",
            english: "In 2025",
            category: "Other",
            target: "2025ねんに",
            ttsText: "にせんにじゅうごねんに",
            pronunciation: "nisen nijūgo nen ni",
          },
        ],
      }),
    );
    const originalKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
    try {
      await runCli(["audio", "--run", runDir, "--voice", "v1"], {
        fetchTts: async () => Buffer.from("CLIP"),
        log: () => {},
      });
    } finally {
      if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
      else process.env.ELEVENLABS_API_KEY = originalKey;
    }
    assert.equal(
      JSON.parse(readFileSync(paths.cards, "utf-8")).items[0].audio?.endsWith(".mp3"),
      true,
    );
  });
});

test("prepare: spells out a numeral automatically rather than leaving it for the reviewer", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-1");
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(epubCorpusNumbered()));
    writeFileSync(
      paths.cards,
      JSON.stringify({
        meta: { targetLanguage: "ja", sourceType: "epub", reviewed: false, chapterNumber: 2 },
        items: [
          {
            id: "y",
            english: "In 2025",
            category: "Other",
            target: "2025ねんに",
            pronunciation: "2025-nen ni",
          },
        ],
      }),
    );

    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps([]),
      lessonSiblings: () => [sibling("chapter-1", 2)],
      fillNumberReadings: ({ items }) => {
        items[0].ttsText = "にせんにじゅうごねんに";
        items[0].pronunciation = "nisen nijūgonen ni";
        items[0].uncertain = true;
        return {
          items,
          fixed: [
            {
              id: "y",
              target: "2025ねんに",
              ttsText: items[0].ttsText,
              pronunciation: items[0].pronunciation,
            },
          ],
          remaining: [],
        };
      },
      log: (line) => logged.push(line),
    });

    const cards = JSON.parse(readFileSync(paths.cards, "utf-8"));
    assert.equal(cards.items[0].ttsText, "にせんにじゅうごねんに");
    assert.equal(cards.items[0].pronunciation, "nisen nijūgonen ni");
    assert.match(logged.join("\n"), /number readings: filled 1 card/);
    assert.doesNotMatch(logged.join("\n"), /WARNING/);
  });
});

test("prepare: warns about a numeral the auto-fix could not resolve", async () => {
  await withTempDir(async (parent) => {
    const runDir = join(parent, "chapter-1");
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(paths.corpus, JSON.stringify(epubCorpusNumbered()));
    writeFileSync(
      paths.cards,
      JSON.stringify({
        meta: { targetLanguage: "ja", sourceType: "epub", reviewed: false, chapterNumber: 2 },
        items: [
          {
            id: "y",
            english: "In 2025",
            category: "Other",
            target: "2025ねんに",
            pronunciation: "2025-nen ni",
          },
        ],
      }),
    );

    const logged = [];
    await runCli(["prepare", "--run", runDir], {
      ...prepareDeps([]),
      lessonSiblings: () => [sibling("chapter-1", 2)],
      // The fail-open case: the pass ran and could not resolve it.
      fillNumberReadings: ({ items }) => ({
        items,
        fixed: [],
        remaining: [{ id: "y", target: "2025ねんに", cause: "no ttsText" }],
      }),
      log: (line) => logged.push(line),
    });
    assert.match(logged.join("\n"), /WARNING — 1 card\(s\) still have a numeral/);
  });
});

// generateAudio removes `audio` from an excluded card. The merge used to write `audio: null` back in
// its place, which the cards schema rejects — so the NEXT write to that lesson failed validation and
// Mark done, exclude and every inline edit stopped working on it.
test("audio: an excluded card ends with no audio key, not a null one", async () => {
  await withTempDir(async (runDir) => {
    const paths = runPaths(runDir);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      paths.cards,
      JSON.stringify({
        meta: { targetLanguage: "ja", sourceType: "epub", reviewed: true },
        items: [
          {
            id: "dropped",
            english: "Ah",
            category: "Other",
            target: "あ",
            pronunciation: "a",
            excluded: true,
            audio: "stale.mp3",
          },
          {
            id: "kept",
            english: "Hello",
            category: "Greetings",
            target: "こんにちは",
            pronunciation: "konnichiwa",
          },
        ],
      }),
    );

    const originalKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
    try {
      await runCli(["audio", "--run", runDir, "--voice", "v1"], {
        fetchTts: async () => Buffer.from("CLIP"),
        log: () => {},
      });
    } finally {
      if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
      else process.env.ELEVENLABS_API_KEY = originalKey;
    }

    const written = JSON.parse(readFileSync(paths.cards, "utf-8"));
    const dropped = written.items.find((i) => i.id === "dropped");
    assert.equal("audio" in dropped, false, "an excluded card must have no audio key at all");
    assert.equal(typeof written.items.find((i) => i.id === "kept").audio, "string");
    // The whole point: the file must still be writable afterwards.
    assert.doesNotThrow(() => validateCards(written));
  });
});

test("epub cache: reports a book's cached artifacts and clears nothing without --clear", async () => {
  const logs = [];
  let cleared = null;

  await runCli(["epub", "cache", "abc123"], {
    describeBookCache: () => ({
      registered: true,
      epubHash: "abc123",
      dir: "/lib/epubs/abc123",
      cacheVersion: 2,
      chapters: { present: true, files: 12, generatedAt: "2026-07-01T10:00:00.000Z" },
      conventions: { present: true, generatedAt: "2026-07-14T09:00:00.000Z" },
      taughtIndex: { present: false },
      reviewedCorpora: 5,
      staleRoots: [],
    }),
    clearBookCache: (...args) => {
      cleared = args;
      return [];
    },
    log: (msg) => logs.push(msg),
  });

  assert.ok(logs.some((m) => m.includes("cache version: v2")));
  assert.ok(logs.some((m) => m.includes("conventions.md: generated 2026-07-14")));
  assert.ok(logs.some((m) => m.includes("reviewed corpora: 5")));
  assert.equal(cleared, null, "reporting must never delete");
});

test("epub cache --clear defaults to the free chapter cache, never the paid artifacts", async () => {
  const logs = [];
  let kinds = null;

  await runCli(["epub", "cache", "--clear", "abc123"], {
    describeBookCache: () => ({
      registered: true,
      epubHash: "abc123",
      dir: "/lib/epubs/abc123",
      cacheVersion: 2,
      chapters: { present: true, files: 3, generatedAt: null },
      conventions: { present: true, generatedAt: "2026-07-14T09:00:00.000Z" },
      taughtIndex: { present: true, generatedAt: "2026-07-14T09:00:00.000Z" },
      reviewedCorpora: 5,
      staleRoots: [],
    }),
    clearBookCache: (hash, options) => {
      kinds = options.kinds;
      return ["/lib/epubs/abc123/cache-v2"];
    },
    log: (msg) => logs.push(msg),
  });

  assert.deepEqual(kinds, ["chapters"]);
  assert.ok(logs.some((m) => m.includes("corpora/ untouched")));
});

test("epub cache --clear --conventions asks for the paid artifact by name", async () => {
  let kinds = null;

  await runCli(["epub", "cache", "abc123", "--clear", "--conventions", "--taught-index"], {
    describeBookCache: () => ({
      registered: true,
      epubHash: "abc123",
      dir: "/lib/epubs/abc123",
      cacheVersion: 2,
      chapters: { present: false, files: 0, generatedAt: null },
      conventions: { present: true, generatedAt: "2026-07-14T09:00:00.000Z" },
      taughtIndex: { present: true, generatedAt: "2026-07-14T09:00:00.000Z" },
      reviewedCorpora: 0,
      staleRoots: [],
    }),
    clearBookCache: (hash, options) => {
      kinds = options.kinds;
      return [];
    },
    log: () => {},
  });

  assert.deepEqual(kinds, ["conventions", "taught-index"]);
});

test("epub cache without a hash fails rather than guessing a book", async () => {
  await assert.rejects(
    runCli(["epub", "cache"], { describeBookCache: () => ({}), log: () => {} }),
    /needs a book hash/,
  );
});

const BOOK_WITHOUT_INDEX = {
  registered: true,
  epubHash: "abc123",
  dir: "/lib/epubs/abc123",
  cacheVersion: 2,
  chapters: { present: true, files: 3, generatedAt: null },
  conventions: { present: true, generatedAt: "2026-07-14T09:00:00.000Z" },
  taughtIndex: { present: false },
  reviewedCorpora: 0,
  staleRoots: [],
};

test("epub taught-index builds the whole-book index once, on purpose", async () => {
  const logs = [];
  let built = null;

  await runCli(["epub", "taught-index", "abc123", "--lang", "ja"], {
    describeBookCache: () => BOOK_WITHOUT_INDEX,
    libraryEpubPath: () => process.argv[1], // any file that exists
    loadBookMeta: () => ({ title: "A book" }),
    buildTaughtIndex: (args) => {
      built = args;
      return { path: "/lib/epubs/abc123/taught-index.json", chapterCount: 57 };
    },
    log: (msg) => logs.push(msg),
  });

  assert.equal(built.targetLanguage, "ja");
  assert.ok(logs.some((m) => m.includes("57 chapter(s) indexed")));
});

test("epub taught-index refuses to re-spend a whole-book pass on a book that has one", async () => {
  const logs = [];
  let built = false;

  await runCli(["epub", "taught-index", "abc123", "--lang", "ja"], {
    describeBookCache: () => ({
      ...BOOK_WITHOUT_INDEX,
      taughtIndex: { present: true, generatedAt: "2026-08-01T09:00:00.000Z" },
    }),
    libraryEpubPath: () => process.argv[1],
    loadBookMeta: () => ({}),
    buildTaughtIndex: () => {
      built = true;
      return {};
    },
    log: (msg) => logs.push(msg),
  });

  assert.equal(built, false, "an existing index must never be silently re-billed");
  assert.ok(logs.some((m) => m.includes("--force")));
});

test("epub taught-index needs a language it can name, rather than guessing one", async () => {
  await assert.rejects(
    runCli(["epub", "taught-index", "abc123"], {
      describeBookCache: () => BOOK_WITHOUT_INDEX,
      libraryEpubPath: () => process.argv[1],
      loadBookMeta: () => ({}),
      log: () => {},
    }),
    /--lang/,
  );
});

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

// Passthrough stub for the assemble-time pedagogical sort so multi-item test corpora don't spawn a
// real `claude`. (Single-item corpora no-op in the real default, so those tests don't need this.)
const passthroughSort = ({ items }) => ({ items, changed: false });

test("throws on unknown command", async () => {
  await assert.rejects(() => runCli(["bogus", "--run", "/tmp/x"]), /Unknown command/);
});

test("throws when --run is missing", async () => {
  await assert.rejects(() => runCli(["assemble", "--template", "travel-essentials"]), /--run/);
});

test("assemble: dispatches to loadTemplate and writes corpus.json", async () => {
  await withTempDir(async (runDir) => {
    const loadTemplate = (name, targetLanguage) => {
      assert.equal(name, "travel-essentials");
      assert.equal(targetLanguage, "es");
      return baseCorpus();
    };

    await runCli(["assemble", "--run", runDir, "--template", "travel-essentials", "--lang", "es"], {
      loadTemplate,
      log: () => {},
    });

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
      ["assemble", "--output-root", outputRoot, "--template", "numbers", "--lang", "ja"],
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
        runCli(["assemble", "--output-root", outputRoot, "--template", "numbers"], {
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
        runCli(["assemble", "--run", runDir, "--template", "travel-essentials"], {
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

    await runCli(["assemble", "--run", runDir, "--epub", "/tmp/book.epub", "--list-lessons"], {
      listLessons,
      assembleCorpusFromChapter,
      log: (msg) => logs.push(msg),
    });

    assert.ok(logs.some((m) => m.includes("Lesson 1: Meeting") && m.includes("spine 2-3")));
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

test("assemble: throws when --output-root is given with an unsupported source (--chapter)", async () => {
  await assert.rejects(
    () =>
      runCli(
        ["assemble", "--output-root", "/tmp/output", "--chapter", "/tmp/ch.xhtml", "--lang", "es"],
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
        ["assemble", "--output-root", "/tmp/output", "--epub", "/tmp/book.epub", "--lang", "es"],
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
            notes: null,
            target: null,
          },
          {
            id: "china",
            english: "China",
            category: "Nationalities & Countries",
            notes: null,
            target: null,
          },
        ],
      };
    };

    await runCli(
      [
        "assemble",
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
              notes: null,
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
        runCli(["assemble", "--output-root", outputRoot, "--words", wordsPath, "--lang", "ja"], {
          log: () => {},
        }),
      /--course <name> is required/,
    );

    await assert.rejects(
      () =>
        runCli(
          [
            "assemble",
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
        __chapterLabel: "Lesson 1: Meeting",
      },
    ];
    const loadBookConventions = () => "cached conventions";
    const dedupBackward = (items, priorItems) => ({
      items: items.map((item, index) =>
        index === 0
          ? { ...item, uncertain: true, notes: "Possibly already taught — matched Lesson 1" }
          : item,
      ),
      flagged: [{ item: items[0], matchedField: "english", matchedPriorItem: priorItems[0] }],
    });
    const flagForwardConcerns = ({ candidateItems }) => ({
      items: candidateItems.map((item, index) =>
        index === 1
          ? { ...item, uncertain: true, notes: "Possibly premature — taught later" }
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

test("audio: falls back to the configured default voice for the language when --voice is omitted", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = { ...baseCards(), meta: { ...baseCards().meta, targetLanguage: "ja" } };
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "default-voice-id");
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

      const cacheDir = join(libraryHomeDir, "audio", "explicit-voice");
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
      meta: { targetLanguage: "ja", sourceType: "epub", epubHash, chapterLabel },
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
      meta: { targetLanguage: "ja", sourceType: "manual", courseSlug, chapterLabel },
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
    assert.equal(receivedOpts.outPath, join(bookDir, "deck.apkg"));
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

test("deck --book-dir: throws naming the chapter missing cards.json", async () => {
  await withTempDir(async (bookDir) => {
    mkdirSync(join(bookDir, "chapter-0"), { recursive: true });
    await assert.rejects(
      () => runCli(["deck", "--book-dir", bookDir], { log: () => {} }),
      /cards\.json not found in .*chapter-0/,
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
    writeFileSync(join(bookDir, "deck.apkg"), Buffer.from("stale-apkg"));

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

test("audio: copies alt clips into the run dir and passes the real alt transform through", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = { ...baseCards(), meta: { ...baseCards().meta, targetLanguage: "ja" } };
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "voice1");
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "def.mp3"), Buffer.from("default"));
      writeFileSync(join(cacheDir, "alt.mp3"), Buffer.from("alt"));

      let receivedOpts = null;
      const generateAudio = (cardsArg, opts) => {
        receivedOpts = opts;
        return {
          ...cardsArg,
          items: cardsArg.items.map((item) => ({ ...item, audio: "def.mp3", altAudio: "alt.mp3" })),
        };
      };

      await runCli(["audio", "--run", runDir, "--voice", "voice1"], {
        generateAudio,
        libraryHome: () => libraryHomeDir,
        log: () => {},
      });

      // real alt-transform lookup is threaded through (ja resolves to a function, en to undefined)
      assert.equal(typeof receivedOpts.getAltTransform("ja"), "function");
      assert.equal(receivedOpts.getAltTransform("en"), undefined);
      // both the default and the alt clip land in the run's audio dir
      assert(existsSync(join(paths.audio, "def.mp3")));
      assert(existsSync(join(paths.audio, "alt.mp3")));
      const written = JSON.parse(await fs.readFile(paths.cards, "utf-8"));
      assert.equal(written.items[0].altAudio, "alt.mp3");
    }),
  );
});

test("audio: --no-alt disables the alt pass (transform resolves to undefined for every language)", async () => {
  await withTempDir(async (runDir) =>
    withTempDir(async (libraryHomeDir) => {
      const paths = runPaths(runDir);
      mkdirSync(runDir, { recursive: true });
      const cards = { ...baseCards(), meta: { ...baseCards().meta, targetLanguage: "ja" } };
      writeFileSync(paths.cards, JSON.stringify(cards));

      const cacheDir = join(libraryHomeDir, "audio", "voice1");
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

      await runCli(["audio", "--run", runDir, "--voice", "voice1", "--no-alt"], {
        generateAudio,
        libraryHome: () => libraryHomeDir,
        log: () => {},
      });

      assert.equal(
        receivedOpts.getAltTransform("ja"),
        undefined,
        "no alt transform under --no-alt",
      );
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

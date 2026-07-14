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

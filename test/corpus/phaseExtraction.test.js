import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import os from "os";
import { extractBaseCorpus } from "../../src/corpus/phaseExtraction.js";

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(join(os.tmpdir(), "phase-extract-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function okRun(steps = [{ step: "reconcile", status: "ok", counts: { out: 2 } }]) {
  return { steps };
}

test("returns what the phase actually wrote, not what it reported", () => {
  // The artifact is the truth. A phase that returned items and wrote a different corpus is exactly
  // the failure the run report exists to catch, so the caller carries the file forward.
  return withTempDir(async (unitDir) => {
    const corpus = {
      meta: { targetLanguage: "ja", sourceType: "epub", reviewed: false, phase: "base" },
      items: [{ id: "a", english: "One", category: "Numbers", target: "いち" }],
    };
    const runPhase = () => {
      writeFileSync(join(unitDir, "corpus.json"), JSON.stringify(corpus));
      writeFileSync(join(unitDir, "as-generated.json"), JSON.stringify({ phase: "base" }));
      return { run: okRun(), verdict: { ok: true, problems: [], notes: [] }, gaps: null };
    };

    const result = extractBaseCorpus({
      unitDir,
      chapterFilePath: join(unitDir, "ch.xhtml"),
      chapterHtml: "<html></html>",
      targetLanguage: "ja",
      runPhase,
    });
    assert.deepEqual(result, corpus);
  });
});

test("a re-run reuses the phase's output instead of re-spending four agent calls", () => {
  // `assemble` is the resume command for a half-built lesson, so re-running it has to be cheap. It
  // also has to be POSSIBLE: writeSnapshot refuses to overwrite on purpose, so a phase that could
  // not be re-entered would turn that safeguard into a crash on the recovery path.
  return withTempDir(async (unitDir) => {
    mkdirSync(unitDir, { recursive: true });
    const corpus = { meta: { phase: "base" }, items: [{ id: "a" }, { id: "b" }] };
    writeFileSync(join(unitDir, "corpus.json"), JSON.stringify(corpus));
    writeFileSync(join(unitDir, "as-generated.json"), JSON.stringify({ phase: "base" }));

    const logged = [];
    let ran = false;
    const result = extractBaseCorpus({
      unitDir,
      chapterFilePath: join(unitDir, "ch.xhtml"),
      chapterHtml: "",
      targetLanguage: "ja",
      log: (line) => logged.push(line),
      runPhase: () => {
        ran = true;
        return { run: okRun(), verdict: { ok: true, problems: [] } };
      },
    });

    assert.equal(ran, false);
    assert.deepEqual(result, corpus);
    assert.match(logged.join("\n"), /already ran/);
  });
});

test("a corpus with no snapshot beside it is a half-run phase, and runs again", () => {
  // The snapshot is what says the phase completed. corpus.json alone can be a crash between the
  // reconcile step and the snapshot, and reusing that would ship a corpus with no baseline to
  // diff the review against.
  return withTempDir(async (unitDir) => {
    mkdirSync(unitDir, { recursive: true });
    writeFileSync(join(unitDir, "corpus.json"), JSON.stringify({ meta: {}, items: [] }));

    let ran = false;
    extractBaseCorpus({
      unitDir,
      chapterFilePath: join(unitDir, "ch.xhtml"),
      chapterHtml: "",
      targetLanguage: "ja",
      runPhase: () => {
        ran = true;
        writeFileSync(join(unitDir, "corpus.json"), JSON.stringify({ meta: {}, items: [] }));
        return { run: okRun([]), verdict: { ok: true, problems: [] } };
      },
    });
    assert.equal(ran, true);
  });
});

test("a phase that does not verify stops the build, with the artifacts left in place", () => {
  return withTempDir(async (unitDir) => {
    mkdirSync(unitDir, { recursive: true });
    assert.throws(
      () =>
        extractBaseCorpus({
          unitDir,
          chapterFilePath: join(unitDir, "ch.xhtml"),
          chapterHtml: "",
          targetLanguage: "ja",
          runPhase: () => ({
            run: okRun([]),
            verdict: {
              ok: false,
              problems: ["image-specialist: reported ok but its artifact is missing"],
            },
          }),
        }),
      /did not verify.*artifact is missing/s,
    );
  });
});

test("the adversary's gaps are surfaced, because nobody reads a JSON file they were not told about", () => {
  return withTempDir(async (unitDir) => {
    mkdirSync(unitDir, { recursive: true });
    const logged = [];
    extractBaseCorpus({
      unitDir,
      chapterFilePath: join(unitDir, "ch.xhtml"),
      chapterHtml: "",
      targetLanguage: "ja",
      log: (line) => logged.push(line),
      runPhase: () => {
        writeFileSync(join(unitDir, "corpus.json"), JSON.stringify({ meta: {}, items: [] }));
        return {
          run: okRun([]),
          verdict: { ok: true, problems: [] },
          gaps: { counts: { gaps: 3 } },
        };
      },
    });
    assert.match(logged.join("\n"), /adversary found 3 item\(s\)/);
    assert.match(logged.join("\n"), /coverage\.json/);
  });
});

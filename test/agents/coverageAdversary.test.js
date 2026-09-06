import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ROLE_ID,
  COVERAGE_FILE,
  renderCoverageAdversaryPrompt,
  enumerateChapter,
  findGaps,
  buildCoverageArtifact,
} from "../../src/agents/coverageAdversary.js";
import { ROLES, MODEL_RANK } from "../../src/agents/roles.js";

const ja = { languageCode: "ja" };
function withChapter(fn) {
  const dir = mkdtempSync(join(tmpdir(), "adversary-"));
  const file = join(dir, "15.xhtml");
  writeFileSync(file, "<h2>VOCABULARY</h2>");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const stub = (payload) => () => JSON.stringify(payload);

test("the prompt carries the chapter and the images, and nothing from the corpus", () => {
  withChapter((file) => {
    const prompt = renderCoverageAdversaryPrompt({
      chapterFilePath: file,
      imagePaths: ["/x/images/p016.jpg"],
      targetLanguage: "ja",
    });
    assert.match(prompt, /p016\.jpg/);
    assert.match(prompt, /not shown\s+\*\*what they produced\*\*|not shown/);
    assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  });
});

test("renderCoverageAdversaryPrompt has no parameter that could carry the corpus", () => {
  // The independence is a property of the signature, not a habit of its callers: there is nowhere
  // to put the other roles' output even by accident.
  const source = renderCoverageAdversaryPrompt.toString();
  assert.doesNotMatch(source, /corpus|items|candidates/i);
});

test("a chapter with no images says so rather than printing an empty block", () => {
  withChapter((file) => {
    const prompt = renderCoverageAdversaryPrompt({ chapterFilePath: file, targetLanguage: "ja" });
    assert.match(prompt, /references no images/);
  });
});

test("gaps are what the enumeration found and the corpus lacks", () => {
  // The real case: ゼロ and よん are carded in this deck, れい and し are on no card at all.
  const enumerated = [
    { target: "ゼロ", english: "Zero" },
    { target: "れい", english: "Zero (alternate reading)" },
    { target: "し", english: "Four (alternate reading)" },
  ];
  const corpus = [
    { target: "ゼロ", english: "Zero" },
    { target: "いぬ", english: "Dog" },
  ];
  const { gaps, onlyInCorpus, counts } = findGaps(enumerated, corpus, ja);
  assert.deepEqual(
    gaps.map((i) => i.target),
    ["れい", "し"],
  );
  assert.deepEqual(
    onlyInCorpus.map((i) => i.target),
    ["いぬ"],
  );
  assert.deepEqual(counts, { enumerated: 3, corpus: 2, matched: 1, gaps: 2 });
});

test("onlyInCorpus is returned too, because it can mean the adversary read short", () => {
  const { onlyInCorpus } = findGaps([], [{ target: "ねこ", english: "Cat" }], ja);
  assert.equal(onlyInCorpus.length, 1);
});

test("the artifact records the counts, since a gap list with no denominator cannot be judged", () => {
  const gaps = findGaps([{ target: "れい" }], [], ja);
  const artifact = buildCoverageArtifact({ coverage: { sectionsRead: ["VOCABULARY"] }, gaps });
  assert.equal(artifact.role, ROLE_ID);
  assert.equal(artifact.counts.enumerated, 1);
  assert.equal(artifact.gaps.length, 1);
  assert.equal(COVERAGE_FILE, "candidates/coverage.json");
});

test("the enumeration is returned whole, with its own coverage report", () => {
  withChapter((file) => {
    const { items, coverage } = enumerateChapter({
      chapterFilePath: file,
      targetLanguage: "ja",
      runClaude: stub({
        items: [{ target: "れい", english: "Zero", confidence: "probable" }],
        coverage: { sectionsRead: ["VOCABULARY"], imagesOpened: [] },
      }),
    });
    assert.equal(items[0].confidence, "probable");
    assert.deepEqual(coverage.sectionsRead, ["VOCABULARY"]);
  });
});

test("the adversary outranks every role it checks", () => {
  const role = ROLES[ROLE_ID];
  for (const target of role.checks) {
    assert.ok(
      MODEL_RANK[role.model] > MODEL_RANK[ROLES[target].model],
      `${ROLE_ID} must outrank ${target}`,
    );
  }
});

test("a missing chapter file is a hard error, not an empty enumeration", () => {
  assert.throws(
    () => enumerateChapter({ chapterFilePath: "/nope.xhtml", targetLanguage: "ja" }),
    /needs a chapter file that exists/,
  );
});

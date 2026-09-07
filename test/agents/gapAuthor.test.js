import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ROLE_ID,
  gapHandles,
  assertGapsAddressed,
  authorGapFills,
  renderGapAuthorPrompt,
} from "../../src/agents/gapAuthor.js";
import { computeGaps, underExampledForms, noGaps } from "../../src/agents/coverageGaps.js";

const ja = { languageCode: "ja" };
const BASE = [{ target: "これ" }, { target: "は" }, { target: "です" }, { target: "ペン" }];
const stub = (payload) => () => JSON.stringify(payload);

function withChapter(fn) {
  const dir = mkdtempSync(join(tmpdir(), "gap-author-"));
  const file = join(dir, "15.xhtml");
  writeFileSync(file, "<h2>VOCABULARY</h2>");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const GAPS = {
  neverUsed: [{ id: "neko", target: "ねこ", english: "Cat" }],
  underExampled: [{ id: "ga", target: "が", english: "Subject particle", examples: 0 }],
  paradigm: null,
};

test("under-exampled counts sentences, so presence is never mistaken for coverage", () => {
  // の once had ten examples in this deck and all ten were the same [company]の[person] shape.
  const cards = [
    { id: "ga", target: "が", category: "Grammar & Function Words" },
    { id: "wa", target: "は", category: "Grammar & Function Words" },
    { id: "s1", target: "これはペンです" },
    { id: "s2", target: "これはとけいです" },
    { id: "s3", target: "それはほんです" },
  ];
  assert.deepEqual(
    underExampledForms(cards, ja).map((g) => [g.target, g.examples]),
    [["が", 0]],
    "は has three sentences and is not reported",
  );
});

test("no paradigm spec reports null, not an empty list", () => {
  // "nobody checked" and "nothing missing" are different answers.
  assert.equal(computeGaps([], ja).paradigm, null);
  assert.deepEqual(computeGaps([], { ...ja, paradigmMisses: [] }).paradigm, []);
});

test("a gap left unmentioned is refused", () => {
  assert.throws(
    () => assertGapsAddressed(GAPS, { items: [{ fillsGap: "ねこ" }], unfillable: [] }),
    /left 1 computed gap\(s\) unaddressed: が/,
  );
});

test("declining a gap counts as addressing it, because some holes must stay open", () => {
  // Filling a gap with an untaught word turns one gap into two.
  assert.doesNotThrow(() =>
    assertGapsAddressed(GAPS, {
      items: [{ fillsGap: "ねこ" }],
      unfillable: [{ gap: "が", reason: "no taught sentence frame for it yet" }],
    }),
  );
});

test("items are stamped with the role and flagged as authored", () => {
  withChapter((file) => {
    const { items } = authorGapFills({
      chapterFilePath: file,
      gaps: GAPS,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub({
        items: [
          { id: "a", target: "これはペンです", fillsGap: "ねこ", gapKind: "neverUsed" },
          { id: "b", target: "これはペンです", fillsGap: "が", gapKind: "underExampled" },
        ],
        unfillable: [],
      }),
    });
    assert.equal(items[0].producedBy, ROLE_ID);
    assert.equal(items[0].aiSuggested, true, "authored content is badged for the reviewer");
  });
});

test("a well-covered lesson costs no model call at all", () => {
  withChapter((file) => {
    const never = () => assert.fail("must not spawn a model when there is nothing to fill");
    const empty = { neverUsed: [], underExampled: [], paradigm: null };
    assert.ok(noGaps(empty));
    assert.deepEqual(
      authorGapFills({
        chapterFilePath: file,
        gaps: empty,
        baseItems: BASE,
        targetLanguage: "ja",
        runClaude: never,
      }),
      { items: [], unfillable: [], notes: null, unteachable: [] },
    );
  });
});

test("the prompt hands over the computed list and says not to invent gaps", () => {
  withChapter((file) => {
    const prompt = renderGapAuthorPrompt({
      chapterFilePath: file,
      gaps: GAPS,
      baseItems: BASE,
      targetLanguage: "ja",
    });
    assert.match(prompt, /"target": "が"/);
    assert.match(prompt, /Do not invent a gap/);
    assert.match(prompt, /minimal pair/);
    assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  });
});

test("gapHandles is one spelling, so prompt and check cannot disagree", () => {
  assert.deepEqual(gapHandles(GAPS), ["ねこ", "が"]);
  assert.deepEqual(gapHandles({ ...GAPS, paradigm: [{ label: "past negative" }] }), [
    "ねこ",
    "が",
    "past negative",
  ]);
});

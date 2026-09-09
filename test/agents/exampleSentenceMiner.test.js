import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ROLE_ID,
  DIALOGUE_CAP,
  renderExampleSentenceMinerPrompt,
  assertDialogueEarnsItsPlace,
  assertSectionsAccountedFor,
  mineExampleSentences,
} from "../../src/agents/exampleSentenceMiner.js";

const SECTIONS = ["KEY SENTENCES", "TARGET DIALOGUE"];
const BASE = [{ target: "これ" }, { target: "は" }, { target: "です" }, { target: "ペン" }];
const stub = (payload) => () => JSON.stringify(payload);
const ok = {
  items: [
    {
      id: "ks1",
      target: "これはペンです",
      english: "This is a pen.",
      category: "Everyday Objects",
      source: "key-sentence",
      fromSection: "KEY SENTENCES",
    },
  ],
  sections: [
    { section: "KEY SENTENCES", mined: 1 },
    { section: "TARGET DIALOGUE", mined: 0, note: "every line is a reaction" },
  ],
  skipped: [],
};

function withChapter(fn) {
  const dir = mkdtempSync(join(tmpdir(), "example-miner-"));
  const file = join(dir, "15.xhtml");
  writeFileSync(file, "<h2>KEY SENTENCES</h2>");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const dialogueLine = (over = {}) => ({
  id: "d1",
  target: "これはペンです",
  source: "dialogue",
  fromSection: "TARGET DIALOGUE",
  demonstrates: "のまえに in a real utterance",
  ...over,
});

test("the prompt takes Key Sentences without a cap and narrows only the dialogue", () => {
  withChapter((file) => {
    const prompt = renderExampleSentenceMinerPrompt({
      chapterFilePath: file,
      sections: SECTIONS,
      baseItems: BASE,
      targetLanguage: "ja",
    });
    assert.match(prompt, /There is no cap and no sampling here/);
    assert.match(prompt, /At most four lines per dialogue/);
    assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
  });
});

test("a dialogue line naming no form it uniquely demonstrates is refused", () => {
  // This is exactly what banning the whole dialogue was avoiding: a line taken because it seemed
  // useful. Narrowing the ban only works if the narrowing has teeth.
  assert.throws(
    () => assertDialogueEarnsItsPlace([dialogueLine({ demonstrates: "" })]),
    /name no form they uniquely demonstrate/,
  );
  assert.doesNotThrow(() => assertDialogueEarnsItsPlace([dialogueLine()]));
});

test("a fifth line from one dialogue is refused, however good it is", () => {
  const five = Array.from({ length: DIALOGUE_CAP + 1 }, (_, i) => dialogueLine({ id: `d${i}` }));
  assert.throws(() => assertDialogueEarnsItsPlace(five), /dialogue cap of 4 exceeded/);
  assert.doesNotThrow(() => assertDialogueEarnsItsPlace(five.slice(0, DIALOGUE_CAP)));
});

test("the cap is per dialogue, so two dialogues may each contribute four", () => {
  const items = [
    ...Array.from({ length: 4 }, (_, i) =>
      dialogueLine({ id: `a${i}`, fromSection: "TARGET DIALOGUE" }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      dialogueLine({ id: `b${i}`, fromSection: "SPEAKING PRACTICE 1" }),
    ),
  ];
  assert.doesNotThrow(() => assertDialogueEarnsItsPlace(items));
});

test("Key Sentences are not subject to the dialogue rules at all", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({
    id: `k${i}`,
    target: "これはペンです",
    source: "key-sentence",
    fromSection: "KEY SENTENCES",
  }));
  assert.doesNotThrow(() => assertDialogueEarnsItsPlace(many));
});

test("a dialogue that yields nothing is a normal outcome, not a gap", () => {
  withChapter((file) => {
    const { items, sections } = mineExampleSentences({
      chapterFilePath: file,
      sections: SECTIONS,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub(ok),
    });
    assert.equal(items.length, 1);
    assert.equal(sections.find((s) => s.section === "TARGET DIALOGUE").mined, 0);
    assert.equal(items[0].producedBy, ROLE_ID);
  });
});

test("a section nobody accounted for is rejected", () => {
  assert.throws(
    () =>
      assertSectionsAccountedFor(SECTIONS, { sections: [{ section: "KEY SENTENCES", mined: 1 }] }),
    /did not account for section\(s\): TARGET DIALOGUE/,
  );
  assert.doesNotThrow(() =>
    assertSectionsAccountedFor(SECTIONS, {
      sections: [{ section: "KEY SENTENCES", mined: 1 }],
      skipped: [{ section: "TARGET DIALOGUE", reason: "needs untaught words" }],
    }),
  );
});

test("a sentence using an untaught word is reported, not dropped", () => {
  withChapter((file) => {
    const { items, unteachable } = mineExampleSentences({
      chapterFilePath: file,
      sections: SECTIONS,
      baseItems: BASE,
      targetLanguage: "ja",
      runClaude: stub({
        ...ok,
        items: [
          ...ok.items,
          {
            id: "x",
            target: "これはとけいです",
            source: "key-sentence",
            fromSection: "KEY SENTENCES",
          },
        ],
      }),
    });
    assert.equal(items.length, 2);
    assert.deepEqual(
      unteachable.map((u) => u.residue),
      ["とけい"],
    );
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_ID,
  ALLOWANCE_SHARE,
  allowanceFor,
  assertWithinAllowance,
  findReinvented,
  renderInventiveAuthorPrompt,
  authorInventedPractice,
} from "../../src/agents/inventiveAuthor.js";

const ja = "ja";
const BASE = [{ target: "これ" }, { target: "は" }, { target: "です" }, { target: "ペン" }];
const EXISTING = Array.from({ length: 10 }, (_, i) => ({
  target: `これはペンです${i}`,
  english: `Sentence ${i}.`,
}));
const stub = (payload) => () => JSON.stringify(payload);

test("the allowance is a share of what the others produced", () => {
  assert.equal(ALLOWANCE_SHARE, 0.2);
  assert.equal(allowanceFor(10), 2);
  assert.equal(allowanceFor(83), 17);
  assert.equal(allowanceFor(0), 0, "nothing to add to nothing");
});

test("going over the allowance is refused, not trimmed", () => {
  // Trimming would hide the overrun and make this module pick which cards to drop, which is a
  // content judgement it has no basis for.
  assert.throws(() => assertWithinAllowance([1, 2, 3], 2), /against an allowance of 2/);
  assert.doesNotThrow(() => assertWithinAllowance([1, 2], 2));
  assert.doesNotThrow(() => assertWithinAllowance([1], 2), "returning fewer is fine");
});

test("an empty prior set costs no model call", () => {
  const never = () => assert.fail("must not spawn a model with nothing to build on");
  assert.deepEqual(
    authorInventedPractice({
      existingItems: [],
      baseItems: BASE,
      targetLanguage: ja,
      runClaude: never,
    }),
    { items: [], allowance: 0, reinvented: [], unteachable: [] },
  );
});

test("the prompt states the exact ceiling and hands over every existing sentence", () => {
  const prompt = renderInventiveAuthorPrompt({
    existingItems: EXISTING,
    baseItems: BASE,
    targetLanguage: ja,
  });
  assert.match(prompt, /at most 2 items/i);
  assert.match(prompt, /これはペンです7/, "it can see what already exists");
  assert.match(prompt, /Why you are capped when the others are not/);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
});

test("the prompt shows the base unit as cards, scenes and hints included", () => {
  // Shown as a bare word list, the role read a missing scene as a gap and re-carded four base
  // replies on Casual Style 2, all of which the duplicate check then cut.
  const prompt = renderInventiveAuthorPrompt({
    existingItems: EXISTING,
    baseItems: [
      {
        target: "いいよ",
        english: "Sure.",
        scene: "A friend asks to borrow a pen",
        hint: "casual",
      },
      { target: "だめ", english: "No.", excluded: true },
    ],
    targetLanguage: ja,
  });
  assert.match(prompt, /The base unit's cards/);
  assert.match(prompt, /A friend asks to borrow a pen/, "the scene travels with the card");
  assert.match(prompt, /"hint": "casual"/);
  assert.match(prompt, /A base card as it stands/, "it is told not to re-card one");
  assert.doesNotMatch(prompt, /だめ/, "an excluded base card is not a card");
});

test("re-carding a base card is reported on its target alone, whatever the gloss", () => {
  const base = [{ target: "いいよ", english: "Sure. / All right." }];
  const invented = [{ target: "いいよ", english: "Sure." }];
  assert.equal(findReinvented(invented, EXISTING, { languageCode: ja, baseItems: base }).length, 1);
  assert.equal(findReinvented(invented, EXISTING, { languageCode: ja }).length, 0);
  assert.equal(
    findReinvented([{ target: "うん、いいよ" }], EXISTING, { languageCode: ja, baseItems: base })
      .length,
    0,
    "a sentence that uses a base card is not a repeat of it",
  );
});

test("items are stamped and badged as authored, so a reviewer sees what was invented", () => {
  const { items, allowance } = authorInventedPractice({
    existingItems: EXISTING,
    baseItems: BASE,
    targetLanguage: ja,
    runClaude: stub({
      items: [{ id: "a", target: "これはペンです", why: "shop context" }],
      usedAllowance: 1,
    }),
  });
  assert.equal(allowance, 2);
  assert.equal(items[0].producedBy, ROLE_ID);
  assert.equal(items[0].aiSuggested, true);
});

test("reinventing an existing sentence is reported, not refused", () => {
  // Whether two sentences teach the same thing is a judgement, and it belongs to the reviewer.
  const reinvented = findReinvented(
    [{ target: "これはペンです0", english: "Sentence 0." }],
    EXISTING,
    { languageCode: ja },
  );
  assert.equal(reinvented.length, 1);
  assert.equal(
    findReinvented([{ target: "ぜんぜんちがう" }], EXISTING, { languageCode: ja }).length,
    0,
  );
});

test("matching uses the reconciler's key, so this cannot disagree with the merge that follows", async () => {
  const { candidateKey } = await import("../../src/cards/unionReconciler.js");
  const item = { target: "これはペンです0", english: "Sentence 0." };
  assert.equal(candidateKey(item, ja), candidateKey(EXISTING[0], ja));
  assert.equal(findReinvented([item], EXISTING, { languageCode: ja }).length, 1);
});

test("a sentence using an untaught word is reported, since this role is likeliest to slip", () => {
  const { unteachable } = authorInventedPractice({
    existingItems: EXISTING,
    baseItems: BASE,
    targetLanguage: ja,
    runClaude: stub({ items: [{ id: "x", target: "これはとけいです", why: "shop" }] }),
  });
  assert.deepEqual(
    unteachable.map((u) => u.residue),
    ["とけい"],
  );
});

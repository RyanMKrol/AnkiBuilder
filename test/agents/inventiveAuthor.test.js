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

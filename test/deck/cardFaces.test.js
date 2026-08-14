import test from "node:test";
import assert from "node:assert/strict";
import { renderCardFaces, renderCardFacesBlock } from "../../src/deck/cardFaces.js";
import { CARD_TEMPLATES } from "../../src/deck/cardTemplates.js";

test("both directions are rendered, named after the real templates", () => {
  const faces = renderCardFaces();
  assert.deepEqual(
    faces.map((f) => f.name),
    CARD_TEMPLATES.map((t) => t.name),
  );
});

// The point of the block: the two fronts differ in exactly the way the authoring rules talk about.
test("the Recognition front shows the target and the scene, and never the answer", () => {
  const [recognition] = renderCardFaces();
  const front = recognition.front.join("\n");

  assert.match(front, /しつれいします/, "the target is the question");
  assert.match(front, /said when entering another person's room/, "the scene is on the front");
  assert.doesNotMatch(front, /Excuse me\./, "the English answer is not on the Recognition front");
  assert.doesNotMatch(
    front,
    /the apologetic one/,
    "the hint describes the target, so it must not appear on the front asking for the target",
  );
});

test("the Production front shows the English, the scene AND the hint", () => {
  const production = renderCardFaces()[1];
  const front = production.front.join("\n");

  assert.match(front, /Excuse me\./);
  assert.match(front, /said when entering another person's room/);
  assert.match(front, /the apologetic one/);
  assert.doesNotMatch(front, /しつれいします/, "the target is the answer here");
});

test("each back carries its answer, the romaji and the note", () => {
  const [recognition, production] = renderCardFaces();
  const recognitionBack = recognition.back.join("\n");
  const productionBack = production.back.join("\n");

  assert.match(recognitionBack, /Answer: Excuse me\./);
  assert.match(recognitionBack, /the apologetic one/, "the hint moves to the back on Recognition");
  assert.match(productionBack, /Answer: しつれいします/);
  for (const back of [recognitionBack, productionBack]) {
    assert.match(back, /Says: shitsurei shimasu/);
    assert.match(back, /Note: The same phrase/);
  }
});

test("an empty field renders as nothing at all, not as an empty label", () => {
  const [recognition] = renderCardFaces({
    Category: "Greetings",
    Target: "こんにちは",
    English: "Hello.",
    Pronunciation: "konnichiwa",
    Scene: "",
    Hint: "",
    Note: "",
    Image: "",
    Audio: "",
  });

  assert.deepEqual(recognition.front, ["Greetings", "こんにちは"]);
  assert.ok(!recognition.back.some((line) => /^Note:?$/.test(line)));
});

// Generated from the templates, never retyped — that is the whole reason it can be trusted.
test("the block is derived from CARD_TEMPLATES, so a template change reaches it", () => {
  const block = renderCardFacesBlock();
  for (const template of CARD_TEMPLATES) {
    assert.ok(block.includes(template.name), `the block names the ${template.name} template`);
  }
  assert.match(block, /the scene leaks/, "the block states the rule the faces make checkable");
  assert.doesNotMatch(block, /\{\{/, "no unrendered mustache reaches the prompt");
});

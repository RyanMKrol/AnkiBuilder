import test from "node:test";
import assert from "node:assert/strict";
import {
  renderAnkiTemplate,
  renderCardFaceHtml,
  renderCardFacesPage,
} from "../../src/deck/cardFacePreview.js";
import { CARD_TEMPLATES } from "../../src/deck/cardTemplates.js";
import { BASE_CSS } from "../../src/deck/cardStyles.js";

const card = (over = {}) => ({
  id: "greeting",
  target: "しつれいします",
  english: "Excuse me.",
  pronunciation: "shitsurei shimasu",
  category: "Greetings",
  ...over,
});

const recognition = (c, opts) => renderCardFaceHtml(c, opts)[0];
const production = (c, opts) => renderCardFaceHtml(c, opts)[1];

test("the two ordinals are the real templates, in the real order", () => {
  const faces = renderCardFaceHtml(card());
  assert.deepEqual(
    faces.map((f) => [f.ord, f.name]),
    CARD_TEMPLATES.map((t, ord) => [ord, t.name]),
  );
});

// This is the doctrine the whole page exists to make visible, so it is the thing to hold in a test:
// a scene shows before the answer on BOTH sides, a hint only on the Production front.
test("scene renders on both fronts; hint renders only on the Production front", () => {
  const c = card({ scene: "entering a room", hint: "the apologetic one" });
  assert.match(recognition(c).front, /entering a room/);
  assert.match(production(c).front, /entering a room/);

  assert.doesNotMatch(recognition(c).front, /apologetic/);
  assert.match(recognition(c).back, /apologetic/);
  assert.match(production(c).front, /apologetic/);
});

test("the Recognition front asks with the target and the Production front asks with the English", () => {
  const c = card();
  assert.match(recognition(c).front, /しつれいします/);
  assert.doesNotMatch(recognition(c).front, /Excuse me/);
  assert.match(production(c).front, /Excuse me/);
  assert.doesNotMatch(production(c).front, /しつれいします/);
  // …and each back carries the other side's answer.
  assert.match(recognition(c).back, /Excuse me/);
  assert.match(production(c).back, /しつれいします/);
});

// ttsText is TTS plumbing and the note type's "Reading" field holds it. No template renders it, and
// a preview that showed it would be teaching the opposite of the rule.
test("ttsText never appears on any face", () => {
  const faces = renderCardFaceHtml(card({ ttsText: "しつれいします", target: "失礼します" }));
  for (const face of faces) {
    assert.doesNotMatch(face.front + face.back, /Reading/);
  }
});

test("an empty optional field renders no empty element at all", () => {
  const bare = recognition(card());
  assert.doesNotMatch(bare.front, /class="scene"/);
  assert.doesNotMatch(bare.back, /note-back/);
  const full = recognition(card({ scene: "s", note: "n" }));
  assert.match(full.front, /class="scene"/);
  assert.match(full.back, /note-back/);
});

// The category chip is an uncontrolled answer cue on a Recognition front ("Shopping" above a bare
// デパート), and 86% of those fronts carry no scene at all. On the Production front the learner is
// already reading the English, so it costs nothing there.
test("the category chip is on the Production front only", () => {
  const c = card();
  assert.doesNotMatch(recognition(c).front, /cat-chip/);
  assert.match(production(c).front, /cat-chip/);
});

// The prompt is the string the learner has to decode. It used to render at 20px as a question and
// 26px bold as an answer, which made the harder direction the smaller one.
test("both prompts are wrapped so they can be sized like the answer", () => {
  assert.match(recognition(card()).front, /<div class="prompt">しつれいします<\/div>/);
  assert.match(production(card()).front, /<div class="prompt">Excuse me\.<\/div>/);
});

// A wrapped-but-empty prompt is still an EMPTY card in Anki, and the markup no longer says so.
test("a front whose only content is an empty wrapper counts as empty", () => {
  const html = renderCardFacesPage([{ id: "hollow", target: "", english: "", scene: "" }], {
    title: "T",
  });
  assert.match(html, /this front renders empty/);
});

test("Anki media notation becomes something a browser can show", () => {
  const withAudio = recognition(card({ audio: "clip.mp3" }));
  assert.doesNotMatch(withAudio.front, /\[sound:/);
  assert.match(withAudio.front, /clip\.mp3/);

  const noResolver = recognition(card({ image: "pic.png" }));
  assert.match(noResolver.back, /preview-chip/);
  const resolved = recognition(card({ image: "pic.png" }), {
    mediaUrl: (file, c) => `/media/${c.id}/${file}`,
  });
  assert.match(resolved.back, /<img src="\/media\/greeting\/pic\.png"/);
});

test("field text is escaped once, on the same path the built deck uses", () => {
  const face = production(card({ english: "A & B <tag>" }));
  assert.match(face.front, /A &amp; B &lt;tag&gt;/);
  assert.doesNotMatch(face.front, /<tag>/);
});

test("renderAnkiTemplate handles only what the real templates contain", () => {
  const fields = { A: "a", B: "" };
  assert.equal(renderAnkiTemplate("{{#A}}[{{A}}]{{/A}}{{#B}}[{{B}}]{{/B}}", fields), "[a]");
  assert.equal(renderAnkiTemplate("{{FrontSide}}!", fields, "F"), "F!");
  assert.equal(renderAnkiTemplate("{{Missing}}", fields), "");
});

test("the page carries the real deck CSS, both faces of every card, and the flip control", () => {
  const html = renderCardFacesPage([card(), card({ id: "second" })], { title: "T" });
  assert.ok(html.includes(BASE_CSS), "the page must style faces with the note type's own CSS");
  const faceDivs = (side) => html.match(new RegExp(`<div class="card" data-face="${side}">`, "g"));
  assert.equal(faceDivs("front").length, 4, "2 cards × 2 directions");
  assert.equal(faceDivs("back").length, 4);
  assert.match(html, /data-flip-all="back"/);
  assert.match(html, /greeting/);
  assert.match(html, /second/);
});

// A card whose front renders to nothing is an EMPTY card in Anki, which Tools → Empty Cards deletes
// along with its scheduling. Saying so on the page is cheap; finding out in Anki is not.
test("a front that renders empty is called out rather than shown blank", () => {
  const html = renderCardFacesPage([{ id: "hollow", target: "", english: "" }], { title: "T" });
  assert.match(html, /this front renders empty/);
});

test("the page marks a card's provenance flags and its suspended directions", () => {
  const html = renderCardFacesPage([card({ excluded: true, uncertain: true, dirSuspended: [1] })], {
    title: "T",
  });
  assert.match(html, /excluded/);
  assert.match(html, /uncertain/);
  assert.match(html, /direction-suspended: Production/);
});

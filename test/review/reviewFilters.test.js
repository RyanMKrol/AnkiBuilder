import test from "node:test";
import assert from "node:assert/strict";
import { filterTokens, renderFilterBar } from "../../src/review/deckViewChrome.js";

const card = (over = {}) => ({
  id: "x",
  english: "Thing",
  target: "もの",
  excluded: false,
  excludedBy: "",
  uncertain: false,
  aiSuggested: false,
  reviewNote: "",
  audio: "x.mp3",
  audioMarkerStuck: false,
  ...over,
});

test("a clean card carries no tokens, so it matches no filter", () => {
  assert.deepEqual(filterTokens(card(), "corpus"), []);
});

test("the three the owner asked for", () => {
  assert.deepEqual(filterTokens(card({ excluded: true, excludedBy: "human" }), "corpus"), [
    "excluded",
  ]);
  assert.deepEqual(filterTokens(card({ uncertain: true }), "corpus"), ["uncertain"]);
  assert.deepEqual(filterTokens(card({ aiSuggested: true }), "corpus"), ["ai"]);
});

test("a script exclusion is its own token as well as `excluded`", () => {
  // The distinction the reviewer actually acts on: a human exclusion is a decision already made,
  // a sweep's is one to re-check. `excludedBy` exists for exactly this and nothing surfaced it.
  const t = filterTokens(card({ excluded: true, excludedBy: "backward-dedup" }), "corpus");
  assert.ok(t.includes("excluded"));
  assert.ok(t.includes("script-excluded"));
});

test("a human exclusion is NOT script-excluded, and neither is a pre-provenance one", () => {
  assert.ok(
    !filterTokens(card({ excluded: true, excludedBy: "human" }), "corpus").includes(
      "script-excluded",
    ),
  );
  // "" means a human decision or a file written before provenance existed. Calling that a script
  // exclusion would send the reviewer to re-check decisions they already made.
  assert.ok(
    !filterTokens(card({ excluded: true, excludedBy: "" }), "corpus").includes("script-excluded"),
  );
});

test("audio-only tokens do not appear at the corpus gate, where there is no audio yet", () => {
  const t = filterTokens(card({ audio: null, audioMarkerStuck: true }), "corpus");
  assert.deepEqual(t, []);
});

test("`noaudio` means a SHIPPING card with no clip, not an excluded one", () => {
  // The audio stage skips excluded cards so no TTS is spent on a card that may be cut, so every
  // excluded card lacks a clip. Counting those would make this chip a restatement of "Excluded".
  assert.ok(filterTokens(card({ audio: null }), "audio").includes("noaudio"));
  assert.ok(!filterTokens(card({ audio: null, excluded: true }), "audio").includes("noaudio"));
});

test("a marker-audible clip is its own token at the audio gate", () => {
  assert.ok(filterTokens(card({ audioMarkerStuck: true }), "audio").includes("marker"));
});

test("the bar is empty when nothing on the page is flagged", () => {
  const sections = [{ stage: "corpus", cards: [card(), card()] }];
  assert.equal(renderFilterBar(sections), "");
});

test("a chip renders only when something matches it, and its count is the row count", () => {
  const sections = [
    {
      stage: "corpus",
      cards: [
        card({ excluded: true, excludedBy: "semantic-dedup" }),
        card({ excluded: true, excludedBy: "human" }),
        card({ uncertain: true }),
        card(),
      ],
    },
  ];
  const html = renderFilterBar(sections);
  assert.match(html, /data-filter="excluded">Excluded<span class="fn">2</);
  assert.match(html, /data-filter="script-excluded">Cut by a script<span class="fn">1</);
  assert.match(html, /data-filter="uncertain">Uncertain<span class="fn">1</);
  // Nothing is AI-suggested here, so that chip must not render as a zero inviting a dead click.
  assert.ok(!html.includes('data-filter="ai"'));
});

test("counts add up across every section on the page", () => {
  const sections = [
    { stage: "corpus", cards: [card({ uncertain: true })] },
    { stage: "corpus", cards: [card({ uncertain: true }), card({ uncertain: true })] },
  ];
  assert.match(renderFilterBar(sections), /data-filter="uncertain">Uncertain<span class="fn">3</);
});

test("the bar survives a section with no cards", () => {
  const sections = [{ stage: "corpus", cards: [] }, { stage: "corpus" }];
  assert.equal(renderFilterBar(sections), "");
});

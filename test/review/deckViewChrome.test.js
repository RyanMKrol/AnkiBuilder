import test from "node:test";
import assert from "node:assert/strict";
import {
  DECK_VIEW_CSS,
  fontFaceRule,
  renderLessonSections,
  DECK_EDIT_SCRIPT,
} from "../../src/review/deckViewChrome.js";

test("fontFaceRule builds base64 or url @font-face, and is empty when no font is given", () => {
  assert.match(fontFaceRule({ base64: "AAAA" }), /data:font\/woff2;base64,AAAA/);
  assert.match(fontFaceRule({ url: "/assets/font.woff2" }), /url\("\/assets\/font\.woff2"\)/);
  assert.equal(fontFaceRule({ base64: null }), "");
  assert.equal(fontFaceRule(null), "");
});

test("renderLessonSections emits collapsible sections, global numbering, and the caller's audio cell", () => {
  const sections = [
    {
      leaf: "Lesson 1",
      cards: [
        {
          english: "one",
          target: "いち",
          pronunciation: "ichi",
          category: "Numbers",
          note: "",
          audio: "a.mp3",
        },
        { english: "two", target: "に", pronunciation: "ni", category: "", note: "n", audio: null },
      ],
    },
  ];
  const audioCell = (c) =>
    c.audio ? `<audio data-f="${c.audio}"></audio>` : `<span class="x">—</span>`;
  const { html, endNumber } = renderLessonSections({ sections, startNumber: 5, audioCell });

  assert.match(html, /<details class="lesson">/);
  assert.doesNotMatch(html, /<details class="lesson" open>/);
  assert.match(html, /<span class="st">Lesson 1<\/span>/);
  assert.match(html, /class="num">5</); // global numbering starts at startNumber
  assert.match(html, /class="num">6</);
  assert.match(html, /5–6/); // summary row range
  assert.match(html, /<audio data-f="a\.mp3">/); // caller's audio cell used
  assert.match(html, /class="x">—/); // no-audio placeholder
  assert.equal(endNumber, 6);
});

test("DECK_EDIT_SCRIPT auto-rebuilds after a successful upload and a successful select", () => {
  // both edit success paths chain into rebuild() — no manual Rebuild click required
  assert.match(DECK_EDIT_SCRIPT, /"\\u2713 replaced"; return rebuild\(\)/);
  assert.match(DECK_EDIT_SCRIPT, /"\\u2713 generated"; return rebuild\(\)/);
  // rebuild hits the deck rebuild endpoint
  assert.match(DECK_EDIT_SCRIPT, /base \+ "\/rebuild"/);
});

test("DECK_VIEW_CSS carries the shared palette and collapsible-lesson styling", () => {
  assert.match(DECK_VIEW_CSS, /--paper:#ece8df/);
  assert.match(DECK_VIEW_CSS, /--accent:#7a3b36/);
  assert.match(DECK_VIEW_CSS, /\.lesson>summary/);
  assert.doesNotMatch(DECK_VIEW_CSS, /@font-face/); // font rule is prepended by the caller
});

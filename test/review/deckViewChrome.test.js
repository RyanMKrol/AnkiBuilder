import test from "node:test";
import assert from "node:assert/strict";
import {
  DECK_VIEW_CSS,
  fontFaceRule,
  renderLessonSections,
  DECK_EDIT_SCRIPT,
  AUDIO_TRIM_SCRIPT,
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

test("DECK_EDIT_SCRIPT auto-rebuilds the group after an edit, but only when the lesson is done", () => {
  // context comes from #deckctx (no manual rebuild button anywhere)
  assert.match(DECK_EDIT_SCRIPT, /getElementById\("deckctx"\)/);
  assert.doesNotMatch(DECK_EDIT_SCRIPT, /getElementById\("rebuild"\)/);
  assert.doesNotMatch(DECK_EDIT_SCRIPT, /addEventListener\("click", rebuild\)/);
  // both edit success paths chain into maybeRebuild() — a no-op unless data-done="1"
  assert.match(DECK_EDIT_SCRIPT, /"\\u2713 replaced"; return maybeRebuild\(\)/);
  assert.match(DECK_EDIT_SCRIPT, /"\\u2713 generated"; return maybeRebuild\(\)/);
  assert.match(DECK_EDIT_SCRIPT, /isDone \? rebuild\(\) : Promise\.resolve\(\)/);
  // rebuild always targets the single group package (never a per-lesson file)
  assert.match(DECK_EDIT_SCRIPT, /var rebuildUrl = base \+ "\/rebuild"/);
});

test("review surfaces AI-suggested / Uncertain at every stage (tick columns + Note at corpus, badges elsewhere)", () => {
  const cards = [
    {
      id: "a",
      english: "one",
      target: "いち",
      pronunciation: "ichi",
      category: "Numbers",
      note: "a source note",
      audio: null,
      aiSuggested: true,
    },
    {
      id: "b",
      english: "two",
      target: "に",
      pronunciation: "ni",
      category: "Numbers",
      note: "",
      audio: null,
      uncertain: true,
    },
  ];
  // corpus: dedicated Note + AI-suggested + Uncertain columns, ✓ ticks for flagged rows
  const corpus = renderLessonSections({
    sections: [{ leaf: "L", stage: "corpus", cards }],
    audioCell: () => "",
  }).html;
  assert.match(
    corpus,
    /<th>Note<\/th><th class="ctr">AI-suggested<\/th><th class="ctr">Uncertain<\/th>/,
  );
  assert.match(corpus, /✓/); // a tick for the flagged rows
  assert.match(corpus, /a source note/); // notes are shown at the corpus stage
  // translate / audio: inline badges under the English gloss
  for (const stage of ["translate", "audio"]) {
    const { html } = renderLessonSections({
      sections: [{ leaf: "L", stage, cards }],
      audioCell: () => "",
    });
    assert.match(html, /AI-suggested/, `${stage} stage shows the AI-suggested badge`);
    assert.match(html, /Uncertain/, `${stage} stage shows the Uncertain badge`);
  }
});

test("reviewNote is shown ONLY in the review (showReviewNote), never in the read-only render", () => {
  const cards = [
    {
      id: "a",
      english: "one",
      target: "いち",
      pronunciation: "ichi",
      category: "Numbers",
      note: "user-facing context",
      reviewNote: "possibly premature — taught later",
      audio: null,
    },
  ];
  for (const stage of ["corpus", "translate", "audio"]) {
    // Review render: both the card Note AND the internal Review note appear.
    const review = renderLessonSections({
      sections: [{ leaf: "L", stage, cards }],
      audioCell: () => "",
      showReviewNote: true,
    }).html;
    assert.match(review, /Review note/, `${stage}: Review-note column header`);
    assert.match(review, /possibly premature/, `${stage}: reviewNote shown in review`);
    assert.match(review, /user-facing context/, `${stage}: cardNote shown in review`);

    // Read-only render (Browse view / artifact): the internal reviewNote must NOT leak.
    const ro = renderLessonSections({
      sections: [{ leaf: "L", stage, cards }],
      audioCell: () => "",
    }).html;
    assert.doesNotMatch(ro, /Review note/, `${stage}: no Review-note column when read-only`);
    assert.doesNotMatch(ro, /possibly premature/, `${stage}: reviewNote never in read-only`);
    assert.match(ro, /user-facing context/, `${stage}: cardNote still shown read-only`);
  }
});

test("DECK_VIEW_CSS carries the shared palette and collapsible-lesson styling", () => {
  assert.match(DECK_VIEW_CSS, /--paper:#ece8df/);
  assert.match(DECK_VIEW_CSS, /--accent:#7a3b36/);
  assert.match(DECK_VIEW_CSS, /\.lesson>summary/);
  assert.doesNotMatch(DECK_VIEW_CSS, /@font-face/); // font rule is prepended by the caller
});

// --- the Original audio column --------------------------------------------------------------------

const audioSection = (card) => [
  {
    leaf: "Lesson 1",
    stage: "audio",
    cards: [
      {
        id: "a",
        unit: 0,
        english: "one",
        target: "いち",
        pronunciation: "ichi",
        audio: "a.mp3",
        ...card,
      },
    ],
  },
];

test("originalCell adds a second audio column, in FRONT of the shipping one", () => {
  const { html } = renderLessonSections({
    sections: audioSection({ originalUrl: "/media/a.orig.mp3" }),
    audioCell: () => "IN-USE",
    originalCell: () => "ORIGINAL",
  });

  assert.match(html, /<th>Original<\/th><th>In use<\/th>/);
  assert.equal(/<th>Audio<\/th>/.test(html), false);
  assert.match(html, /ORIGINAL[^]*IN-USE/, "the original comes first");
  assert.match(
    html,
    /<colgroup><col class="c-num"><col class="c-en"><col class="c-jp"><col class="c-pron"><col class="c-au"><col class="c-au">/,
  );
  assert.match(html, /class="tbl tbl-audio[^"]*tbl-twoau"/);
  assert.match(html, /data-original-url="\/media\/a\.orig\.mp3"/);
});

// Browse and the view-deck artifact are about what the deck sounds like, not how it got there. They
// pass no originalCell, and their markup must be exactly what it always was.
test("without originalCell the audio table is unchanged — one column, no trim attributes", () => {
  const { html } = renderLessonSections({
    sections: audioSection({
      originalUrl: "/media/a.orig.mp3",
      audioTrim: { start: 0.2, end: 1.4 },
    }),
    audioCell: () => "IN-USE",
  });

  assert.match(html, /<th>Audio<\/th>/);
  assert.equal(/<th>Original<\/th>/.test(html), false);
  assert.equal(/tbl-twoau/.test(html), false);
  assert.equal(/data-original-url/.test(html), false);
  assert.equal(/data-trim-start/.test(html), false);
});

test("a saved trim range rides on the row so reopening the editor restores the selection", () => {
  const { html } = renderLessonSections({
    sections: audioSection({
      originalUrl: "/media/a.orig.mp3",
      audioTrim: { start: 0.2, end: 1.4 },
    }),
    audioCell: () => "IN-USE",
    originalCell: () => "ORIGINAL",
  });
  assert.match(html, /data-trim-start="0\.2" data-trim-end="1\.4"/);
});

test("a card with no original gets no trim attributes, so the editor is never offered nothing to cut", () => {
  const { html } = renderLessonSections({
    sections: audioSection({ originalUrl: null }),
    audioCell: () => "IN-USE",
    originalCell: () => "ORIGINAL",
  });
  assert.equal(/data-original-url/.test(html), false);
});

test("AUDIO_TRIM_SCRIPT cuts from the original and posts the range, never the rendered waveform", () => {
  // The waveform is a client-side view of the original; only the [start, end] pair is sent, so the
  // server always re-cuts from the real file rather than trusting anything the browser computed.
  assert.match(AUDIO_TRIM_SCRIPT, /data-original-url/);
  assert.match(AUDIO_TRIM_SCRIPT, /"\/audio\/trim"/);
  assert.match(AUDIO_TRIM_SCRIPT, /post\("\/audio\/trim", \{ start: start, end: end \}\)/);
  assert.match(AUDIO_TRIM_SCRIPT, /"\/audio\/trim\/revert"/);
  // It must swap ONLY the In use player — the Original column keeps playing the untouched take.
  assert.match(AUDIO_TRIM_SCRIPT, /td\.au:not\(\.au-orig\)/);
  // Embedded in a template literal, so a stray backtick or ${} would break the whole page.
  assert.equal(AUDIO_TRIM_SCRIPT.includes("`"), false);
  assert.equal(AUDIO_TRIM_SCRIPT.includes("${"), false);
});

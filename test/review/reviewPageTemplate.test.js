import test from "node:test";
import assert from "node:assert/strict";
import { renderReviewPage, escapeHtml } from "../../src/review/reviewPageTemplate.js";

test("escapeHtml() escapes the five HTML-significant characters", () => {
  assert.equal(
    escapeHtml(`<a href="x">O'Brien & Co</a>`),
    "&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;",
  );
});

test("escapeHtml() treats null/undefined as an empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("renderReviewPage() throws on an unknown mode", () => {
  assert.throws(
    () => renderReviewPage({ title: "t", subtitle: "s", columns: [], rows: [], mode: "bogus" }),
    /unknown mode "bogus"/,
  );
});

test("renderReviewPage() renders column headers, row cells, and row numbering", () => {
  const html = renderReviewPage({
    eyebrow: "Eyebrow",
    title: "My Title",
    subtitle: "My subtitle",
    metaItems: [{ label: "Items", value: "2" }],
    columns: ["English", "Target"],
    rows: [
      { cells: ["Hello", "Hola"], note: null },
      { cells: ["Bye", "Adiós"], note: "a helpful note" },
    ],
    mode: "exclude",
  });

  assert.match(html, /<title>My Title<\/title>/);
  assert.match(html, /My subtitle/);
  assert.match(html, /<th class="row-num">#<\/th><th>English<\/th><th>Target<\/th><th>Note<\/th>/);
  assert.match(html, /data-row="1"/);
  assert.match(html, /data-row="2"/);
  assert.match(html, /<td>Hello<\/td>/);
  assert.match(html, /<td>Adiós<\/td>/);
});

test("renderReviewPage() emits a note popover button only for rows that have a note", () => {
  const html = renderReviewPage({
    title: "t",
    subtitle: "s",
    columns: ["English"],
    rows: [
      { cells: ["Hello"], note: null },
      { cells: ["Bye"], note: "some context" },
    ],
    mode: "exclude",
  });

  const noteButtons = html.match(/class="note-btn"/g) || [];
  assert.equal(noteButtons.length, 1);
  assert.match(html, /data-note="some context"/);
});

test("renderReviewPage() escapes note text to prevent breaking out of the data attribute", () => {
  const html = renderReviewPage({
    title: "t",
    subtitle: "s",
    columns: ["English"],
    rows: [{ cells: ["Hello"], note: `"><script>alert(1)</script>` }],
    mode: "exclude",
  });

  assert.doesNotMatch(html, /data-note="">/);
  assert.match(html, /data-note="&quot;&gt;&lt;script&gt;/);
});

test("renderReviewPage() wires the exclude mode's copy instruction and marked class into the script", () => {
  const html = renderReviewPage({
    title: "t",
    subtitle: "s",
    columns: [],
    rows: [],
    mode: "exclude",
  });
  assert.match(html, /"exclude"/);
  assert.match(html, /"excluded"/);
  assert.match(html, /No rows marked for exclusion\./);
});

test("renderReviewPage() wires the regenerate mode's copy instruction and marked class into the script", () => {
  const html = renderReviewPage({
    title: "t",
    subtitle: "s",
    columns: [],
    rows: [],
    mode: "regenerate",
  });
  assert.match(html, /"regenerate audio for"/);
  assert.match(html, /"flagged"/);
  assert.match(html, /No rows flagged for regeneration\./);
});

test("renderReviewPage() never emits a max-width/centered page wrapper or a sticky table header", () => {
  const html = renderReviewPage({
    title: "t",
    subtitle: "s",
    columns: [],
    rows: [],
    mode: "exclude",
  });
  assert.doesNotMatch(html, /position:\s*sticky/);
  assert.doesNotMatch(html, /max-width:\s*\d+(px|ch)[^;]*;\s*margin:\s*0 auto/);
});

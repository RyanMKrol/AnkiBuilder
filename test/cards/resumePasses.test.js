import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  planResume,
  resumeRefusal,
  unresolvedAfter,
  patchUnitItems,
  recordPassOnUnit,
} from "../../src/cards/resumePasses.js";

const failed = (reason) => ({ status: "failed", reason });
const ok = () => ({ status: "ok" });

function epubMeta(passes, extra = {}) {
  return {
    targetLanguage: "ja",
    sourceType: "epub",
    epubHash: "abc123",
    chapterNumber: 5,
    passes,
    ...extra,
  };
}

test("planResume() re-runs a failed forward pass and a failed sort, in pipeline order", () => {
  const { steps, blocked } = planResume({
    corpusMeta: epubMeta({
      forwardFlags: failed("quota"),
      pedagogicalSort: failed("quota"),
      taughtIndex: ok(),
    }),
    cardsMeta: epubMeta(
      { forwardFlags: failed("quota"), pedagogicalSort: failed("quota"), taughtIndex: ok() },
      { enriched: true, notesEnhanced: true },
    ),
    hasCards: true,
  });

  assert.deepEqual(
    steps.map((s) => s.pass),
    ["forwardFlags", "pedagogicalSort"],
  );
  assert.deepEqual(blocked, []);
});

test("planResume() puts romanization LAST, after prepare has had its chance to add drills", () => {
  const { steps } = planResume({
    corpusMeta: epubMeta({ romanization: failed("quota") }),
    cardsMeta: epubMeta({ romanization: failed("quota") }, { notesEnhanced: true }),
    hasCards: true,
  });

  // prepare mines a whole drill block; correcting the romaji before it runs would miss every one
  // of those cards.
  assert.deepEqual(
    steps.map((s) => s.pass),
    ["prepare", "romanization"],
  );
});

test("planResume() delegates prepare's own passes to prepare rather than reimplementing them", () => {
  const { steps } = planResume({
    corpusMeta: epubMeta({}),
    cardsMeta: epubMeta({}, { enriched: true, notesEnhanced: false }),
    hasCards: true,
  });

  assert.deepEqual(
    steps.map((s) => s.pass),
    ["prepare"],
  );
  assert.match(steps[0].why, /cross-lesson note pass/);
});

test("planResume() blocks extraction and the two book-level artifacts, each with its fix", () => {
  const { steps, blocked } = planResume({
    corpusMeta: epubMeta({
      extraction: failed("timeout"),
      bookConventions: failed("quota"),
    }),
    cardsMeta: null,
    hasCards: false,
  });

  const byPass = Object.fromEntries(blocked.map((b) => [b.pass, b]));
  assert.match(byPass.extraction.fix, /--run/);
  assert.match(byPass.bookConventions.fix, /epub cache abc123 --clear --conventions/);
  // Nothing in the blocked list may quietly become a step.
  assert.equal(
    steps.some((s) => s.pass === "extraction" || s.pass === "bookConventions"),
    false,
  );
});

test("planResume() tells you to build the taught index BEFORE resuming the forward pass", () => {
  const { blocked } = planResume({
    corpusMeta: epubMeta({ taughtIndex: { status: "skipped" }, forwardFlags: failed("quota") }),
    cardsMeta: null,
    hasCards: false,
  });

  const taught = blocked.find((b) => b.pass === "taughtIndex");
  // The ordering is the whole saving: with an index the forward pass reads a compact summary
  // instead of re-reading every later chapter of the book.
  assert.match(taught.before, /BEFORE resuming/);
  assert.match(taught.fix, /epub taught-index abc123/);
});

test("planResume() will not run the EPUB-only passes on a unit with no book", () => {
  const { steps, notes } = planResume({
    corpusMeta: {
      targetLanguage: "ja",
      sourceType: "lesson",
      passes: { forwardFlags: failed("quota") },
    },
    cardsMeta: null,
    hasCards: false,
  });

  assert.equal(
    steps.some((s) => s.pass === "forwardFlags"),
    false,
  );
  assert.ok(notes.some((n) => n.includes("EPUB-only")));
});

test("planResume() exempts a template from the passes a template has nothing to feed", () => {
  const { steps } = planResume({
    corpusMeta: { targetLanguage: "ja", sourceType: "template", passes: {} },
    cardsMeta: { targetLanguage: "ja", sourceType: "template", passes: {} },
    hasCards: true,
  });

  assert.deepEqual(steps, []);
});

test("resumeRefusal() refuses a reviewed unit and a done one, for different stated reasons", () => {
  assert.match(resumeRefusal({ reviewed: true }), /already REVIEWED/);
  assert.match(resumeRefusal({ done: true }), /DONE/);
  assert.equal(resumeRefusal({}), null);
});

test("unresolvedAfter() reports the failures resume did not touch", () => {
  const meta = { passes: { forwardFlags: failed("a"), extraction: failed("b") } };
  assert.deepEqual(unresolvedAfter(meta, ["forwardFlags"]), [{ name: "extraction", reason: "b" }]);
});

function unitDir(cards = true) {
  const dir = mkdtempSync(join(tmpdir(), "resume-"));
  const meta = { targetLanguage: "ja", sourceType: "epub", reviewed: false };
  writeFileSync(
    join(dir, "corpus.json"),
    JSON.stringify({ meta, items: [{ id: "a", english: "A", target: "あ", category: "Other" }] }),
  );
  if (cards) {
    writeFileSync(
      join(dir, "cards.json"),
      JSON.stringify({
        meta,
        items: [{ id: "a", english: "A", target: "あ", pronunciation: "a", category: "Other" }],
      }),
    );
  }
  return dir;
}

test("patchUnitItems() writes both files and REFUSES a patch that changes the item count", () => {
  const dir = unitDir();
  const written = patchUnitItems(dir, "resume-test", (file) => {
    file.items[0].reviewNote = "touched";
  });
  assert.equal(written.length, 2);
  assert.equal(
    JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8")).items[0].reviewNote,
    "touched",
  );

  // The guard that makes the resumable passes safe: all three annotate or reorder, so a patch that
  // adds or drops an item has done something its pass is not allowed to do.
  assert.throws(
    () => patchUnitItems(dir, "resume-test", (file) => file.items.pop()),
    /item count changed/,
  );
});

test("recordPassOnUnit() clears a failure on BOTH files, so preflight stops blocking", () => {
  const dir = unitDir();
  patchUnitItems(dir, "seed", (file) => {
    file.meta.passes = { forwardFlags: { status: "failed", reason: "quota" } };
  });

  recordPassOnUnit(dir, "forwardFlags", "ok");

  for (const name of ["corpus.json", "cards.json"]) {
    const meta = JSON.parse(readFileSync(join(dir, name), "utf-8")).meta;
    assert.equal(meta.passes.forwardFlags.status, "ok");
    assert.equal("reason" in meta.passes.forwardFlags, false);
  }
});

test("patchUnitItems() copes with a unit that has no cards.json yet", () => {
  const dir = unitDir(false);
  const written = patchUnitItems(dir, "resume-test", (file) => {
    file.meta.passes = { forwardFlags: { status: "ok" } };
  });
  assert.equal(written.length, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateUnits,
  parseSelection,
  applyDecisions,
  undecided,
  includedEntries,
} from "../../src/remaster/selection.js";
import { numberChapters, studyChapters } from "../../src/remaster/outline.js";

// The owner decides which study units become chapters; an agent only recommends. These tests hold
// that shape: every unit gets exactly one verdict, nothing is decided until the owner says so, and
// chapter numbers close ranks around what was left out.

const entry = (number, label, kind, firstPage) => ({
  number,
  label,
  kind,
  firstPage,
  lastPage: firstPage,
});

const outline = {
  entries: [
    entry(1, "Cover", "front-matter", 1),
    entry(2, "Hiragana Chart", "lesson", 2),
    entry(3, "Lesson 1: New Friends", "lesson", 3),
    entry(4, "Lesson 2: Shopping", "lesson", 4),
    entry(5, "Reading and Writing 1: Hiragana", "lesson", 5),
    entry(6, "Reading and Writing 3: Daily Life", "lesson", 6),
    entry(7, "Appendix: Index", "back-matter", 7),
  ],
};

const verdict = (entryNumber, recommendation, category = "core-lesson", overlapsWith = []) => ({
  entry: entryNumber,
  recommendation,
  category,
  overlapsWith,
  reason: `because ${entryNumber}`,
});

function reply(units) {
  return "```json\n" + JSON.stringify({ units, summary: "Two halves." }) + "\n```";
}

const agentReply = reply([
  verdict(2, "exclude", "kana", [5]),
  verdict(3, "include"),
  verdict(4, "include"),
  verdict(5, "include", "kana"),
  verdict(6, "ask", "kanji-and-reading", [3, 4]),
]);

test("only study units are candidates; front and back matter are never offered", () => {
  assert.deepEqual(
    candidateUnits(outline).map((e) => e.number),
    [2, 3, 4, 5, 6],
  );
});

test("the agent's answer is recorded with every decision left open", () => {
  const selection = parseSelection(agentReply, { outline });
  assert.equal(selection.summary, "Two halves.");
  assert.deepEqual(
    selection.units.map((u) => [u.entry, u.recommendation, u.decision]),
    [
      [2, "exclude", null],
      [3, "include", null],
      [4, "include", null],
      [5, "include", null],
      [6, "ask", null],
    ],
  );
  assert.deepEqual(selection.units[0].overlapsWith, [5]);
});

test("an answer that skips a unit, or judges one that is not a study unit, is refused", () => {
  assert.throws(
    () => parseSelection(reply([verdict(3, "include")]), { outline }),
    /no verdict for entry 2/,
  );
  assert.throws(
    () =>
      parseSelection(reply([...JSON.parse(agentReply.slice(8, -4)).units, verdict(7, "exclude")]), {
        outline,
      }),
    /entry 7, which is not a study unit/,
  );
  assert.throws(
    () =>
      parseSelection(
        reply([
          verdict(2, "maybe"),
          verdict(3, "include"),
          verdict(4, "include"),
          verdict(5, "include"),
          verdict(6, "include"),
        ]),
        { outline },
      ),
    /unknown recommendation "maybe"/,
  );
});

test("accepting recommendations leaves every 'ask' for the owner", () => {
  const selection = parseSelection(agentReply, { outline });
  const accepted = applyDecisions(selection, { acceptRecommendations: true, now: "T" });
  assert.deepEqual(
    undecided(accepted).map((u) => u.entry),
    [6],
  );
  const settled = applyDecisions(accepted, { include: [6], now: "T2" });
  assert.deepEqual(undecided(settled), []);
  assert.equal(settled.units.find((u) => u.entry === 6).decidedAt, "T2");
  // A decision the owner has already made is not overwritten by accepting recommendations again.
  const overridden = applyDecisions(accepted, { include: [2] });
  const again = applyDecisions(overridden, { acceptRecommendations: true });
  assert.equal(again.units.find((u) => u.entry === 2).decision, "include");
});

test("a contradictory or unknown decision is refused", () => {
  const selection = parseSelection(agentReply, { outline });
  assert.throws(() => applyDecisions(selection, { include: [3], exclude: [3] }), /both/);
  assert.throws(() => applyDecisions(selection, { include: [7] }), /not a study unit/);
});

test("chapters close ranks around what the owner left out", () => {
  const selection = applyDecisions(parseSelection(agentReply, { outline }), {
    acceptRecommendations: true,
    exclude: [6],
  });
  const chapters = studyChapters(outline, includedEntries(selection));
  assert.deepEqual(
    chapters.map((c) => c.chapterLabel),
    [
      "Chapter 01: Lesson 1: New Friends",
      "Chapter 02: Lesson 2: Shopping",
      "Chapter 03: Reading and Writing 1: Hiragana",
    ],
  );
  // With no selection at all, every study unit counts: what an outline alone implies.
  assert.equal(studyChapters(outline).length, 5);
  assert.equal(numberChapters(outline, new Set()).entries.filter((e) => e.chapter).length, 0);
});

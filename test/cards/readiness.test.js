import test from "node:test";
import assert from "node:assert/strict";
import {
  lessonReadiness,
  describeReadiness,
  drillPassExpected,
} from "../../src/cards/readiness.js";

const prepared = { enriched: true, notesEnhanced: true };

test("a lesson is ready only once every pre-review pass has recorded a complete run", () => {
  assert.equal(lessonReadiness(prepared).ready, true);
  assert.equal(lessonReadiness({}).ready, false);
  assert.equal(lessonReadiness({ enriched: true }).ready, false);
  assert.equal(lessonReadiness({ notesEnhanced: true }).ready, false);
});

test("it names the passes that are missing, not just that something is", () => {
  assert.deepEqual(
    lessonReadiness({ enriched: true }).missing.map((p) => p.key),
    ["notesEnhanced"],
  );
  assert.match(describeReadiness(lessonReadiness({})), /fill-in-the-blank.*and cross-lesson notes/);
});

// The exact shape a bare `anki-builder translate --run <dir>` leaves behind: real cards, no passes.
// This is what used to render identically to a finished lesson.
test("a bare translate output is not reviewable", () => {
  const meta = { targetLanguage: "ja", sourceType: "epub", chapterNumber: 4 };
  assert.equal(lessonReadiness(meta).ready, false);
});

test("recorded translate errors hold a lesson back even when every pass is marked", () => {
  const meta = { ...prepared, translateErrors: [{ id: "bye", error: "missing an entry" }] };
  const verdict = lessonReadiness(meta);
  assert.equal(verdict.ready, false);
  assert.equal(verdict.translateErrors.length, 1);
  assert.match(describeReadiness(verdict), /1 item\(s\) failed to translate/);
});

test("a template is always ready — it has no drills to mine and no siblings to reference", () => {
  assert.equal(lessonReadiness({ sourceType: "template" }).ready, true);
  assert.deepEqual(lessonReadiness({ sourceType: "template" }).missing, []);
});

// Without this, tightening the rule would retroactively unreview every lesson finished before the
// markers existed — including ones already shipped into a deck.
test("an already-reviewed lesson stays ready even with no markers", () => {
  assert.equal(lessonReadiness({ reviewed: true }).ready, true);
  assert.equal(lessonReadiness({ reviewed: true, done: true }).ready, true);
});

test("a degraded run is held back, and says what its passes could not see", () => {
  const meta = { prepareDegraded: { reason: "degraded", missing: ["chapter-3", "chapter-4"] } };
  const readiness = lessonReadiness(meta);
  assert.equal(readiness.ready, false);
  assert.match(describeReadiness(readiness), /could not see this book's earlier lessons/);
  assert.match(describeReadiness(readiness), /chapter-3, chapter-4/);
});

test("describeReadiness handles a ready lesson and a missing argument", () => {
  assert.equal(describeReadiness(lessonReadiness(prepared)), "ready for review");
  assert.equal(describeReadiness(), "ready for review");
});

test("a v2 phase unit is reviewable without the drill marker it was never going to set", () => {
  // Phase 2 owns the drill mining, so `enriched` is correctly absent. Requiring it anyway is not a
  // stricter gate, it is a unit that can never be signed off at all.
  const base = lessonReadiness({ targetLanguage: "ja", sourceType: "epub", phase: "base" });
  assert.deepEqual(
    base.missing.map((pass) => pass.key),
    ["notesEnhanced"],
  );

  const done = lessonReadiness({
    targetLanguage: "ja",
    sourceType: "epub",
    phase: "base",
    notesEnhanced: true,
  });
  assert.equal(done.ready, true);
});

test("a v1 unit still has to record both passes", () => {
  const v1 = lessonReadiness({ targetLanguage: "ja", sourceType: "epub", notesEnhanced: true });
  assert.equal(v1.ready, false);
  assert.deepEqual(
    v1.missing.map((pass) => pass.key),
    ["enriched"],
  );
});

test("drillPassExpected: only a v1 non-template unit mines its own drills", () => {
  assert.equal(drillPassExpected({ sourceType: "epub" }), true);
  assert.equal(drillPassExpected({ sourceType: "template" }), false);
  assert.equal(drillPassExpected({ sourceType: "epub", phase: "base" }), false);
  assert.equal(drillPassExpected({ sourceType: "epub", phase: "extras" }), false);
});

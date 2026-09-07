import test from "node:test";
import assert from "node:assert/strict";
import {
  auditUnitRefetch,
  auditChapterRefetch,
  describeRefetchAudit,
} from "../../src/audio/refetchAudit.js";
import { defaultClipText, hashTerm } from "../../src/audio/index.js";

const card = (id, target, audio) => ({ id, target, audio, category: "Numbers", english: "x" });
const clipFor = (target) => `${hashTerm(defaultClipText({ target }, "ja"))}.mp3`;

test("a clip whose name matches the current derivation counts as current", () => {
  const unit = { meta: { targetLanguage: "ja" }, items: [card("a", "いち", clipFor("いち"))] };
  const audit = auditUnitRefetch(unit, "ja");
  assert.equal(audit.current, 1);
  assert.equal(audit.refetch.length, 0);
});

test("a hand-curated take keeps its own name and is NOT stale", () => {
  // Counting these as stale would make the check cry wolf on 326 real cards and be ignored.
  const unit = {
    meta: { targetLanguage: "ja" },
    items: [
      card("a", "いち", "ichi-manual-deadbeef.mp3"),
      card("b", "に", "abc123-gen-cafe.mp3"),
      card("c", "さん", "san-user-99.mp3"),
    ],
  };
  const audit = auditUnitRefetch(unit, "ja");
  assert.equal(audit.curated, 3);
  assert.equal(audit.refetch.length, 0);
});

test("a default-named clip that no longer matches its text WOULD be refetched", () => {
  // This is the failure the audit exists for: a derivation drift renames every card at once, and a
  // refetch is indistinguishable from a first fetch once it has happened.
  const unit = {
    meta: { targetLanguage: "ja" },
    items: [card("a", "いち", `${"0".repeat(16)}.mp3`)],
  };
  const audit = auditUnitRefetch(unit, "ja");
  assert.equal(audit.refetch.length, 1);
  assert.equal(audit.refetch[0].id, "a");
  assert.equal(audit.refetch[0].wants, clipFor("いち"));
});

test("an excluded card and a clipless card are not audited", () => {
  const unit = {
    meta: { targetLanguage: "ja" },
    items: [{ ...card("a", "いち", "whatever.mp3"), excluded: true }, card("b", "に", undefined)],
  };
  const audit = auditUnitRefetch(unit, "ja");
  assert.deepEqual([audit.current, audit.curated, audit.refetch.length], [0, 0, 0]);
});

test("a chapter audit names the unit each finding came from", () => {
  const stale = {
    name: "chapter-2-extras",
    meta: {},
    items: [card("a", "いち", `${"0".repeat(16)}.mp3`)],
  };
  const clean = { name: "chapter-2", meta: {}, items: [card("b", "に", clipFor("に"))] };
  const audit = auditChapterRefetch([clean, stale], "ja");
  assert.equal(audit.current, 1);
  assert.equal(audit.refetch[0].unit, "chapter-2-extras");
});

test("the description says plainly what a non-zero refetch means", () => {
  assert.match(
    describeRefetchAudit({ current: 5, curated: 1, refetch: [] }),
    /0 would be refetched\./,
  );
  assert.match(
    describeRefetchAudit({ current: 0, curated: 0, refetch: [{ id: "a" }] }),
    /derivation has drifted and this run will re-buy them/,
  );
});

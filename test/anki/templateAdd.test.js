import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { syncStructure } from "../../src/anki/deliver.js";
import {
  PROBE_ANSWERS,
  unansweredProbes,
  assertProbesRecorded,
} from "../../src/anki/probeResults.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

const RUNBOOK = ".claude/skills/build-anki-deck/references/deliver.md";

/**
 * The template-add path: what ships (a refusal with instructions) and what is dormant (the guarded
 * `modelTemplateAdd`, closed until the live probes answer what the write does).
 */

const SPEC = noteTypeSpec("ja");
const asLive = (spec, { drop = [] } = {}) =>
  Object.fromEntries(
    spec.templates
      .filter((t) => !drop.includes(t.name))
      .map((t) => [t.name, { Front: t.qfmt, Back: t.afmt }]),
  );

function fakeClient({ templates }) {
  const calls = [];
  return {
    calls,
    client: {
      modelNames: async () => [SPEC.modelName],
      modelFieldNames: async () => [...SPEC.fields],
      modelFieldAdd: async (_m, f) => calls.push(`modelFieldAdd:${f}`),
      modelFieldReposition: async (_m, f) => calls.push(`modelFieldReposition:${f}`),
      modelTemplates: async () => templates,
      modelStyling: async () => ({ css: SPEC.css }),
      updateModelTemplates: async () => calls.push("updateModelTemplates"),
      updateModelStyling: async () => calls.push("updateModelStyling"),
      modelTemplateAdd: async (_m, name) => calls.push(`modelTemplateAdd:${name}`),
      findCards: async () => [11, 22],
      getDecks: async () => ({ "Book::Lesson 01": [11], "Course::Lesson 02": [22] }),
    },
  };
}

test("a spec template with no live counterpart FAILS with the by-hand instruction", async () => {
  const { client, calls } = fakeClient({ templates: asLive(SPEC, { drop: ["Production"] }) });
  await assert.rejects(
    () => syncStructure(client, SPEC, false),
    (error) => {
      assert.match(error.message, /missing 1 card template/);
      assert.match(error.message, /Add it by hand in Anki first/);
      assert.match(error.message, /Add Card Type, name it EXACTLY "Production"/);
      assert.match(error.message, /reports success and creates nothing/);
      return true;
    },
  );
  assert.deepEqual(calls, [], "nothing was written on the way to refusing");
});

test("a dry run reports the missing template instead of refusing", async () => {
  const { client, calls } = fakeClient({ templates: asLive(SPEC, { drop: ["Production"] }) });
  const lines = [];
  const out = await syncStructure(client, SPEC, true, { log: (m) => lines.push(m) });
  assert.deepEqual(out.addedTemplates, ["Production"]);
  assert.match(lines.join("\n"), /is MISSING 1 card template/);
  assert.deepEqual(calls, []);
});

test("the probe gate refuses while its evidence is missing, and names what to run", () => {
  // The MECHANISM, tested against an injected answer map rather than the recorded one, so this stays
  // true no matter which probes have been run. The recorded state is asserted separately, below.
  assert.throws(
    () =>
      assertProbesRecorded(["template-update-regenerates-card"], "--allow-template-add", {
        answers: { "template-update-regenerates-card": null },
      }),
    (error) => {
      assert.match(error.message, /--allow-template-add is gated on live-Anki behaviour probes/);
      assert.match(error.message, /template-update-regenerates-card/);
      assert.match(error.message, /anki-behaviour-probe/);
      return true;
    },
  );
  // A recorded FALSE is evidence, not absence: "we measured it and it does not happen" must open the
  // gate, or running the probes would achieve nothing.
  assertProbesRecorded(["template-update-regenerates-card"], "--allow-template-add", {
    answers: { "template-update-regenerates-card": false },
  });
});

test("--allow-template-add proceeds now that its two probes are answered", async () => {
  // Answered 2026-08-17: a template update neither regenerates a deleted card row nor unsuspends.
  const { client, calls } = fakeClient({ templates: asLive(SPEC, { drop: ["Production"] }) });
  const out = await syncStructure(client, SPEC, false, {
    allowTemplateAdd: true,
    allowModelChange: true,
  });
  assert.deepEqual(out.addedTemplates, ["Production"]);
  assert.ok(
    calls.includes("modelTemplateAdd:Production"),
    `expected a template add, got: ${calls.join(", ")}`,
  );
});

test("a refused template add leaves NO field write behind — reads, refusal, then writes", async () => {
  // Adding a FIELD is itself a schema bump that forces a manual one-way AnkiWeb sync. A run that
  // added the field and then refused the template would have left the owner with that sync to
  // finish and nothing to show for it, so every read happens before every write.
  const { client, calls } = fakeClient({ templates: asLive(SPEC, { drop: ["Production"] }) });
  client.modelFieldNames = async () => SPEC.fields.slice(0, -1); // one field missing as well
  await assert.rejects(() => syncStructure(client, SPEC, false), /missing 1 card template/);
  assert.deepEqual(calls, [], "no modelFieldAdd, no reposition, nothing");
});

test("an EDIT to an existing template is unaffected by the add path", async () => {
  const stale = asLive(SPEC);
  stale.Production = { Front: "old", Back: "old" };
  const { client, calls } = fakeClient({ templates: stale });
  const out = await syncStructure(client, SPEC, false, { allowModelChange: true });
  assert.deepEqual(out.addedTemplates, []);
  assert.equal(out.templates, true);
  assert.ok(calls.includes("updateModelTemplates"));
});

test("every probe id has a row in the runbook, so the two halves cannot drift", () => {
  // src/anki/probeResults.js is what a gate reads; deliver.md's table is what a human writes into.
  // An answer recorded in one and not the other is how a gate quietly opens on a memory.
  const runbook = readFileSync(RUNBOOK, "utf-8");
  for (const id of Object.keys(PROBE_ANSWERS)) {
    assert.match(runbook, new RegExp(`\`${id}\``), `${id} has no row in ${RUNBOOK}`);
  }
});

test("the recorded probe state is exactly what the last session measured", () => {
  // A deliberate snapshot of recorded state, not an invariant: UPDATE IT when a probe session runs,
  // in the same commit as the answer. It exists so an answer cannot appear in probeResults.js without
  // a human noticing here, and so nobody has to trust a memory of what has been measured.
  //
  // 2026-08-17: probes 1a and 1b ran against an empty throwaway profile. The remaining three all need
  // a card with a non-zero odid, which means a filtered deck, and AnkiConnect cannot create one — so
  // they wait on the human step written up in references/deliver.md.
  const gated = [
    "template-update-regenerates-card",
    "template-update-unsuspends",
    "change-deck-on-filtered",
    "suspend-on-filtered",
    "housekeeping-unsuspends",
  ];
  for (const id of gated) assert.ok(id in PROBE_ANSWERS, `${id} is not a known probe`);
  assert.deepEqual(unansweredProbes(gated), [
    "change-deck-on-filtered",
    "suspend-on-filtered",
    "housekeeping-unsuspends",
  ]);
  assert.equal(PROBE_ANSWERS["template-update-regenerates-card"], false);
  assert.equal(PROBE_ANSWERS["template-update-unsuspends"], false);
});

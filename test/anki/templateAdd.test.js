import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { syncStructure } from "../../src/anki/deliver.js";
import {
  PROBE_GATED_FEATURES,
  PROBE_RESULTS,
  RUNBOOK,
  assertProbeEvidence,
  missingProbeEvidence,
} from "../../src/anki/probeEvidence.js";
import { noteTypeSpec } from "../../src/deck/collection.js";

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

test("--allow-template-add is still refused: no probe has answered what the add does", async () => {
  const { client, calls } = fakeClient({ templates: asLive(SPEC, { drop: ["Production"] }) });
  await assert.rejects(
    () => syncStructure(client, SPEC, false, { allowTemplateAdd: true }),
    (error) => {
      assert.match(error.message, /--allow-template-add is not available yet/);
      assert.match(error.message, /template-regeneration/);
      assert.match(error.message, /anki-behaviour-probe/);
      return true;
    },
  );
  assert.deepEqual(calls, [], "the dormant path writes nothing while its evidence is missing");
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

test("every probe id has a row in the runbook, and every gated feature names real probes", () => {
  const runbook = readFileSync(RUNBOOK, "utf-8");
  for (const id of Object.keys(PROBE_RESULTS)) {
    assert.match(runbook, new RegExp(`\`${id}\``), `${id} has no row in ${RUNBOOK}`);
  }
  for (const [feature, { probes }] of Object.entries(PROBE_GATED_FEATURES)) {
    for (const id of probes) {
      assert.ok(PROBE_RESULTS[id], `${feature} names an unknown probe "${id}"`);
    }
  }
});

test("every probe-gated feature is closed today, and says which evidence it lacks", () => {
  for (const feature of Object.keys(PROBE_GATED_FEATURES)) {
    assert.ok(
      missingProbeEvidence(feature).length > 0,
      `${feature} claims evidence it has not got`,
    );
    assert.throws(() => assertProbeEvidence(feature), /never been run/);
  }
});

test("a feature whose probes are answered opens the gate", () => {
  const answered = Object.fromEntries(
    Object.entries(PROBE_RESULTS).map(([id, row]) => [
      id,
      { ...row, answer: "yes", recorded: "x" },
    ]),
  );
  assert.deepEqual(missingProbeEvidence("refile", answered), []);
  assert.doesNotThrow(() => assertProbeEvidence("refile", answered));
});

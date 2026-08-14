import test from "node:test";
import assert from "node:assert/strict";
import { finalizeExtrasPlan, postPrepareSeed } from "../../src/cards/finalizeExtras.js";

const RUN = "/repo/output/epubs/mybook/chapter-5-extras";

test("the steps run in the order the pass depends on", () => {
  assert.deepEqual(
    finalizeExtrasPlan(RUN).map((s) => s.name),
    ["prepare", "duplicate check", "collision audit", "order", "validate", "preflight"],
  );
});

test("prepare comes first, because it grows the unit the audits then measure", () => {
  const plan = finalizeExtrasPlan(RUN);
  assert.ok(
    plan.findIndex((s) => s.name === "prepare") < plan.findIndex((s) => s.name === "order"),
  );
  assert.deepEqual(plan[0].argv.slice(1), ["prepare", "--run", RUN]);
});

test("the audits run over the COLLECTION, since a duplicate lives in another unit", () => {
  const plan = finalizeExtrasPlan(RUN);
  for (const name of ["duplicate check", "collision audit", "preflight"]) {
    const step = plan.find((s) => s.name === name);
    assert.equal(step.argv.at(-1), "/repo/output/epubs/mybook");
  }
});

test("no audit is ever handed --apply: the reports are for a human to judge", () => {
  for (const step of finalizeExtrasPlan(RUN)) {
    if (step.name === "order") continue; // ordering is mechanical, and is the one write here
    assert.equal(step.argv.includes("--apply"), false, `${step.name} must stay report-only`);
  }
});

test("the re-order gets a fresh but stable seed, so prepare's mined cards fold in", () => {
  const step = finalizeExtrasPlan(RUN).find((s) => s.name === "order");
  assert.deepEqual(step.argv.slice(1), [RUN, "--apply", "--seed", "chapter-5-extras-post-prepare"]);
  // Stable: the same unit re-finalized twice must not re-shuffle into a different card order,
  // because card order is what a fresh .apkg import turns into new-card position.
  assert.equal(postPrepareSeed(RUN), postPrepareSeed(`${RUN}/`));
});

test("a failing audit does not stop the chain; a failing build step does", () => {
  const by = Object.fromEntries(finalizeExtrasPlan(RUN).map((s) => [s.name, s]));
  assert.equal(by["duplicate check"].reportOnly, true);
  assert.equal(by["collision audit"].reportOnly, true);
  assert.equal(by.prepare.fatal, true);
  assert.equal(by.order.fatal, true);
  assert.equal(by.validate.fatal, true);
});

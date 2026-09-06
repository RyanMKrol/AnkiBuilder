import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, ROLE_IDS, MODEL_RANK, resolveRolePinning } from "../../src/agents/roles.js";

test("every role pins a model and an effort, because inheriting means Opus by accident", () => {
  for (const id of ROLE_IDS) {
    const role = ROLES[id];
    assert.equal(typeof role.model, "string", `${id} declares no model`);
    assert.ok(role.model.length, `${id} declares an empty model`);
    assert.equal(typeof role.effort, "string", `${id} declares no effort`);
    assert.ok(role.effort.length, `${id} declares an empty effort`);
    assert.equal(typeof role.timeoutMs, "number", `${id} declares no timeout`);
    assert.ok(role.timeoutMs > 0, `${id} declares a non-positive timeout`);
  }
});

test("every pinned model is ranked, so an unknown model fails rather than sorting as unknown", () => {
  for (const id of ROLE_IDS) {
    assert.ok(MODEL_RANK[ROLES[id].model] !== undefined, `${id} pins an unranked model`);
  }
});

test("a verification role is pinned strictly above every role it checks", () => {
  let checked = 0;
  for (const id of ROLE_IDS) {
    const role = ROLES[id];
    if (!role.checks) continue;
    for (const target of role.checks) {
      assert.ok(ROLES[target], `${id} checks unknown role ${target}`);
      assert.ok(
        MODEL_RANK[role.model] > MODEL_RANK[ROLES[target].model],
        `${id} (${role.model}) must outrank ${target} (${ROLES[target].model}): ` +
          `catching an omission is harder than producing content, and a checker from the same ` +
          `family as its generator is biased toward approving it`,
      );
      checked++;
    }
  }
  assert.ok(checked > 0, "no verification role declared checks, so this assertion proved nothing");
});

test("env scopes are declared and unique, so two roles cannot share one override knob", () => {
  const scopes = ROLE_IDS.map((id) => ROLES[id].envScope);
  for (const [i, scope] of scopes.entries()) {
    assert.ok(scope, `${ROLE_IDS[i]} declares no envScope`);
  }
  assert.equal(new Set(scopes).size, scopes.length, "two roles share an envScope");
});

test("resolveRolePinning honours the per-role override and never returns an unpinned value", () => {
  const base = resolveRolePinning("tableSpecialist", { env: {} });
  assert.equal(base.model, "claude-sonnet-5");
  assert.equal(base.effort, "medium");

  const overridden = resolveRolePinning("tableSpecialist", {
    env: { ANKI_BUILDER_TABLE_SPECIALIST_MODEL: "claude-opus-5" },
  });
  assert.equal(overridden.model, "claude-opus-5");
  // The role's own effort still applies: an override names what it changes.
  assert.equal(overridden.effort, "medium");
});

test("an unknown role id is a hard error naming what is declared", () => {
  assert.throws(() => resolveRolePinning("nope"), /unknown agent role: nope/);
});

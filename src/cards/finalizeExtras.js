import { basename, dirname, resolve } from "path";

// The tail of the extras pass, as one ordered plan instead of seven commands typed from memory.
//
// Every step here already existed and was already documented; what kept going wrong was the
// sequence. Two of them have been forgotten in production and then patched into prose rather than
// code (`prepare`, without which the readiness gate never opens, and the second ordering pass, which
// is what stops the cards `prepare` mines sitting in a predictable block at the end of the unit).
//
// The order is load-bearing, in both directions:
//   1. `prepare` FIRST, because it grows the unit. Auditing before it means auditing a card set that
//      is about to change, and re-ordering before it means the mined cards land after the shuffle.
//   2. the audits BEFORE the ordering, because an audit reports card ids and a reader wants to find
//      them; and because an exclusion changes what the ordering has to place.
//   3. `validate` and `preflight` LAST, so they see the unit exactly as the reviewer will.
//
// It decides nothing. Every step prints its own report in full, and the judgments the reports call
// for — which reported duplicate is real, how to word a cue, whether an excluded card should come
// back — stay with whoever is running it. That is why the duplicate check runs report-only: the same
// judgment is why `--apply` is documented as never automatic.

/** The re-order after `prepare` needs a seed that is NEW (or the mined cards keep their block) but STABLE. */
export function postPrepareSeed(runDir) {
  return `${basename(resolve(runDir))}-post-prepare`;
}

/**
 * The ordered steps for finalizing an extras unit, as
 * `{ name, argv, why, fatal, reportOnly }`.
 *
 * `fatal` steps stop the chain when they fail, because everything after them would be measuring the
 * wrong thing. `reportOnly` steps exit non-zero to say "there is something here for you to judge",
 * which is not a failure of the chain.
 */
export function finalizeExtrasPlan(runDir, { seed = postPrepareSeed(runDir), cliBin } = {}) {
  const unit = resolve(runDir);
  const collection = dirname(unit);
  return [
    {
      name: "prepare",
      argv: [cliBin ?? "src/cli/bin.js", "prepare", "--run", unit],
      why: "sets the readiness markers the review gate checks, and mines a few drills of its own",
      fatal: true,
    },
    {
      name: "duplicate check",
      argv: ["scripts/extras-duplicate-check.mjs", collection],
      why: "a card added here can duplicate one in a LATER chapter, which no authoring pass can see",
      reportOnly: true,
    },
    {
      name: "collision audit",
      argv: ["scripts/extras-collision-audit.mjs", collection],
      why: "two cards sharing a gloss or a target need a cue on the face they collide on",
      reportOnly: true,
    },
    {
      name: "order",
      argv: ["scripts/extras-order.mjs", unit, "--apply", "--seed", seed],
      why: "seeded shuffle then hoist, with a fresh seed so prepare's mined cards fold in",
      fatal: true,
    },
    {
      name: "validate",
      argv: ["scripts/validate-decks.mjs"],
      why: "a hand-authored unit skips the stages that would otherwise shape its fields",
      fatal: true,
    },
    {
      name: "preflight",
      argv: ["scripts/preflight.mjs", collection],
      why: "the deterministic sweep that must pass before a review link is handed over",
      reportOnly: true,
    },
  ];
}

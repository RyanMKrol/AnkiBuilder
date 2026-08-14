import { glossesAgree } from "./glossMatch.js";

/**
 * What `extras-duplicate-check --apply` is allowed to exclude, and what it must refuse.
 *
 * The grouping (`findCrossChapterDuplicates`) is correct: it finds every `target` taught in more
 * than one unit. The JUDGEMENT is what fails. A shared target is just as often two genuinely
 * different senses of one word as it is a duplicate, and the earliest occurrence is not reliably
 * the one to keep. Reproduced read-only on the live book: `に` groups all five of its particle
 * senses with the NUMBER 2, and applying the rule keeps the number and excludes every particle;
 * `さん` keeps the number 3 over the honorific; `ご` keeps the number 5. Roughly a third of the
 * groups reported are cards that should stay.
 *
 * So `--apply` is no longer a step in the documented procedure (see references/extras-pass.md), and
 * where it survives it is narrowed: a duplicate may only be excluded when its ENGLISH also agrees
 * with the keeper's. Two cards that share a target and mean the same thing are a duplicate; two
 * cards that share a target and are glossed differently are the "2" vs "に" case, and the tool has
 * no business deciding it. This is the mechanical brake — the reviewed/done guard is not one, since
 * an in-flight chapter is unreviewed by definition.
 *
 * Pure and unit-tested; the `.mjs` does the file IO and the reporting.
 *
 * `groups` is `findCrossChapterDuplicates`'s output. Returns
 * `{ exclude, refuse }`, each `[{ group, duplicate, reason }]` — `exclude` is what an `--apply` may
 * write, `refuse` is everything it must print for a human instead.
 */
export function planDuplicateExclusions(groups, { force = false } = {}) {
  const exclude = [];
  const refuse = [];

  for (const group of groups) {
    for (const duplicate of group.duplicates) {
      const reason = refusalReason(group, duplicate, { force });
      if (reason) refuse.push({ group, duplicate, reason });
      else exclude.push({ group, duplicate });
    }
  }
  return { exclude, refuse };
}

function refusalReason(group, duplicate, { force }) {
  // Excluding a QUESTION can strand an elliptical answer whose scene or hint names it. Excluding an
  // answer is always safe, because a question card is answerable alone.
  if (duplicate.isQuestion) {
    return "looks like a question — excluding it can strand an elliptical answer; resolve by hand";
  }
  if ((duplicate.reviewed || duplicate.done) && !force) {
    return "unit is reviewed/done — re-run with --force to touch it";
  }
  if (!glossesAgree(group.keeper.english, duplicate.english)) {
    return (
      `glossed "${duplicate.english}" against the keeper's "${group.keeper.english}" — a shared ` +
      `target with different meanings is two senses, not a duplicate`
    );
  }
  return null;
}

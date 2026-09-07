// The vocabulary an extras role is allowed to use, and the check that it did.
//
// THE RULE THIS SERVES. Every phase-2 role may use only vocabulary and grammar the learner has
// already met: this chapter's approved base unit, plus every earlier lesson. v1 calls this "the rule
// most likely to be broken and the most damaging when it is", because a sentence built on an
// untaught word cannot be studied and sits in the deck looking finished.
//
// WHY IT IS CHECKED HERE AND NOT ONLY ASKED FOR. Three prompts will state the rule and three models
// will mostly follow it. "Mostly" is the problem: the violation is invisible at review, because a
// sentence using one unfamiliar word reads perfectly well to anyone who knows the language. So the
// check is mechanical and runs on every produced sentence.
//
// It is deliberately a REPORT rather than a filter. Substring containment over a space-free script
// cannot be certain — a two-character word appears inside longer ones constantly — so this names
// what looks unteachable and a human decides. A silent drop would be the worse error, because it
// would remove a good sentence for a bad reason and say nothing.

import { normalizeDisplayText } from "../model/scriptSpacing.js";

/** Every form a learner has met by this point, normalized for containment checks. */
export function teachableVocabulary({ baseItems = [], earlierItems = [] }, languageCode) {
  const forms = new Set();
  for (const item of [...baseItems, ...earlierItems]) {
    for (const form of [item.target, item.ttsText]) {
      if (typeof form !== "string" || !form.trim()) continue;
      forms.add(normalizeDisplayText(form.trim(), languageCode));
    }
  }
  return forms;
}

/**
 * The produced sentences that appear to use something outside the taught set.
 *
 * The test is coverage rather than parsing: walk the sentence and mark every character a taught form
 * accounts for. What is left over is the residue, and a sentence whose residue is more than a stray
 * particle is worth a human's eye. Returning the residue rather than a verdict is the point, because
 * "これはとけいです minus every taught form leaves とけい" is a sentence someone can act on.
 */
export function findUnteachable(items, taught, { languageCode, maxResidue = 2 } = {}) {
  const forms = [...taught].filter(Boolean).sort((a, b) => b.length - a.length);
  const findings = [];

  for (const item of items ?? []) {
    if (typeof item?.target !== "string" || !item.target.trim()) continue;
    const sentence = normalizeDisplayText(item.target.trim(), languageCode);
    const covered = new Array(sentence.length).fill(false);

    for (const form of forms) {
      let from = 0;
      for (;;) {
        const at = sentence.indexOf(form, from);
        if (at === -1) break;
        for (let i = at; i < at + form.length; i++) covered[i] = true;
        from = at + 1;
      }
    }

    const residue = [...sentence].filter((_, i) => !covered[i]).join("");
    if (residue.length > maxResidue) {
      findings.push({ id: item.id, target: item.target, residue });
    }
  }
  return findings;
}

/** A compact vocabulary list for a prompt: the forms, without the card machinery around them. */
export function vocabularyForPrompt(items) {
  return (items ?? [])
    .filter((item) => !item.excluded && typeof item.target === "string")
    .map((item) => ({ target: item.target, english: item.english ?? null }));
}

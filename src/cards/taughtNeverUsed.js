// Which of a lesson's cards teach a word the lesson never actually USES.
//
// The complement of vocabCoverage.js, and a different question. That one asks "did a vocabulary
// headword reach a card at all" — did extraction drop a block. This asks the question after it: the
// word IS carded, but only ever alone, so the learner meets it as an entry in a list and never in a
// sentence. That is precisely the failure the extras pass exists to close ("a lesson ends up with
// forty bare nouns that appear in no sentence"), and until now nothing measured it — the extras
// reference stated the rule in prose and left the counting to whoever remembered.
//
// It is the specific miss it was written for: lesson 15 reached both review gates with twelve of its
// twenty-one dictionary forms carded bare and never used, on a chapter whose entire grammar point is
// the ます↔dictionary correspondence. Vocabulary coverage was perfect; every headword had a card.
//
// ── The rule, and why it needs no notion of a "sentence" ──────────────────────────────────────────
//
// Defining a sentence needs per-language knowledge this tool deliberately does not have. Containment
// gives the same answer for free:
//
//   an ATOM is a target that contains no other card's target — a sentence holds its own words, so a
//   sentence is a container, never an atom;
//   an atom is USED when some other card's target contains it.
//
// So a stranded card is an atom contained in nothing: taught, and never put to work.
//
// Containment alone over-reports, though, and the leak is worth naming: a sentence none of whose
// words happen to be carded individually is an atom too, and gets flagged as a stranded word. On the
// live book that was 68 of 186 findings — set phrases (おはようございます, ありがとうございます) and
// whole sentences (このじてんしゃはふるくないです), every one of which legitimately stands alone. So a
// card must also be no LONGER than its lesson's median target to count. That threshold is relative and
// computed per lesson, not a per-language constant: a vocabulary entry is short where its lesson's
// sentences are long, in any script.
//
// Judgement stays human, which is why the check that calls this is INFO. Plenty of atoms are
// legitimately standalone — an exclamation (わあ!), a greeting, a fixed reply (わたしもです). The
// report names them so dismissing one takes a glance.

/**
 * The stranded cards among `cards`, as `[{ id, target, english }]`.
 *
 * `cards` is ONE lesson's worth — a base unit and its `-extras` sibling together, since the extras
 * unit is where the base unit's bare words are supposed to get used, and judging either alone gives
 * the wrong answer for both. Pass shipping cards only; an excluded card teaches nothing.
 *
 * It needs a LESSON-sized input to mean anything, because the median is computed from what it is
 * given: on a handful of cards the median lands on top of one of the sentences and the answer is an
 * artefact of the sample.
 */
export function findTaughtNeverUsed(cards) {
  const targets = cards.map((card) => card.target).filter((t) => typeof t === "string" && t.length);
  if (targets.length === 0) return [];
  const unique = [...new Set(targets)];

  const lengths = [...targets].map((t) => t.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];

  return cards.filter((card) => {
    const target = card.target;
    if (typeof target !== "string" || target.length === 0) return false;
    // Word-shaped, relative to this lesson. See the note above on why the threshold is a median and
    // not a constant.
    if (target.length > median) return false;
    const isAtom = !unique.some((other) => other !== target && target.includes(other));
    if (!isAtom) return false;
    const isUsed = unique.some((other) => other !== target && other.includes(target));
    return !isUsed;
  });
}

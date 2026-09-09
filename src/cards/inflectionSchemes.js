// Which inflected forms a word needs before a learner can actually use it. Per language.
//
// WHY THIS IS A PLUGIN AND NOT A RULE. Every language inflects differently, and the set of forms
// worth carding is a fact about the language rather than about this pipeline. Japanese wants a
// dictionary form and four polite forms; a Romance language wants a person/number paradigm; a
// language with no inflection wants nothing at all. So this is keyed by ISO 639-1 exactly like
// `romanizationLibraries.js` and `predicateShape.js`, and an unconfigured language returns null so
// its callers report UNKNOWN rather than "no forms needed".
//
// WHAT THIS IS FOR, AND THE LINE IT DOES NOT CROSS. A learner who meets あいます and never meets
// あいました, あいません or あいませんでした knows one form and cannot use the word. The coverage
// adversary had been saying so on its own: on chapter 9, fifteen of its forty-eight gaps were exactly
// these conjugations, across five verbs, every one of them PRINTED IN THAT CHAPTER.
//
// So this lists the forms worth carding WHEN THE SOURCE TEACHES THEM. It is not a licence to invent
// a paradigm ahead of the book. `card-authoring-rules.md` records that supplying forms the source has
// not reached was tried on this deck in 2026-09, reviewed, and stripped back out: a citation form
// carded before the lesson that explains it means the learner meets a form before the explanation
// that makes sense of it. That rule stands. Owner ruling 2026-09-08 confirmed it: card the forms the
// chapter demonstrates, all of them, and no others.
//
// WHY A SCRIPT CANNOT GENERATE THEM. The polite forms are mechanical from the ます stem, but the
// DICTIONARY form is not: あいます → あう and たべます → たべる differ by verb class, and the ます form
// alone does not say which class a verb is in. い-adjectives and な-adjectives conjugate differently
// too. So the scheme states WHAT IS WANTED and an agent produces it, while a script checks that
// every wanted form arrived. Requirement and verification are deterministic; the morphology is not.

import { resolveIso639Code } from "../model/iso639.js";

/**
 * The inflection paradigms worth carding, per ISO 639-1 code.
 *
 * `forms` is ordered as a learner meets them, and each carries the gloss shape that keeps the English
 * side distinct: "To meet" and "Met" are different cards for one verb, and a paradigm carded with one
 * gloss repeated is four cards a learner cannot tell apart.
 *
 * A form here is a CANDIDATE, not a requirement. It earns a card in the chapter that teaches it.
 *
 * Only `ja` is worked out, and every other language is DELIBERATELY absent. A wrong paradigm here
 * would not fail quietly: it would demand forms a language does not have, and the check would report
 * a unit incomplete forever.
 */
export const INFLECTION_SCHEMES = {
  ja: {
    verb: {
      citation: "polite-present",
      forms: [
        { id: "dictionary", label: "dictionary form", gloss: "plain/dictionary form" },
        { id: "polite-present", label: "polite present", gloss: "does / will do" },
        { id: "polite-past", label: "polite past", gloss: "did" },
        { id: "polite-negative", label: "polite negative", gloss: "does not / will not" },
        { id: "polite-past-negative", label: "polite past negative", gloss: "did not" },
      ],
    },
    adjective: {
      citation: "present",
      forms: [
        { id: "present", label: "present", gloss: "is X" },
        { id: "past", label: "past", gloss: "was X" },
        { id: "negative", label: "present negative", gloss: "is not X" },
        { id: "past-negative", label: "past negative", gloss: "was not X" },
      ],
    },
  },
  //
  // ── every other language is DELIBERATELY absent ────────────────────────────────────────────────
  //
  // Working one out means deciding which forms a learner of that language needs before they can use
  // a word, which is a teaching judgement about a real deck, not a table copied from a grammar. That
  // is the same bar `romanizationLibraries.js` sets, and for the same reason.
};

/** The scheme for a language, or `null` when it has none configured. */
export function inflectionScheme(targetLanguage) {
  const code = resolveIso639Code(targetLanguage);
  return (code ? INFLECTION_SCHEMES[code] : null) ?? null;
}

/**
 * The forms wanted for one part of speech, or `null` when the language is unconfigured.
 *
 * Null, never `[]`. An empty list would let a caller loop over nothing and conclude "every form is
 * present", which is the shape of failure this whole registry pattern exists to avoid.
 */
export function formsFor(targetLanguage, partOfSpeech) {
  const scheme = inflectionScheme(targetLanguage);
  if (!scheme) return null;
  return scheme[partOfSpeech]?.forms ?? null;
}

/**
 * Describes a language's paradigms for a prompt, or a plain sentence saying there are none.
 *
 * The prompt gets the requirement in the language's own terms rather than a rule about Japanese
 * hard-coded into English prose, which is what makes this a plugin rather than a paragraph.
 */
export function describeScheme(targetLanguage) {
  const scheme = inflectionScheme(targetLanguage);
  if (!scheme) {
    return (
      "No inflection paradigm is configured for this language, so card each word once, in the form " +
      "the source presents it. Do not invent a paradigm."
    );
  }
  const lines = [
    "This language inflects, and each form below is its own card WHEN THIS CHAPTER TEACHES IT.",
    "",
    "Card a form the chapter prints, demonstrates in a table, or names in its grammar prose. Do NOT",
    "invent a form the chapter has not reached: a learner meeting a form before the explanation that",
    "makes sense of it is worse off, and that batch was authored and stripped out of this deck once",
    "already.",
    "",
  ];
  for (const [pos, spec] of Object.entries(scheme)) {
    lines.push(`**${pos}**, ${spec.forms.length} possible forms:`);
    for (const form of spec.forms) {
      const cite = form.id === spec.citation ? "  (the citation form)" : "";
      lines.push(`  - ${form.label}: ${form.gloss}${cite}`);
    }
  }
  return lines.join("\n");
}

// Is a target an UTTERANCE or a LEXICAL ENTRY? Per language, and honestly unknown when unconfigured.
//
// WHY THIS IS NOT A LENGTH CHECK. v2 splits a chapter into a base unit of lexical entries and an
// extras unit of propositions, and the test between them is what the thing IS, never how long it is.
// A fixed expression the book glosses as a unit is an entry at twelve characters; a short clause is
// an utterance at four. A character count would put both on the wrong side, and would do it silently.
//
// WHY A PER-LANGUAGE REGISTRY. "Has a predicate" is a fact about a language's morphology, and there
// is no language-neutral way to compute it. This copies the pattern `romanizationLibraries.js`
// already uses and names: keyed by the ISO 639-1 code `resolveIso639Code` resolves a corpus's
// targetLanguage to, with an absent language returning a documented empty rather than a default.
//
// WHY ABSENT MUST MEAN UNKNOWN. This is the rule the whole generality effort turns on. `vocabCoverage`
// matched one publisher's CSS class, found nothing on any other book, and reported zero uncovered
// headwords — a clean pass that meant nothing. A check with no configuration for a language must say
// so. `predicateMarkers` returns null, not [], and the caller is expected to propagate that.
//
// WHY THE JAPANESE LIST IS SHORT. Every marker here is a sentence-final polite or copular ending with
// almost no other use. Plain-form verb and adjective endings are deliberately absent: う-verbs end in
// the same kana that end ordinary nouns, so including them would flag half the vocabulary in the
// deck. The list is built for precision, and it still has a known false-positive class (below).

import { resolveIso639Code } from "../model/iso639.js";

/**
 * Sentence-final predicate markers, per ISO 639-1 code.
 *
 * A language with no entry is UNCONFIGURED, and that is a real state rather than a gap to fill in
 * with a guess. Only `ja` has been worked through against a real deck.
 */
export const PREDICATE_MARKERS = {
  ja: {
    // Sentence-final polite and copular endings, chosen for precision.
    predicates: [
      "です",
      "でした",
      "ではありません",
      "じゃありません",
      "ではありませんでした",
      "じゃありませんでした",
      "ます",
      "ました",
      "ません",
      "ませんでした",
      // Plain past copula. `だ` alone is DELIBERATELY absent: ordinary nouns end in it (からだ,
      // ふだ), so it would flag vocabulary rather than utterances.
      "だった",
      "ください",
      "ありません",
    ],
    // Evidence that the target has CLAUSE STRUCTURE and is not one word that happens to end in a
    // predicate. A particle marks a topic, a subject, an object or a place, and a word does not have
    // one.
    //
    // This half is what makes the check usable rather than noise, and the reason is a convention of
    // this deck: verbs are carded in their polite ます form, so あるきます ("Walk"), みせます
    // ("Show") and あります ("Be, exist") are LEXICAL ENTRIES that end in a predicate marker.
    // Requiring structure as well drops every one of them, along with the fixed greetings
    // (すみません, いただきます, しつれいします) that end the same way.
    //
    // ⚠️ THIS IS A HEURISTIC ON KANA, AND ITS LIMIT IS THAT PARTICLES ARE ORDINARY KANA. There is no
    // way to tell the topic marker は from the は inside はな without morphological analysis, so
    // every particle here also fires word-internally. Which particles are in the set is therefore a
    // recall/noise trade, measured on the 1,224 shipping cards of the live base units:
    //
    //     はがをにでへもとから   326 (26.6%)   と alone contributes とけいです and とります
    //     はがをにで            277 (22.6%)   ← this set
    //     はがを                244 (19.9%)   loses clauses whose only particle is に or で
    //
    // The middle set keeps the locative and instrumental particles that mark most remaining clauses
    // and drops と, the noisiest. Recall matters more than precision here: a sentence that leaked
    // into a base unit and went unflagged is the failure this check exists for, while a false
    // positive costs a reviewer one glance. The upgrade path, if the noise ever justifies it, is
    // kuromoji, which this repo already depends on for Japanese romanization.
    structure: /[はがをにで]/u,
  },
  //
  // ── every other language is DELIBERATELY ABSENT ────────────────────────────────────────────────
  //
  // Not an oversight and not a backlog item. A marker list is a claim about a language's morphology,
  // and a wrong one here does not fail quietly: it would flag correct base vocabulary as misfiled
  // and send a reviewer to move cards that were already right. Working one out means reading a real
  // deck in that language, which is the same bar `romanizationLibraries.js` sets, and for the same
  // reason.
};

/**
 * The rules for a language, or `null` when it has none configured.
 *
 * Null, never an empty object. An empty one would let a caller loop over nothing and conclude "no
 * utterances in this unit", which is the exact shape of the failure this file exists to avoid.
 */
export function predicateMarkers(targetLanguage) {
  const code = resolveIso639Code(targetLanguage);
  return (code ? PREDICATE_MARKERS[code] : null) ?? null;
}

/**
 * Whether a target reads as an utterance: `true`, `false`, or `null` for an unconfigured language.
 *
 * Both halves are required. A predicate ending says something is being asserted; the structure says
 * there is a clause doing the asserting. A caller that treats `null` as `false` has reintroduced the
 * bug this returns null to prevent.
 */
export function isPredicateShaped(target, targetLanguage) {
  const rules = predicateMarkers(targetLanguage);
  if (!rules) return null;
  const text = String(target ?? "")
    .trim()
    .replace(/[。．.!！?？]+$/u, "");
  if (!text) return false;

  // A trailing question particle sits after the predicate, so strip it before matching rather than
  // listing a second form of every ending.
  const stem = text.replace(/[かね]$/u, "");
  // The LONGEST matching ending, so ではありません is stripped as one rather than leaving ではあり.
  const ending = rules.predicates
    .filter((m) => stem.endsWith(m) || text.endsWith(m))
    .sort((a, b) => b.length - a.length)[0];
  if (!ending) return false;

  // A target that IS a marker is the entry FOR that marker. `です` is a card in this deck: the
  // copula, taught as vocabulary. Reading it as a sentence would be reading the dictionary as prose.
  if (rules.predicates.includes(stem) || rules.predicates.includes(text)) return false;

  // Look for structure in what is LEFT once the predicate is removed. Testing the whole string
  // instead means です supplies its own evidence, because it contains で: なんですか came back as a
  // clause on the strength of the copula it ends with.
  return rules.structure.test(stem.slice(0, stem.length - ending.length));
}

/**
 * The shipping cards in a unit whose target reads as an utterance, or `null` when the language has
 * no markers configured.
 *
 * **Known false positives, and why the caller must not treat this as a verdict.** A fixed expression
 * the book glosses as a single unit is a lexical entry no matter what it ends in, and requiring
 * clause structure removes most but not all of them: もういちどおねがいします has a particle in it
 * and is still one entry. Nothing mechanical separates that from a sentence, which is why the check
 * built on this reports rather than blocks.
 */
export function utteranceShapedCards(items, targetLanguage) {
  if (!predicateMarkers(targetLanguage)) return null;
  return (items ?? [])
    .filter((item) => !item.excluded)
    .filter((item) => isPredicateShaped(item.target, targetLanguage) === true);
}

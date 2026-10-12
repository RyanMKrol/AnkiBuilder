// Forms the book has already taught, owed by every word it teaches afterwards.
//
// WHY THIS EXISTS. A textbook introduces a form once, conjugates the verbs it has to hand, and then
// goes on printing new verbs in the form it prefers. Busy People teaches the dictionary form in
// Lesson 15 and prints every later verb as a ます form only, so by Lesson 22 thirty-five verbs had a
// polite form, often a ない-form, and no dictionary form anywhere in the deck. The owner ruled on
// 2026-10-12 that each one is owed its form: in the lesson that taught the verb, or in the lesson
// that introduced the form if the verb came earlier (card-authoring-rules.md, under the citation-form
// rule).
//
// WHAT IS DETERMINISTIC HERE AND WHAT IS NOT. Whether a form is owed, and whether it is present, is
// arithmetic over the cards. WRITING the form is not: あいます → あう and たべます → たべる differ by
// verb class and the ます form alone does not say which (inflectionSchemes.js). So this returns a
// list of gaps and an agent writes the cards, the same split computeGaps uses for the extras.
//
// HOW PRESENCE IS JUDGED WITHOUT KNOWING THE CLASS. Every plausible form is generated (たべます gives
// たべる and たぶ) and the gap is closed when ANY of them has a card. A wrong candidate only ever
// matches a card that does not exist, so over-generating costs nothing. A phrase is covered by its
// verb: テニスをします needs no テニスをする card once する has one, because the learner who knows
// する already knows the phrase's dictionary form.
//
// A language with no entry here returns null from `missingCarriedForms`, never [], so a caller can
// tell "nobody checked" from "nothing missing".

import { resolveIso639Code } from "../model/iso639.js";

/** The i-row kana a Regular 1 ます stem ends in, and the u-row kana its dictionary form ends in. */
const I_TO_U = {
  い: "う",
  き: "く",
  ぎ: "ぐ",
  し: "す",
  じ: "ず",
  ち: "つ",
  に: "ぬ",
  ひ: "ふ",
  び: "ぶ",
  ぴ: "ぷ",
  み: "む",
  り: "る",
};

/** Set phrases that end in ます and are not a verb a learner conjugates. */
const JA_FIXED_PHRASES = /(ございます|おねがいします|しつれいします|いただきます|おじゃまします)$/;

/**
 * A ています progressive (たべています, のんでいます) ends in ます like any polite verb, but it is the
 * て-form plus the auxiliary います, so its "stem" yields nonsense candidates (のんでいる, のんでう) and
 * the gap could never close. Its dictionary form is the base verb's, owed by the base verb's own card.
 * Lesson 23's paradigm cells were reported as six false gaps before this existed.
 */
const JA_PROGRESSIVE = /[てで]います$/;

/** Particles that join an object or subject to its verb, so the phrase is covered by the verb. */
const JA_PHRASE_PARTICLES = ["を", "が"];

export const CARRIED_FORMS = {
  ja: [
    {
      id: "dictionary",
      label: "dictionary form",
      // The English every dictionary-form card in this deck carries. It is also how the check knows
      // the book has introduced the form at all: no such card yet, no form owed.
      marker: /\(dictionary form\)\s*$/i,
      /** A polite-present verb entry, as opposed to a sentence or a set phrase. */
      isSource(item) {
        const target = item.target ?? "";
        if (!target.endsWith("ます")) return false;
        if (/[、。？！?!\s]/.test(target)) return false;
        if (JA_FIXED_PHRASES.test(target)) return false;
        if (JA_PROGRESSIVE.test(target)) return false;
        if (item.category === "Greetings") return false;
        // A sentence glosses as one ("There is a bank."); an entry does not ("Be, exist").
        if (/[.?!]\s*$/.test(item.english ?? "")) return false;
        return true;
      },
      /** Every form the ます form could come from. Only one of them is real. */
      candidates(target) {
        const stem = target.slice(0, -"ます".length);
        const out = [`${stem}る`];
        const last = stem.at(-1);
        if (I_TO_U[last]) out.push(`${stem.slice(0, -1)}${I_TO_U[last]}`);
        if (last === "し") out.push(`${stem.slice(0, -1)}する`);
        if (last === "き") out.push(`${stem.slice(0, -1)}くる`);
        return out;
      },
      /** True when the card `have` closes the gap for candidate `form`. */
      covers(have, form) {
        if (have === form) return true;
        return JA_PHRASE_PARTICLES.some((p) => form.endsWith(`${p}${have}`));
      },
    },
  ],
};

const shipping = (items) =>
  (items ?? []).filter((i) => !i.excluded && typeof i.target === "string");

/**
 * The carried forms `items` owes, as gap objects, or null when the language has none configured.
 *
 * `items` is ONE unit's cards (in a build, the base corpus as it stands); `priorItems` is every
 * earlier unit's. A form is owed only once the book has introduced it, which is the first unit to
 * hold a card carrying its marker. The unit that introduces it also owes it for every verb taught
 * BEFORE it, which is how a verb from Lesson 9 gets its dictionary form in Lesson 15.
 */
export function missingCarriedForms(items, { priorItems = [], languageCode } = {}) {
  const code = resolveIso639Code(languageCode);
  const specs = code ? CARRIED_FORMS[code] : null;
  if (!specs) return null;
  const here = shipping(items);
  const before = shipping(priorItems);
  const gaps = [];
  for (const spec of specs) {
    const introducedBefore = before.some((i) => spec.marker.test(i.english ?? ""));
    const introducedHere = here.some((i) => spec.marker.test(i.english ?? ""));
    if (!introducedBefore && !introducedHere) continue;
    const have = [...before, ...here]
      .filter((i) => spec.marker.test(i.english ?? ""))
      .map((i) => i.target);
    const sources = introducedBefore ? here : [...before, ...here];
    const seen = new Set();
    for (const item of sources) {
      if (!spec.isSource(item) || seen.has(item.target)) continue;
      seen.add(item.target);
      const forms = spec.candidates(item.target);
      if (forms.some((form) => have.some((h) => spec.covers(h, form)))) continue;
      gaps.push({
        target: item.target,
        english: item.english ?? null,
        carriedForm: spec.label,
        sourceId: item.id ?? null,
      });
    }
  }
  return gaps;
}

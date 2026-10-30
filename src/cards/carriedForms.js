// Forms the book has already taught, owed by every word it teaches afterwards.
//
// WHY THIS EXISTS. A textbook introduces a form once, conjugates the verbs it has to hand, and then
// goes on printing new verbs in the form it prefers. Busy People teaches the dictionary form in
// Lesson 15 and prints every later verb as a ます form only, so by Lesson 22 thirty-five verbs had a
// polite form, often a ない-form, and no dictionary form anywhere in the deck. The owner ruled on
// 2026-10-12 that each one is owed its form: in the lesson that taught the verb, or in the lesson
// that introduced the form if the verb came earlier (card-authoring-rules.md, under the citation-form
// rule). On 2026-10-30 the same ruling was extended to the て-form (Lesson 18) and the ない-form
// (Lesson 22), after a sweep found 32 and 48 verbs missing them. The casual past and the polite
// forms were deliberately left out: they are mechanical once these are known.
//
// WHAT IS DETERMINISTIC HERE AND WHAT IS NOT. Whether a form is owed, and whether it is present, is
// arithmetic over the cards. The DICTIONARY form is not: あいます → あう and たべます → たべる differ
// by verb class and the ます form alone does not say which (inflectionSchemes.js). But once a verb
// has its dictionary-form card, the class is settled (たべる is たべ + る, かえる is not かえり + る),
// and from there the て-form and the ない-form are fixed. So a gap for those two carries `expected`,
// the exact target, and the gap filler is overruled if it writes anything else. Only the English and
// the note are left to a model.
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

/**
 * A Regular 1 stem's last kana, and what replaces it before て and before ない. The voiced rows take
 * で, which is why the て ending is part of the entry rather than added afterwards.
 */
const R1 = {
  い: { te: "って", nai: "わ" },
  ち: { te: "って", nai: "た" },
  り: { te: "って", nai: "ら" },
  み: { te: "んで", nai: "ま" },
  び: { te: "んで", nai: "ば" },
  に: { te: "んで", nai: "な" },
  き: { te: "いて", nai: "か" },
  ぎ: { te: "いで", nai: "が" },
  し: { te: "して", nai: "さ" },
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

const DICTIONARY_MARKER = /\(dictionary form\)\s*$/i;

/** True when the card `have` closes the gap for candidate `form`. */
function jaCovers(have, form) {
  if (have === form) return true;
  return JA_PHRASE_PARTICLES.some((p) => form.endsWith(`${p}${have}`));
}

/** A polite-present verb entry, as opposed to a sentence or a set phrase. */
function jaIsVerbEntry(item) {
  const target = item.target ?? "";
  if (!target.endsWith("ます")) return false;
  if (/[、。？！?!\s]/.test(target)) return false;
  if (JA_FIXED_PHRASES.test(target)) return false;
  if (JA_PROGRESSIVE.test(target)) return false;
  if (item.category === "Greetings") return false;
  // A sentence glosses as one ("There is a bank."); an entry does not ("Be, exist").
  if (/[.?!]\s*$/.test(item.english ?? "")) return false;
  return true;
}

const stemOf = (masu) => masu.slice(0, -"ます".length);

/** Every dictionary form the ます form could come from. Only one of them is real. */
function jaDictionaryCandidates(masu) {
  const stem = stemOf(masu);
  const out = [`${stem}る`];
  const last = stem.at(-1);
  if (I_TO_U[last]) out.push(`${stem.slice(0, -1)}${I_TO_U[last]}`);
  if (last === "し") out.push(`${stem.slice(0, -1)}する`);
  // くる on its own (きます) or after a て-form (もってきます). Anywhere else the き is a Regular 1
  // stem, and guessing くる there turned つきます into つくる ("make") and おきます into おくる ("send").
  const pre = stem.slice(0, -1);
  if (last === "き" && (pre === "" || /[てで]$/.test(pre))) out.push(`${pre}くる`);
  return out;
}

/** Every て-form or ない-form the ます form could take, across all the classes it might be in. */
function jaFormCandidates(masu, form) {
  const stem = stemOf(masu);
  const pre = stem.slice(0, -1);
  const last = stem.at(-1);
  const out = form === "te" ? [`${stem}て`] : [`${stem}ない`];
  const row = R1[last];
  if (row) out.push(form === "te" ? `${pre}${row.te}` : `${pre}${row.nai}ない`);
  if (last === "き") out.push(form === "te" ? `${pre}って` : `${pre}こない`);
  if (form === "nai" && stem.endsWith("あり")) out.push(`${stem.slice(0, -2)}ない`);
  return out;
}

const glossOf = (english) =>
  (english ?? "")
    .replace(/\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase();

/**
 * The dictionary-form card the deck holds for this ます form, and the part of the ます form it leaves
 * out (シャワーを for シャワーをあびます carded as あびる).
 *
 * `dictionaryCards` are `{ target, english }`. When the spelling fits more than one card, the gloss
 * decides: おきます is both おく ("put") and おきる ("get up"), and only the English says which one
 * this card is. Null when there is no card yet, and when the gloss cannot settle it either, because
 * a guess would overrule a gap filler that had it right.
 */
function jaDictionaryOf(masu, dictionaryCards, english = null, siblingGlosses = []) {
  const found = new Map();
  for (const form of jaDictionaryCandidates(masu)) {
    for (const card of dictionaryCards) {
      if (jaCovers(card.target, form)) {
        found.set(card.target, {
          dictionary: card.target,
          prefix: form.slice(0, form.length - card.target.length),
          gloss: glossOf(card.english),
        });
      }
    }
  }
  let matches = [...found.values()];
  if (matches.length > 1 && english) {
    matches = matches.filter((m) => m.gloss === glossOf(english));
  }
  if (matches.length !== 1) return null;
  // One card fits, but it is the OTHER verb's: the deck has "get up" as おきます and only "put" has a
  // dictionary form so far. The sibling with the matching gloss owns it, and this one has none yet.
  const [match] = matches;
  const mine = glossOf(english);
  if (english && match.gloss !== mine && siblingGlosses.includes(match.gloss)) return null;
  return match;
}

/**
 * The exact て-form or ない-form, given the verb's dictionary-form card. Null when the deck has no
 * dictionary form for it yet, in which case the gap is still reported, without `expected`.
 *
 * The class falls out of the pair: たべ + る is the whole of たべる, so Regular 2, while かえり + る is
 * not かえる, so Regular 1. する and くる are named by their dictionary form, and いく is the one
 * Regular 1 verb whose き stem takes って (the book stars it as an exception).
 */
export function jaExpectedForm(masu, form, dictionaryCards, english = null, siblingGlosses = []) {
  const found = jaDictionaryOf(masu, dictionaryCards, english, siblingGlosses);
  if (!found) return null;
  const { dictionary, prefix } = found;
  const stem = stemOf(masu).slice(prefix.length);
  const pre = stem.slice(0, -1);
  const last = stem.at(-1);
  const te = form === "te";
  if (dictionary.endsWith("する")) return te ? `${stem}て` : `${stem}ない`;
  if (dictionary.endsWith("くる") && last === "き") return te ? `${stem}て` : `${pre}こない`;
  if (dictionary === `${stem}る`) return te ? `${stem}て` : `${stem}ない`;
  if (dictionary === "ある" && stem === "あり") return te ? "あって" : "ない";
  if (te && dictionary.endsWith("いく") && last === "き") return `${pre}って`;
  const row = R1[last];
  if (!row) return null;
  return te ? `${pre}${row.te}` : `${pre}${row.nai}ない`;
}

export const CARRIED_FORMS = {
  ja: [
    {
      id: "dictionary",
      label: "dictionary form",
      // The English every dictionary-form card in this deck carries. It is also how the check knows
      // the book has introduced the form at all: no such card yet, no form owed.
      isForm: (item) => DICTIONARY_MARKER.test(item.english ?? ""),
      // Every dictionary-form gap so far has been given an extras sentence (owner ruling 2026-10-12).
      wantsSentence: true,
      isSource: jaIsVerbEntry,
      candidates: jaDictionaryCandidates,
      expected: () => null,
      covers: jaCovers,
    },
    {
      id: "te",
      label: "て-form",
      // "Go (て-form of いきます)" and "Sit down (て-form)" are the two shapes in the deck.
      isForm: (item) => /\(て-form\b/.test(item.english ?? ""),
      // The owner chose no extras sentence per form for these (2026-10-30): the extras already hold
      // plenty of てください and てもいいですか sentences.
      wantsSentence: false,
      isSource: jaIsVerbEntry,
      candidates: (masu) => jaFormCandidates(masu, "te"),
      expected: (masu, dictionaryCards, english, siblings) =>
        jaExpectedForm(masu, "te", dictionaryCards, english, siblings),
      covers: jaCovers,
    },
    {
      id: "nai",
      label: "ない-form",
      // Glossed as a negative ("Does not drink", "Is not there") with no form label, so the shape of
      // the card is the marker: a bare word ending in ない whose English says "not". An adjective like
      // あぶない ("Dangerous") is not one, and neither is an adjective's negative (おおきくない,
      // きれいじゃない): Busy People's Casual Style 1 interlude teaches those before Lesson 18, and
      // counting them made every verb in the book owe a ない-form there.
      isForm: (item) =>
        /ない$/.test(item.target ?? "") &&
        !/(くない|じゃない|ではない)$/.test(item.target ?? "") &&
        !/[、。？！?!\s]/.test(item.target ?? "") &&
        /\bnot\b|n't\b/i.test(item.english ?? ""),
      wantsSentence: false,
      isSource: jaIsVerbEntry,
      candidates: (masu) => jaFormCandidates(masu, "nai"),
      expected: (masu, dictionaryCards, english, siblings) =>
        jaExpectedForm(masu, "nai", dictionaryCards, english, siblings),
      covers: jaCovers,
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
 * hold a card of that form. The unit that introduces it also owes it for every verb taught BEFORE
 * it, which is how a verb from Lesson 9 gets its dictionary form in Lesson 15.
 *
 * `laterItems` is every LATER unit's, and is for checking a finished book: a form carded in a later
 * lesson than the one that owed it is still in the deck, and reporting it would be a false alarm.
 * A build passes none, because later lessons do not exist yet.
 *
 * A gap's `target` is the ます form it was owed by and its `key` is what the gap filler's `fillsGap`
 * answers with. `expected`, when present, is the exact target the card must carry.
 */
export function missingCarriedForms(
  items,
  { priorItems = [], laterItems = [], languageCode } = {},
) {
  const code = resolveIso639Code(languageCode);
  const specs = code ? CARRIED_FORMS[code] : null;
  if (!specs) return null;
  const here = shipping(items);
  const before = shipping(priorItems);
  const later = shipping(laterItems);
  const everything = [...before, ...here];
  const dictionaryCards = [...everything, ...later].filter((i) =>
    DICTIONARY_MARKER.test(i.english ?? ""),
  );
  const gaps = [];
  for (const spec of specs) {
    const introducedBefore = before.some(spec.isForm);
    const introducedHere = here.some(spec.isForm);
    if (!introducedBefore && !introducedHere) continue;
    const have = [...everything, ...later].filter(spec.isForm).map((i) => i.target);
    const sources = introducedBefore ? here : everything;
    const seen = new Set();
    const keys = new Set();
    for (const item of sources) {
      if (!spec.isSource(item)) continue;
      const siblings = [...everything, ...later]
        .filter((i) => i !== item && i.target === item.target && spec.isSource(i))
        .map((i) => glossOf(i.english));
      const expected = spec.expected(item.target, dictionaryCards, item.english, siblings);
      // One verb carded under two senses (やすみます "rest" and "take a day off") owes one form, so it
      // is seen once. Two verbs that share a spelling (おきます "put" and "get up") have different
      // forms, and the exact form is what keeps them apart.
      const identity = `${item.target}|${expected ?? ""}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      // The exact form, when known, is the only thing that closes the gap. The candidates would let
      // a homophone's card close it: おかない ("does not put") is one of おきます's candidates, and it
      // is not the ない-form of おきます "get up".
      const forms = expected ? [expected] : spec.candidates(item.target);
      // An exact form closes the gap whatever the card calls itself: あるいて is carded in Lesson 7
      // as "On foot", and it is the て-form of あるきます all the same.
      const pool = expected ? [...everything, ...later].map((i) => i.target) : have;
      if (forms.some((form) => pool.some((h) => spec.covers(h, form)))) continue;
      // What the gap filler's `fillsGap` answers with. Not the ます form alone: a verb taught after
      // Lesson 22 owes three forms at once, and three cards answering "のみます" could not be told
      // apart. A homophone owing the same form gets its gloss added for the same reason.
      let key = `${item.target} (${spec.label})`;
      if (keys.has(key)) key = `${item.target} (${spec.label}, ${glossOf(item.english)})`;
      keys.add(key);
      gaps.push({
        key,
        target: item.target,
        english: item.english ?? null,
        carriedForm: spec.label,
        ...(expected ? { expected } : {}),
        wantsSentence: spec.wantsSentence,
        sourceId: item.id ?? null,
      });
    }
  }
  return gaps;
}

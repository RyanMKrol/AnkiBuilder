// Verbs a sentence uses that no card teaches.
//
// WHY THIS EXISTS. The untaught-words check finds a word by substring containment over a space-free
// script, and a verb can hide inside an unrelated word there. Two Nihongo 102 sentences in Busy People
// Lesson 9 used おきます ("get up") for weeks with no card for it anywhere: the leftover piece おき sat
// inside おおきい ("big"), an earlier card, so the check called it met. Found by the owner in review,
// 2026-10-30.
//
// WHY VERBS, AND NOT EVERY WORD. A real morphological analyser (kuromoji, already a dependency) was
// tried first. On kana-only text it cannot find word boundaries: run over this deck it reported 445
// "uncarded" words, almost all fragments (むら out of なかむら, ぎん out of ぎんこう). A verb does not
// need one. It announces itself with its ending (ます, てください, ないでください, まえに), and the
// deck cards verbs in their ます form, so the ending can be walked back to the exact entry to look up.
// Nouns have no such ending, and remain the containment test's job.
//
// HOW A VERB IS FOUND. Each ending pattern gives the ます stems it could have come from (って comes
// from い, ち or り). The verb's first kana is wherever a particle, punctuation or a known adverb
// stops, so every start point is tried, longest first. A start point inside a run of kana needs two
// kana at least, because one kana is what let おきます pass as きます; only し (する) and い (いる)
// are short and common enough to be allowed anywhere.
//
// It is a report, not a verdict: a quoted って or a set expression can still be read as a verb.

/** Polite endings that close a carded verb entry: のどがかわきました counts for かわきます. */
const JA_POLITE = /(ませんでした|ました|ません|ます)$/;

const U_TO_I = {
  う: "い",
  く: "き",
  ぐ: "ぎ",
  す: "し",
  つ: "ち",
  ぬ: "に",
  ぶ: "び",
  む: "み",
  る: "り",
};
const A_TO_I = {
  わ: "い",
  か: "き",
  が: "ぎ",
  さ: "し",
  た: "ち",
  な: "に",
  ば: "び",
  ま: "み",
  ら: "り",
};

const TE_NEXT = "(?=ください|もいい|から|[、。？！?!]|います|いません|いました|いる|$)";

/**
 * Each ending, and the ます stems the text before it could be. The text before is the verb's own
 * kana up to the ending, so `p` for まってください's って is ま.
 */
const JA_ENDINGS = [
  [/(ませんでした|ましょうか|ましょう|ませんか|ません|ました|ます)/g, (p) => [p]],
  [/(たいです|たかったです|たくないです|たい)(?=です|[、。？！?!]|$|と|の|けど|から)/g, (p) => [p]],
  [new RegExp(`(って)${TE_NEXT}`, "g"), (p) => [`${p}い`, `${p}ち`, `${p}り`, `${p}き`]],
  [new RegExp(`(んで)${TE_NEXT}`, "g"), (p) => [`${p}み`, `${p}び`, `${p}に`]],
  [new RegExp(`(いて)${TE_NEXT}`, "g"), (p) => [`${p}き`, `${p}い`]],
  [new RegExp(`(いで)${TE_NEXT}`, "g"), (p) => [`${p}ぎ`]],
  [new RegExp(`(て)${TE_NEXT}`, "g"), (p) => [p]],
  [
    /(ないでください|なかった|ない)(?=です|[、。？！?!]|$|よ|ね|の|から|けど|で)/g,
    (p) => {
      const last = p.at(-1);
      const out = [p];
      if (A_TO_I[last]) out.push(`${p.slice(0, -1)}${A_TO_I[last]}`);
      if (last === "こ") out.push(`${p.slice(0, -1)}き`);
      return out;
    },
  ],
  [
    // Only where a dictionary form has to stand: のが alone also starts のがくせい ("the student").
    /(る|う|く|ぐ|す|つ|む|ぶ|ぬ)(?=まえに|のが(?:すき|きらい|じょうず|へた)|ことが|つもり)/g,
    (p, ending) => {
      if (ending !== "る") return [`${p}${U_TO_I[ending]}`];
      const out = [p, `${p}り`];
      if (p.endsWith("く")) out.push(`${p.slice(0, -1)}き`);
      if (p.endsWith("す")) out.push(`${p.slice(0, -1)}し`);
      return out;
    },
  ],
];

const JA_BOUNDARY = /[はがをにでへもとや、。？！?!\s\u3000]/;
/** Words a verb can follow with no one-kana particle between: multi-kana particles and adverbs. */
const JA_BOUNDARY_WORDS = [
  "から",
  "まで",
  "より",
  "けど",
  "あまり",
  "もういちど",
  "まっすぐ",
  "ちょっと",
  "すこし",
  "また",
  "まだ",
  "もう",
  "よく",
  "ぜんぜん",
  "ゆっくり",
  "はやく",
  "ぜひ",
  "いつも",
  "ときどき",
  "たくさん",
];
/** Set expressions that end like a verb and are carded, if at all, as wholes. */
const JA_FIXED =
  /(ございま|すみませ|しつれいしま|はじめまし|おねがいしま|いただきま|おじゃましま|いってらっしゃい|いってきま|おかえりなさい)/;
const SHORT_ANYWHERE = new Set(["し", "い"]);

/** The ます stems the deck teaches through `items`, phrases counted by their verb. */
function jaTaughtStems(items) {
  const stems = new Set(["し"]);
  for (const item of items) {
    const target = item.target ?? "";
    if (!JA_POLITE.test(target) || /[、。？！?!]/.test(target)) continue;
    const stem = target.replace(JA_POLITE, "");
    stems.add(stem);
    const verb = stem.match(/[をが]([^をが]+)$/);
    if (verb) stems.add(verb[1]);
  }
  return stems;
}

function jaUncardedVerbs(sentence, taughtItems) {
  const stems = jaTaughtStems(taughtItems);
  // A word card can carry the whole thing: an adjective (つまらない), a set phrase (きをつけて), a
  // request learnt as one (おしえてください).
  const words = new Set(
    taughtItems
      .map((i) => i.target)
      .filter((t) => typeof t === "string" && !/[、。？！?!]/.test(t)),
  );
  const byEnd = new Map();
  for (const [pattern, toStems] of JA_ENDINGS) {
    pattern.lastIndex = 0;
    for (let m; (m = pattern.exec(sentence));) {
      const ending = m[1];
      const before = sentence.slice(0, m.index);
      if (!before) continue;
      if (JA_FIXED.test(sentence.slice(Math.max(0, m.index - 6), m.index + ending.length + 1))) {
        continue;
      }
      // ています: the verb is the て-form in front of it, judged by its own pattern.
      if (/^ま/.test(ending) && /[てで]い$/.test(before)) continue;
      // The copula's negative, not a verb.
      if (/(じゃ|では)あり$/.test(before)) continue;
      // An adjective's or a たい's negative, and the で of ないでください.
      if (ending.startsWith("な") && /(く|じゃ|では)$/.test(before)) continue;
      if (ending === "いで" && before.endsWith("な")) continue;
      const end = m.index + ending.length;
      // A name that happens to end like a verb: やましたさん.
      if (/^(さん|ちゃん|くん|さま)/.test(sentence.slice(end))) continue;
      // The casual topic marker (にっこうって、…) once the deck has carded it. Both the って and the
      // て pattern end on it, so the test is on where they end.
      if (
        words.has("って") &&
        sentence.slice(end - 2, end) === "って" &&
        /^[、？?]/.test(sentence.slice(end))
      ) {
        continue;
      }

      const entry = byEnd.get(end) ?? { surface: null, covered: false };
      byEnd.set(end, entry);
      if (entry.covered) continue;
      const tail = sentence.slice(m.index).split(/[、。？！?!]/)[0];
      for (let k = 0; k < before.length && !entry.covered; k++) {
        const word = before.slice(k);
        if (/[、。？！?!\s]/.test(word)) continue;
        const atBoundary =
          k === 0 ||
          JA_BOUNDARY.test(before[k - 1]) ||
          JA_BOUNDARY_WORDS.some((a) => before.slice(0, k).endsWith(a));
        if (atBoundary) {
          entry.surface = `${word}${ending}`;
          if (
            words.has(`${word}${ending}`) ||
            words.has(`${word}${ending}です`) ||
            words.has(`${word}${tail}`) ||
            // つまらなかった is the past of つまらない, which has its own card.
            (ending.startsWith("な") && words.has(`${word}ない`))
          ) {
            entry.covered = true;
            break;
          }
        }
        for (const stem of toStems(word, ending)) {
          if (!stem) continue;
          if (!atBoundary && [...stem].length < 2 && !SHORT_ANYWHERE.has(stem)) continue;
          if (stems.has(stem)) {
            entry.covered = true;
            break;
          }
        }
      }
    }
  }
  const found = [];
  for (const entry of byEnd.values()) {
    if (!entry.covered && entry.surface && !found.includes(entry.surface))
      found.push(entry.surface);
  }
  return found;
}

const SCANNERS = { ja: jaUncardedVerbs };

/**
 * The verbs in `sentence` that none of `taughtItems` teaches, as they appear in the sentence
 * (`おきます`, `ねました`). Null for a language with no scanner, so a caller can tell "nobody looked"
 * from "nothing found".
 */
export function uncardedVerbs(sentence, taughtItems, languageCode) {
  const scan = SCANNERS[languageCode];
  if (!scan || typeof sentence !== "string") return null;
  return scan(sentence, taughtItems ?? []);
}

import { defineCheck } from "../registry.js";
import { unitLanguage } from "../units.js";
import { lintRomaji, unlintedRuleIds, ROMAJI_STYLES } from "../../translate/romajiStyle.js";
import { normalizeDisplayText } from "../../model/scriptSpacing.js";

// The romanization checks. Both read ONE collection and compare its cards against that collection's
// own content or against the pinned style constant — never against another collection (golden rule
// 7).

const shipped = (unit) => unit.items.filter((item) => !item.excluded);
// No default: a unit with no declared language gets no romanization verdict at all. Both checks
// below already gate on ROMAJI_STYLES[language] existing, and `null` is simply not a key there.
const langOf = (unit) => unitLanguage(unit);

export const romajiStyleCheck = defineCheck({
  id: "romaji-style",
  title: "romaji style",
  scope: "unit",
  tier: "INFO",
  // INFO, deliberately and permanently. Every hit is a real deviation from the pinned spec, but the
  // FIX is a paid pass over the card, not a regex: `dou` → `dō` is safe until the word is 同. So this
  // reports and the operator decides when a batch is worth re-running. Promoting it to FAIL would
  // block every review on 412 pre-existing cards, which is how a gate becomes an override habit.
  //
  // The style itself lives in src/translate/romajiStyle.js and is the SAME array injected into the
  // romanization, number-reading and fill-in-the-blank prompts. A rule cannot be linted here without
  // being taught there, which is the whole point of the shared constant.
  run({ unit }) {
    const language = langOf(unit);
    if (!ROMAJI_STYLES[language]) {
      return { findings: [], summary: `${language}: no pinned romanization style` };
    }

    const findings = [];
    const byRule = new Map();
    let checked = 0;

    for (const item of shipped(unit)) {
      if (typeof item.pronunciation !== "string" || !item.pronunciation.trim()) continue;
      checked++;
      const broken = lintRomaji(item.pronunciation, language);
      for (const { id, offender } of broken) {
        byRule.set(id, (byRule.get(id) ?? 0) + 1);
        findings.push({
          // Keyed on card AND rule: accepting "this card's trailing period is fine" must not also
          // accept a counter fused in the same card later.
          key: `${item.id}::${id}`,
          message: `${item.id}  ${id}: "${item.pronunciation}" — ${offender}`,
        });
      }
    }

    const unlinted = unlintedRuleIds(language);
    return {
      findings,
      summary: `${checked} romanization(s) match the pinned ${language} style`,
      // Say what was NOT looked at. A rule that is taught but undecidable by regex is exactly the
      // kind of gap that otherwise reads as a pass.
      notes: [
        ...(byRule.size
          ? [
              [...byRule.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => `${id}×${n}`)
                .join(", "),
            ]
          : []),
        ...(unlinted.length ? [`taught but not linted: ${unlinted.join(", ")}`] : []),
      ],
    };
  },
});

// The cross-card pass. `romaji-style` reads each card against the pinned spec, which cannot see the
// same word spelled two ways on two cards: `iie` on one card and `īe` on the next are each a
// plausible romanization alone, and only together do they look like a distinction being taught
// (QA theme 9). So this pass splits every card at its punctuation, pairs each kana segment with the
// romaji segment in the same position, and reports a segment this collection spells more than one
// way. ONE collection only, as everywhere in this file.
//
// Only all-kana segments of two or more characters are compared. A kanji string can have two
// readings (今日 is `kyō` and `konnichi`), and a one-kana segment can be two words: は is the
// particle `wa` on one card and 歯 "tooth" `ha` on another.
const KANA_SEGMENT = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]{2,}$/u;
const JA_BREAK = /[、。？！?!,，]+/;
const ROMAJI_BREAK = /[,.?!]+/;
// Case and hyphens are left out of the comparison. Casing is the unlinted proper-noun rule, and a
// hyphen is the counter rule's business, which `romaji-style` already reports: にほん is `Nihon`
// (Japan) and `ni-hon` (two bottles), and those are two words, not one word spelled two ways.
const spelling = (text) => text.trim().toLowerCase().replace(/-/g, "");

function segmentPairs(item, language) {
  const spoken =
    typeof item.ttsText === "string" && item.ttsText.trim() ? item.ttsText : item.target;
  if (typeof spoken !== "string" || typeof item.pronunciation !== "string") return [];
  const kana = spoken
    .split(JA_BREAK)
    .map((part) => normalizeDisplayText(part, language).trim())
    .filter(Boolean);
  const roman = item.pronunciation
    .split(ROMAJI_BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
  // Segments that do not line up one for one cannot be paired, and a guess would invent findings.
  if (!kana.length || kana.length !== roman.length) return [];
  return kana
    .map((segment, i) => [segment, roman[i]])
    .filter(([segment]) => KANA_SEGMENT.test(segment));
}

// A doubled vowel where the pinned style writes a macron. `ou`/`oo` are already reported per card
// by `romaji-style`; `ii` and `ei` are the style's two kept spellings. `uu`, `ee` and `aa` are left
// out of the per-card lint because a doubled vowel can sit across a morpheme boundary (みずうみ is
// `mizuumi`), so here they are reported only where the collection itself writes macrons, which is
// the evidence that its convention is the macron and this spelling is the odd one out.
const DOUBLED_VOWEL = /(?:uu|ee|aa)/i;
const MACRON = /[āīūēō]/i;

export const romajiConsistencyCheck = defineCheck({
  id: "romaji-consistency",
  title: "romaji consistency",
  scope: "collection",
  tier: "INFO",
  run({ units }) {
    if (!units.length || !ROMAJI_STYLES[langOf(units[0])]) {
      return { skipped: "no pinned romanization style for this collection's language" };
    }
    const language = langOf(units[0]);

    // kana segment -> spelling -> [where]
    const spellings = new Map();
    let usesMacrons = false;
    for (const unit of units) {
      for (const item of shipped(unit)) {
        if (typeof item.pronunciation === "string" && MACRON.test(item.pronunciation)) {
          usesMacrons = true;
        }
        for (const [segment, roman] of segmentPairs(item, language)) {
          if (!spellings.has(segment)) spellings.set(segment, new Map());
          const bySpelling = spellings.get(segment);
          const key = spelling(roman);
          if (!bySpelling.has(key)) bySpelling.set(key, { shown: roman, where: [] });
          bySpelling.get(key).where.push(`${unit.name}/${item.id}`);
        }
      }
    }

    const findings = [];
    for (const [segment, bySpelling] of spellings) {
      if (bySpelling.size < 2) continue;
      const variants = [...bySpelling.values()]
        .sort((a, b) => b.where.length - a.where.length)
        .map(
          (v) =>
            `"${v.shown}" ×${v.where.length} (${v.where.slice(0, 3).join(", ")}${v.where.length > 3 ? ", ..." : ""})`,
        );
      findings.push({
        key: `two-ways::${segment}`,
        message: `${segment} is romanized ${bySpelling.size} ways: ${variants.join("; ")}`,
      });
    }

    let doubled = 0;
    if (usesMacrons) {
      for (const unit of units) {
        for (const item of shipped(unit)) {
          if (typeof item.pronunciation !== "string") continue;
          const match = item.pronunciation.match(DOUBLED_VOWEL);
          if (!match) continue;
          doubled++;
          findings.push({
            key: `doubled-vowel::${unit.name}/${item.id}`,
            message: `${unit.name}/${item.id}  "${item.pronunciation}" writes "${match[0]}" where this collection writes macrons`,
          });
        }
      }
    }

    return {
      findings,
      summary: `${spellings.size} kana segment(s) romanized one way across the collection`,
      notes: [
        ...(doubled
          ? [
              `${doubled} doubled uu/ee/aa: a macron unless the vowels straddle two morphemes (mizuumi)`,
            ]
          : []),
        ...(usesMacrons
          ? []
          : ["no macron anywhere in this collection, so doubled vowels were not judged"]),
      ],
    };
  },
});

// A parenthetical romanization inside a learner-facing note: `はじめまして (hajimemashite)`. The
// extraction prompt MANDATES one whenever a note quotes non-Roman script, and none of them passes
// through the romanization pipeline — only the `pronunciation` FIELD does. So the deck carries two
// romanizations of the same string, one audited and one not.
//
// The quoted run deliberately spans SPACES (`この ほん (kono hon)`), because a note quotes a phrase
// as often as a word and the parenthetical romanizes whatever it quoted. Matching only the last
// token would compare `kono hon` against the ほん card and call it a disagreement.
const TARGET_CHAR = "\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}ー々〜～";
const INLINE_ROMANIZATION = new RegExp(
  `([${TARGET_CHAR}][${TARGET_CHAR} \\u3000]*)\\(([A-Za-zāīūēō'’ .-]+)\\)`,
  "gu",
);

// The fields a learner (or a reviewer) actually reads. `reviewNote` is internal but is included
// because it is where a wrong romanization gets copied FROM when a card is fixed by hand.
const NOTE_FIELDS = ["note", "hint", "scene", "reviewNote"];

// Case, spaces, apostrophes and hyphens are all style axes the pinned spec governs separately, and
// the romaji-style check above already reports them. Comparing without them isolates the question
// this check is asking: are these two romanizations of the same string the SAME WORD?
const compare = (text) => text.toLowerCase().replace(/[\s.'’-]/g, "");

export const inlineRomanizationCheck = defineCheck({
  id: "inline-romaji",
  title: "inline romaji",
  scope: "collection",
  tier: "INFO",
  // Ground truth is in the same file: every inline `(roman)` spelling is looked up against the
  // audited `pronunciation` of the card in THIS collection whose target is that same string. No new
  // judgement, no model call, and no second collection is read — the lookup table is built from this
  // collection's own cards and nothing else (golden rule 7).
  run({ units }) {
    if (!units.length || !ROMAJI_STYLES[langOf(units[0])]) {
      return { skipped: "no pinned romanization style for this collection's language" };
    }

    // This collection's audited spellings, keyed by the exact string the card teaches, normalized
    // the way the deck stores display text (editorial spaces and a trailing 。 removed) so that a
    // note quoting `この ほん` resolves against the card written `このほん`. `ttsText` first: it is the
    // SPOKEN form, and it is what `pronunciation` was derived from.
    const language = langOf(units[0]);
    const key = (text) => normalizeDisplayText(String(text), language).trim();
    const audited = new Map();
    for (const unit of units) {
      for (const item of shipped(unit)) {
        if (typeof item.pronunciation !== "string" || !item.pronunciation.trim()) continue;
        for (const source of [item.ttsText, item.target]) {
          if (typeof source !== "string" || !source.trim()) continue;
          if (!audited.has(key(source))) audited.set(key(source), item.pronunciation);
        }
      }
    }

    const findings = [];
    let pairs = 0;
    let resolved = 0;

    for (const unit of units) {
      for (const item of unit.items) {
        for (const field of NOTE_FIELDS) {
          const value = item[field];
          if (typeof value !== "string") continue;
          for (const match of value.matchAll(INLINE_ROMANIZATION)) {
            pairs++;
            const quoted = key(match[1]);
            const inline = match[2].trim();
            const truth = audited.get(quoted);
            if (!truth) continue;
            resolved++;
            if (compare(truth) === compare(inline)) continue;
            findings.push({
              key: `${unit.name}/${item.id}::${field}::${quoted}`,
              message: `${unit.name}/${item.id} ${field}: ${quoted} (${inline}) — this deck's own card says "${truth}"`,
            });
          }
        }
      }
    }

    return {
      findings,
      summary: `${resolved} of ${pairs} inline romanization(s) match this deck's own pronunciation field`,
      // The unresolved remainder is not a pass. A quoted string with no card of its own (a fragment,
      // an inflected form) simply has no ground truth here, and saying so is the difference between
      // "checked and clean" and "could not check".
      notes:
        pairs > resolved
          ? [`${pairs - resolved} inline pair(s) quote a string this deck has no card for`]
          : [],
    };
  },
});

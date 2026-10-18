import { defineCheck } from "../registry.js";
import {
  isContextlessAnswer,
  isOverlongProductionFace,
  findNearSiblings,
  PRODUCTION_FACE_MAX_CHARS,
} from "../../cards/faceQuality.js";
import { unitLanguage } from "../units.js";
import { normalizeDisplayText } from "../../model/scriptSpacing.js";

// The first three checks are for three rules `references/card-authoring-rules.md` already states, and which until
// now nothing anywhere verified. All INFO: each detects a SHAPE, and whether that shape is a defect
// is a judgement about the card. "It's about ten minutes." with no scene is unanswerable as a
// Production prompt and completely fine as a Recognition one, and only the reviewer knows which the
// card is for.
//
// Every one reads a single unit or a single collection. Nothing here compares two collections.

const shipped = (unit) => unit.items.filter((item) => !item.excluded);

export const answerableAloneCheck = defineCheck({
  id: "answerable-alone",
  title: "answerable alone",
  scope: "unit",
  tier: "INFO",
  // The audit card-authoring-rules.md names in prose: the pipeline splits textbook Q&A pairs into
  // two cards that are then studied shuffled, weeks apart, so an answer card arrives with no memory
  // of its question. `scene` is what restores it, and it renders on the front of BOTH directions.
  //
  // Some of these are legitimately producible without one, which is why this never hard-fails.
  run({ unit }) {
    const findings = shipped(unit)
      .filter(isContextlessAnswer)
      .map((item) => ({
        key: item.id,
        message: `${item.id}  "${item.english}" — reads as a reply, and no scene names the question`,
      }));
    return {
      findings,
      summary: `every answer-shaped English carries a scene`,
    };
  },
});

export const productionLengthCheck = defineCheck({
  id: "production-length",
  title: "production length",
  scope: "unit",
  tier: "INFO",
  // A Production card asks the learner to produce the whole target from the whole English. Past
  // roughly a sentence that stops being one prompt: the live deck's longest is a three-sentence
  // self-introduction at 92 characters. Two honest resolutions, both human: split the card, or ship
  // it Recognition-only (the direction flag, `dirSuspended`).
  run({ unit }) {
    const findings = shipped(unit)
      .filter(isOverlongProductionFace)
      .map((item) => ({
        key: item.id,
        message: `${item.id}  ${item.english.length} chars — "${item.english}"`,
      }));
    return {
      findings,
      summary: `no Production face over ${PRODUCTION_FACE_MAX_CHARS} chars`,
      notes: findings.length
        ? ["split the card, or ship it Recognition-only with `dirSuspended: [1]`"]
        : [],
    };
  },
});

export const nearSiblingsCheck = defineCheck({
  id: "near-siblings",
  title: "near siblings",
  scope: "collection",
  tier: "INFO",
  // NARROW on purpose: only frames whose members are the same sentence with a different name or
  // number in it, and only when the frame still carries three ordinary words once its slots are
  // blanked. A blanket "3+ cards look alike" check groups `Yes`/`No`/`Germany` under one frame and
  // reports 270 cards, and it fires on `Nine minutes`/`Six minutes` — which are not near siblings,
  // they are the counter series the lesson exists to teach.
  run({ units }) {
    const items = units.flatMap((unit) =>
      shipped(unit).map((item) => ({ ...item, unit: unit.name })),
    );
    const groups = findNearSiblings(items);
    const findings = groups.map((group) => ({
      // Keyed on the frame, not on a member: the question the reviewer answers is about the whole
      // group ("do all four of these earn their place?"), so accepting it once is the right grain.
      key: `frame::${group.frame}`,
      message:
        `${group.members.length}× "${group.frame}" — ` +
        group.members.map((m) => `${m.unit}/${m.id} "${m.english}"`).join("; "),
    }));
    return {
      findings,
      summary: `no sentence frame drilled 3+ times with only a name or number swapped`,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// Three more shapes, from the 2026-10 QA learner pass (qa/japanese-for-busy-people-book-1-kana/
// 2026-10-15/themes.md, themes 2, 7 and 11). Same footing as the three above: each is a SHAPE the
// fixer should look at, never a verdict, so all three are INFO and none can block.

// The fields a learner reads. `reviewNote` is left out on purpose: it is written for the builder,
// so builder-facing text there is exactly where it belongs.
const LEARNER_TEXT_FIELDS = ["note", "hint", "scene"];

// Text that points at something the learner cannot see. The card is studied alone and shuffled, so
// "the card above", "GRAMMAR 2" or "Member 3 of the set" resolves to nothing in a review.
//
// `above`/`below` are whole words on purpose. On the live deck every hit was a pointer to a
// sibling card; a うえ card whose note says "above" in its own sense would be a false positive, and
// an INFO finding is the right price for that.
const BUILDER_TEXT = [
  /\bGRAMMAR\s+\d/i,
  /\bNOTES\s+\d/,
  /\bsee (?:the )?NOTES\b/i,
  // Capitalised only: lowercase "exercise" is an ordinary English word (うんどう).
  /\b(?:Exercises?|EXERCISES?)\b/,
  /\b(?:above|below)\b/i,
  /\bmember \d+ of (?:the|a|this)\b[^.;]*\bset\b/i,
  /\bthis lesson['’]s dialogue\b/i,
];

/** Every builder-facing pointer in a card's learner-facing text, as `[{ field, match }]`. */
export function builderFacingText(item) {
  const hits = [];
  for (const field of LEARNER_TEXT_FIELDS) {
    const value = item[field];
    if (typeof value !== "string" || !value.trim()) continue;
    for (const pattern of BUILDER_TEXT) {
      const match = value.match(pattern);
      if (match) hits.push({ field, match: match[0] });
    }
  }
  return hits;
}

export const builderNoteCheck = defineCheck({
  id: "builder-note",
  title: "builder-facing note",
  scope: "unit",
  tier: "INFO",
  run({ unit }) {
    const findings = [];
    for (const item of shipped(unit)) {
      // One finding per card and field, however many pointers it holds: the fix is one rewrite.
      const byField = new Map();
      for (const hit of builderFacingText(item)) {
        if (!byField.has(hit.field)) byField.set(hit.field, new Set());
        byField.get(hit.field).add(hit.match);
      }
      for (const [field, matches] of byField) {
        findings.push({
          key: `${item.id}::${field}`,
          message: `${item.id} ${field}: ${[...matches].map((m) => `"${m}"`).join(", ")} points at something the learner cannot see`,
        });
      }
    }
    return {
      findings,
      summary: "no note, hint or scene points at a book section, a set or a sibling by position",
      notes: findings.length
        ? ["name the other card by its Japanese or English, or cut the clause"]
        : [],
    };
  },
});

// Which faces each cue field renders on (src/deck/cardTemplates.js): `scene` is on the front of
// BOTH directions, `hint` only on the Production front (the Recognition card shows it on the back).
// So a scene holding the English gives the Recognition answer away, and a scene or hint holding the
// target or its romaji gives the Production answer away. A hint holding the English is NOT a leak:
// the Production front already shows the English, and the Recognition front never shows the hint.
const LATIN_LETTER = "a-zāīūēōâîûêô";
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsWord = (haystack, needle) =>
  new RegExp(`(?<![${LATIN_LETTER}])${escapeRegex(needle)}(?![${LATIN_LETTER}])`, "iu").test(
    haystack,
  );
const japaneseKey = (text, language) =>
  String(normalizeDisplayText(String(text), language)).replace(/[〜～、。？！?!「」\s]/g, "");
const romajiKey = (text) =>
  String(text)
    .trim()
    .replace(/[.!?]+$/, "")
    .toLowerCase();
// The English as phrases to look for: round-bracketed disambiguators ("(casual)") and square
// brackets dropped, alternatives split on / and ;, punctuation trimmed.
const englishPhrases = (english) =>
  String(english)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/\s*[/;]\s*/)
    .map((part) =>
      part
        .replace(/[.!?…"“”]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter((part) => part.length >= 3);

// Below these lengths a substring is noise: a one-kana particle target is inside half the scenes
// written in Japanese, and a two-letter romaji (`wa`, `ga`) is inside ordinary English words.
const MIN_TARGET_CHARS = 2;
const MIN_ROMAJI_CHARS = 3;

/** Every way a card's cue fields give the answer away on a face they render on. */
export function cueLeaks(item, language) {
  const leaks = [];
  const target = typeof item.target === "string" ? japaneseKey(item.target, language) : "";
  const romaji = typeof item.pronunciation === "string" ? romajiKey(item.pronunciation) : "";
  const leaksTarget = (value) => {
    if (target.length >= MIN_TARGET_CHARS && japaneseKey(value, language).includes(target)) {
      return "the target";
    }
    if (romaji.length >= MIN_ROMAJI_CHARS && containsWord(value, romaji)) return "its romaji";
    return null;
  };

  if (typeof item.scene === "string" && item.scene.trim()) {
    const what = leaksTarget(item.scene);
    if (what) leaks.push({ field: "scene", face: "Production", what });
    const phrase = englishPhrases(item.english ?? "").find((p) => containsWord(item.scene, p));
    if (phrase)
      leaks.push({ field: "scene", face: "Recognition", what: `the English "${phrase}"` });
  }
  if (typeof item.hint === "string" && item.hint.trim()) {
    const what = leaksTarget(item.hint);
    if (what) leaks.push({ field: "hint", face: "Production", what });
  }
  return leaks;
}

export const cueLeakCheck = defineCheck({
  id: "cue-leak",
  title: "cue gives the answer away",
  scope: "unit",
  tier: "INFO",
  // INFO because a mandated collision cue is sometimes allowed a small leak (the QA pass rejected
  // eight such reports), and only the reviewer knows which cue that is.
  run({ unit }) {
    const language = unitLanguage(unit);
    const findings = [];
    for (const item of shipped(unit)) {
      for (const leak of cueLeaks(item, language)) {
        findings.push({
          key: `${item.id}::${leak.field}::${leak.face}`,
          message: `${item.id} ${leak.field} holds ${leak.what}, and renders on the ${leak.face} front`,
        });
      }
    }
    return {
      findings,
      summary: "no scene or hint shows the answer on a face it renders on",
      notes: findings.length
        ? ["scene renders on both fronts, hint on the Production front only"]
        : [],
    };
  },
});

// A note calling a ます form "plain" or "dictionary". Every ます, ました, ません and でした form is
// polite, and the learner meets no plain form until the book teaches one, so the label is wrong
// (`chapter-10/machimasu`, the one blocker in the QA pass) or untaught.
//
// The polite endings a target has to end in. Bare です is left out: a sentence ending in です often
// has a note explaining a dictionary-form verb INSIDE it (みるのがすきです), which is correct.
const POLITE_ENDING = /(?:ます|ました|ません|ませんか|ませんでした|ましょう|でした|かったです)$/;
const FORM_LABEL =
  "(?:plain|dictionary)(?:\\s*/\\s*(?:plain|dictionary))?\\s+" +
  "(?:(?:past|present|non-past|negative|affirmative)\\s+)?(?:ます[-\\s]?)?form\\b";
// The shapes that label THE CARD: a sentence that opens with the label, "is its plain past form",
// "this plain form", or a bare "plain past/present/negative" opening a sentence. A label naming some
// OTHER word ("かく is the dictionary form", "Its dictionary form うたう") is the correct use of the
// term and is not matched.
const SENTENCE_START = "(?:^|[.;:!?]\\s+)(?:(?:the|a|this is (?:the|a))\\s+)?";
const KANA_NEXT = "(?!\\s*[:(（]?\\s*[\\p{Script=Hiragana}\\p{Script=Katakana}])";
const LABELS_THIS_CARD = [
  new RegExp(`${SENTENCE_START}${FORM_LABEL}${KANA_NEXT}`, "iu"),
  new RegExp(`\\b(?:is its|this)\\s+${FORM_LABEL}`, "iu"),
  new RegExp(`${SENTENCE_START}plain\\s+(?:past|present|non-past|negative)\\b`, "iu"),
];

/** The phrase that labels this polite-form card "plain" or "dictionary", or `null`. */
export function politeFormMislabel(item, language) {
  if (typeof item.target !== "string") return null;
  if (!POLITE_ENDING.test(japaneseKey(item.target, language))) return null;
  for (const field of ["note", "hint"]) {
    const value = item[field];
    if (typeof value !== "string") continue;
    for (const pattern of LABELS_THIS_CARD) {
      const match = value.match(pattern);
      if (match) return { field, match: match[0].replace(/^[.;:!?\s]+/, "") };
    }
  }
  return null;
}

export const politeFormLabelCheck = defineCheck({
  id: "polite-form-label",
  title: "ます form labelled plain",
  scope: "unit",
  tier: "INFO",
  run({ unit }) {
    const language = unitLanguage(unit);
    if (language !== "ja") return { findings: [], summary: `${language}: a Japanese-only shape` };
    const findings = [];
    for (const item of shipped(unit)) {
      const hit = politeFormMislabel(item, language);
      if (!hit) continue;
      findings.push({
        key: `${item.id}::${hit.field}`,
        message: `${item.id} ${hit.field}: "${hit.match}" on the polite form ${item.target}`,
      });
    }
    return {
      findings,
      summary: "no note calls a ます form plain or dictionary",
      notes: findings.length ? ["a ます form is polite: call it the ます form"] : [],
    };
  },
});

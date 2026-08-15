import { defineCheck } from "../registry.js";
import { normalizeDisplayText } from "../../model/scriptSpacing.js";

// Every existing note check in this repo is STRUCTURAL: does the note exist, does it restate the
// gloss, does it quote a romanization, does it reference a later lesson. None of them asks whether
// what the note SAYS is true — and a shipped note currently teaches a false morphological analysis
// (なんじ and なんにん presented as instances of なんの) that survived extraction, the cross-lesson note
// pass, the corpus review and Mark done.
//
// This does not fix that, because it cannot: whether お + かし = おかし is a real decomposition is a
// question about Japanese, and nothing deterministic answers it. What it does is produce the LIST —
// every note making a claim of the "X + Y", "the て-form of X", "distinct from X" shape — and, for
// each target-script string the claim names, say whether this collection teaches a card for it. The
// verdict stays human. That split is deliberate: a checker that guessed would be a fourth pass that
// looks like it verified something.
//
// Reads one unit and this collection's own card list. No second collection is consulted.

// The shapes a decomposition/derivation claim takes in this deck's notes. Each one asserts a
// relationship between the card and some OTHER form, which is exactly the class of claim that can be
// confidently wrong.
const CLAIM_PATTERNS = [
  ["composition", /\S\s*\+\s*\S/, "asserts a composition (X + Y)"],
  ["derivation", /\b(?:forms? of|built from|comes from|derived from)\b/i, "asserts a derivation"],
  ["distinction", /\bdistinct from\b/i, "asserts a distinction from another form"],
  ["identity", /\bthe same (?:word|as)\b/i, "asserts two cards are the same word"],
  ["instance", /\bis (?:an? )?(?:instance|example) of\b/i, "asserts membership of a pattern"],
];

// The fields a claim can live in. `reviewNote` is excluded on purpose: it is internal rationale
// aimed at the reviewer, not something the deck teaches.
const CLAIM_FIELDS = ["note", "hint", "scene"];

// A run of target script, as a note writes it. The `(romanization)` that the authoring rules require
// after such a run is stripped by the capture group boundary, so this yields the bare form.
const TARGET_RUN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}][\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]*/gu;

// Single kana that are grammar particles or the honorific prefix. They appear in almost every
// decomposition claim (お + くに, name + さん) and virtually never have a card of their own, so
// reporting them as unknown would bury the case this check exists for.
const FUNCTION_MORPHEMES = new Set([
  "お",
  "ご",
  "は",
  "が",
  "を",
  "に",
  "で",
  "と",
  "の",
  "も",
  "へ",
  "や",
  "か",
  "ね",
  "よ",
  "て",
  "た",
  "な",
]);

const shipped = (unit) => unit.items.filter((item) => !item.excluded);

export const noteClaimsCheck = defineCheck({
  id: "note-claims",
  title: "note claims",
  scope: "unit",
  tier: "INFO",
  run({ unit, collection }) {
    const language = unit.meta?.targetLanguage ?? "ja";
    const key = (text) => normalizeDisplayText(String(text), language).trim();

    // Everything this COLLECTION teaches, so "the deck's own cards" is the whole product being made
    // coherent with itself — its lessons and its -extras units — and nothing beyond it.
    const taught = new Set();
    for (const sibling of collection.units) {
      for (const item of shipped(sibling)) {
        for (const form of [item.target, item.ttsText]) {
          if (typeof form === "string" && form.trim()) taught.add(key(form));
        }
      }
    }

    const findings = [];
    for (const item of shipped(unit)) {
      for (const field of CLAIM_FIELDS) {
        const text = item[field];
        if (typeof text !== "string" || !text.trim()) continue;
        const kinds = CLAIM_PATTERNS.filter(([, pattern]) => pattern.test(text));
        if (!kinds.length) continue;

        const unknown = [
          ...new Set(
            (text.match(TARGET_RUN) ?? [])
              .map(key)
              .filter((form) => form && !FUNCTION_MORPHEMES.has(form) && !taught.has(form)),
          ),
        ];

        findings.push({
          // One key per card+field: a note is rewritten as a whole, so accepting half of it is not a
          // thing the reviewer can do.
          key: `${item.id}::${field}`,
          message:
            `${item.id} ${field}: ${kinds.map(([, , label]) => label).join("; ")}` +
            (unknown.length
              ? ` — names ${unknown.map((f) => `「${f}」`).join(", ")}, which this deck teaches no card for`
              : " — every form it names has a card here") +
            `\n        "${text.replace(/\s+/g, " ").trim()}"`,
        });
      }
    }

    const unresolved = findings.filter((f) => /teaches no card for/.test(f.message)).length;
    return {
      findings,
      summary: "no note asserts a decomposition, derivation or identity",
      notes: findings.length
        ? [
            `${unresolved} of ${findings.length} claim(s) name a form this deck has no card for — ` +
              `read those first; the verdict on all of them is yours`,
          ]
        : [],
    };
  },
});

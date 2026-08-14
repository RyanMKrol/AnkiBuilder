import { defineCheck } from "../registry.js";
import {
  isContextlessAnswer,
  isOverlongProductionFace,
  findNearSiblings,
  PRODUCTION_FACE_MAX_CHARS,
} from "../../cards/faceQuality.js";

// Three checks for three rules `references/card-authoring-rules.md` already states, and which until
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

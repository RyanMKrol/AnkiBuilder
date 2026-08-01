import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { CATEGORIES } from "./categories.js";
import { deckPathForDir } from "../deck/deckFileName.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url)); // src/model/
const REPO_ROOT = resolve(join(MODULE_DIR, "..", ".."));

const CORPUS_SCHEMA = {
  type: "object",
  required: ["meta", "items"],
  properties: {
    meta: {
      type: "object",
      required: ["targetLanguage", "sourceType"],
      properties: {
        targetLanguage: { type: "string" },
        sourceType: {
          type: "string",
          enum: ["template", "epub", "manual"],
        },
        reviewed: { type: "boolean" },
        epubHash: { type: ["string", "null"] },
        chapterNumber: { type: ["number", "null"] },
        // Set only when an --epub lesson spans MORE THAN ONE spine file (see
        // epubLessons.js / listExternalChapters): chapterNumber is the lesson's first
        // spine file, lastChapterNumber its last. Omitted for a single-file lesson/chapter,
        // where the lesson is fully described by chapterNumber alone.
        lastChapterNumber: { type: ["number", "null"] },
        chapterLabel: { type: ["string", "null"] },
        // Set only for sourceType "manual" corpora assembled from a real-life
        // lesson's word list (see lessonCorpus.js) — the course's folder slug under
        // output/, the lesson-source analogue of epubHash's "which book" role.
        // chapterNumber/chapterLabel are reused as-is for the lesson number/display
        // name rather than adding near-duplicate lessonNumber/lessonLabel fields,
        // since both sourceTypes need the exact same "numbered sub-deck of a bigger
        // merged collection" shape — see resolveLessonRunDir in cli/outputPaths.js.
        courseSlug: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "english", "category", "target"],
        properties: {
          id: { type: "string" },
          english: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          // FRONT-of-card cue that helps the learner produce/recall the right answer — a short
          // disambiguator (e.g. "said when entering a room" for a card that shares its target with
          // another). Shown small under the prompt on BOTH card templates. Distinct from `note`.
          hint: { type: ["string", "null"] },
          // BACK-of-card context shown after answering (when/how to use it, how it differs from a
          // related card, cross-references). Renamed from `cardNote`. Internal-only rationale lives in
          // `reviewNote` and is NEVER shown in the deck.
          note: { type: ["string", "null"] },
          // Internal review-only rationale — why an item is `uncertain` or `aiSuggested`. Shown ONLY at
          // the dashboard review gates; NEVER embedded in the deck or shown in the read-only viewer.
          reviewNote: { type: ["string", "null"] },
          // Legacy alias for `note`, kept optional so pre-rename corpus.json still validates; the
          // migration folds `cardNote` into `note` and splits out `hint`.
          cardNote: { type: ["string", "null"] },
          target: { type: ["string", "null"] },
          // Optional spoken form: the target text with anything the romanizer/TTS
          // mishandles (notably digits — kuroshiro leaves "2,000えん" as "2 , 000 en",
          // and ElevenLabs may read it as an English number) spelled out in the target
          // language's own script (e.g. kana にせんえん). When set it drives BOTH the
          // romaji `pronunciation` and the `audio`; `target` stays the natural display
          // form. Carried through translate onto the card's `reading` field.
          reading: { type: "string" },
          uncertain: { type: "boolean" },
          aiSuggested: { type: "boolean" },
          // Set by the dashboard corpus review to mark an item for exclusion. Reversible in the live
          // UI (a toggle, not a delete); `translate` drops excluded items when it builds cards.json,
          // and the dedup-library copy saved at review time omits them too.
          excluded: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const CARDS_SCHEMA = {
  type: "object",
  properties: {
    meta: {
      type: "object",
      properties: {
        targetLanguage: { type: "string" },
        sourceType: {
          type: "string",
          enum: ["template", "epub", "manual"],
        },
        reviewed: { type: "boolean" },
        // Set on an EXTRAS unit (a `chapter-<n>-extras` / `lesson-<n>-extras` folder): the label of
        // the base lesson whose drills it holds. The merge nests the unit under that lesson rather
        // than beside it, so it ships as `Book::<baseChapterLabel>::Extras` while `chapterLabel`
        // stays the unit's own display name. See src/deck/rebuild.js.
        baseChapterLabel: { type: "string" },
        // Final human sign-off that a lesson is finished and shippable, set via the dashboard's "Mark
        // done" (distinct from `reviewed`, the corpus stage-1 gate). Only `done` lessons are merged
        // into the book/course deck (`rebuildBookDir`) and shown under "Built" on the dashboard.
        done: { type: "boolean" },
        // `prepare` step markers, so a re-run resumes rather than re-spending model calls (and never
        // re-mines a lesson whose source simply had no drills). `enriched`: the fill-in-the-blank +
        // semantic de-dup pass has run. `notesEnhanced`: the cross-lesson note pass has run.
        enriched: { type: "boolean" },
        notesEnhanced: { type: "boolean" },
        // Present INSTEAD of those markers when a pass ran without everything it needed — earlier
        // lessons of the book that had no cards.json yet, so the drill and note passes could not see
        // them. `{ at, reason, missing }`. Its presence is what makes a later `prepare` redo the
        // passes rather than skip them, and drop the thin drill block instead of appending to it.
        prepareDegraded: { type: "object" },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "english", "category", "target", "pronunciation"],
        properties: {
          id: { type: "string" },
          english: { type: "string" },
          category: { type: "string" },
          // Back-of-card context (see corpus schema). Renamed from `cardNote`. `reviewNote` is
          // internal-only (review gates), never in the deck/viewer.
          note: { type: ["string", "null"] },
          cardNote: { type: ["string", "null"] },
          reviewNote: { type: ["string", "null"] },
          target: { type: "string" },
          pronunciation: { type: "string" },
          // Optional phonetic spelling in the target language's own native script
          // (e.g. hiragana for Japanese) that the audio stage speaks INSTEAD of
          // `target` when present — see generateAudio. `target` is what the card
          // face shows (e.g. kanji 二十一); `reading` is only what TTS pronounces
          // (にじゅういち), sidestepping ambiguous readings of logographic scripts.
          reading: { type: "string" },
          // FRONT-of-card cue (disambiguator) shown small under the prompt on both templates. Repurposed
          // from the old rarely-used back-note fallback; the migration moves any legacy value into `note`.
          hint: { type: ["string", "null"] },
          image: { type: "string" },
          // The clip the deck embeds. Always DERIVED from the three takes below by `deriveCardAudio`
          // (manual cut > automatic trim > original), never set independently — the deck build, the
          // .apkg rebuild and AnkiConnect delivery read only this field and know nothing of the rest.
          audio: { type: "string" },
          // The raw, untouched take exactly as it arrived from the TTS voice or a Replace upload.
          // Never modified, and the source every trim re-cuts from — which is what lets a hand cut
          // reach audio the automatic trim removed. Absent on clips generated before originals were
          // kept; those cards get an original again the next time they're regenerated or replaced.
          audioOriginal: { type: "string" },
          // The automatic trailing-silence trim of `audioOriginal` (src/audio/trimSilence.js). The
          // default take: what ships unless a reviewer applies a manual cut. Equal to `audioOriginal`
          // when the trim changed nothing.
          audioAuto: { type: "string" },
          // A reviewer's hand-cut range, applied in the dashboard's trim editor. Present only once
          // applied; removing it falls back to `audioAuto`, so "revert to automatic" is a delete.
          audioManual: { type: "string" },
          // The `{ start, end }` seconds behind `audioManual`, kept so reopening the editor restores
          // the previous selection instead of making the reviewer re-find it by ear.
          audioTrim: { type: "object" },
          // Which background-noise cleanup chain produced this card's takes (see
          // src/audio/cleanupFilter.js): normally the default, or whichever one a reviewer picked in
          // the dashboard when the default misbehaved on that particular clip. Stored so a later
          // re-trim re-applies the SAME cleanup rather than silently reverting the card to the
          // default, and so the review can show which one is in force.
          audioFilter: { type: "string" },
          // True when this card's `audioOriginal` was generated with the throwaway Japanese end marker
          // (src/audio/ttsMarker.js) still on it. Anything re-deriving takes from that original has to
          // strip the marker again, so it needs to know the marker is there.
          audioMarked: { type: "boolean" },
          // Legacy optional second recording, from when Japanese cards were generated as a with-。 /
          // no-。 pair. That machinery is gone — the end marker (src/audio/ttsMarker.js) replaced what
          // the dot was working around — and nothing writes this any more. The field stays only so
          // cards.json from older runs still validates; 40 files on disk still carry it. Never
          // embedded by the deck build — only `audio` is.
          altAudio: { type: "string" },
          uncertain: { type: "boolean" },
          // Provenance flag carried forward from the corpus (the extractor/author added this item as a
          // critical-gap suggestion rather than it being in the source). Persisted through translate so
          // it survives into cards.json and every review; never auto-cleared.
          aiSuggested: { type: "boolean" },
          // Marks an AI-generated fill-in-the-blank practice card (a sentence built by resolving a
          // drill blank with lesson vocabulary), so reviews can delineate them and the semantic
          // de-dup pass can target them. Behaves like any other card in the deck.
          fillInBlank: { type: "boolean" },
          // Set by the dashboard translate review to drop a card from the built deck (reversible
          // flag, not a delete). The deck build skips excluded cards.
          excluded: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

// Supports a single type string ("string") or a list of allowed types
// (["string", "null"]) for nullable fields — "null" matches only literal null,
// since typeof null === "object" would otherwise be a silent landmine.
function matchesType(value, type) {
  if (Array.isArray(type)) {
    return type.some((t) => matchesType(value, t));
  }
  if (type === "null") {
    return value === null;
  }
  return typeof value === type;
}

function typeLabel(type) {
  return Array.isArray(type) ? type.join(" or ") : type;
}

function validateAgainstSchema(obj, schema) {
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Input must be a non-null object");
  }

  // Check required properties
  if (schema.required) {
    for (const prop of schema.required) {
      if (!(prop in obj)) {
        throw new Error(`Missing required property: ${prop}`);
      }
    }
  }

  // Validate each property
  for (const [key, value] of Object.entries(obj)) {
    const propSchema = schema.properties?.[key];

    // Disallow additional properties if not specified
    if (!propSchema && schema.additionalProperties === false) {
      throw new Error(`Unexpected property: ${key}`);
    }

    if (propSchema) {
      validateValue(key, value, propSchema);
    }
  }
}

function validateValue(key, value, propSchema) {
  if (propSchema.type === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`Property ${key} must be an array`);
    }
    if (propSchema.items) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (propSchema.items.type === "object") {
          validateItemObject(key, i, item, propSchema.items);
        } else if (propSchema.items.type && !matchesType(item, propSchema.items.type)) {
          throw new Error(
            `Item ${i} in ${key} must be of type ${typeLabel(propSchema.items.type)}`,
          );
        }
      }
    }
  } else if (propSchema.type === "object") {
    if (typeof value !== "object" || value === null) {
      throw new Error(`Property ${key} must be an object`);
    }
    // Check required properties of nested object
    if (propSchema.required) {
      for (const req of propSchema.required) {
        if (!(req in value)) {
          throw new Error(`Missing required property in ${key}: ${req}`);
        }
      }
    }
    // Validate nested properties
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const nestedPropSchema = propSchema.properties?.[nestedKey];
      if (!nestedPropSchema && propSchema.additionalProperties === false) {
        throw new Error(`Unexpected property in ${key}: ${nestedKey}`);
      }
      if (nestedPropSchema) {
        validateNestedValue(nestedKey, nestedValue, nestedPropSchema);
      }
    }
  } else if (propSchema.type && !matchesType(value, propSchema.type)) {
    throw new Error(`Property ${key} must be of type ${typeLabel(propSchema.type)}`);
  }

  if (propSchema.enum && !propSchema.enum.includes(value)) {
    throw new Error(`Property ${key} must be one of: ${propSchema.enum.join(", ")}`);
  }
}

function validateNestedValue(key, value, propSchema) {
  if (propSchema.type && !matchesType(value, propSchema.type)) {
    throw new Error(`Property ${key} must be of type ${typeLabel(propSchema.type)}`);
  }
  if (propSchema.enum && !propSchema.enum.includes(value)) {
    throw new Error(`Property ${key} must be one of: ${propSchema.enum.join(", ")}`);
  }
}

function validateItemObject(arrayKey, index, item, itemSchema) {
  if (typeof item !== "object" || item === null) {
    throw new Error(`Item ${index} in ${arrayKey} must be an object`);
  }

  // Check required properties
  if (itemSchema.required) {
    for (const prop of itemSchema.required) {
      if (!(prop in item)) {
        throw new Error(`Missing required property in ${arrayKey}[${index}]: ${prop}`);
      }
    }
  }

  // Validate each property
  for (const [key, value] of Object.entries(item)) {
    const propSchema = itemSchema.properties?.[key];

    if (!propSchema && itemSchema.additionalProperties === false) {
      throw new Error(`Unexpected property in ${arrayKey}[${index}]: ${key}`);
    }

    if (propSchema) {
      if (propSchema.type && !matchesType(value, propSchema.type)) {
        throw new Error(
          `Property ${key} in ${arrayKey}[${index}] must be of type ${typeLabel(propSchema.type)}`,
        );
      }
      if (propSchema.enum && !propSchema.enum.includes(value)) {
        throw new Error(
          `Property ${key} in ${arrayKey}[${index}] must be one of: ${propSchema.enum.join(", ")}`,
        );
      }
    }
  }
}

export function validateCorpus(obj) {
  validateAgainstSchema(obj, CORPUS_SCHEMA);
  return true;
}

export function validateCards(obj) {
  validateAgainstSchema(obj, CARDS_SCHEMA);
  return true;
}

// All durable cross-run state (audio cache, EPUB registry) lives inside this
// checkout, gitignored — never in $HOME, never committed. See .gitignore.
export function libraryHome() {
  return resolve(join(REPO_ROOT, ".anki-builder"));
}

export function runPaths(runDir) {
  const resolvedRunDir = resolve(runDir);
  return {
    corpus: resolve(join(resolvedRunDir, "corpus.json")),
    cards: resolve(join(resolvedRunDir, "cards.json")),
    audio: resolve(join(resolvedRunDir, "audio")),
    deck: resolve(deckPathForDir(resolvedRunDir)),
  };
}

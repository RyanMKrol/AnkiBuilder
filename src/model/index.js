import { fileURLToPath } from "url";
import { rmSync, rmdirSync } from "fs";
import { tmpdir } from "os";
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
        // See src/cards/passLedger.js. Recorded during assemble; translate copies meta verbatim,
        // so an entry written here travels with the unit into cards.json.
        passes: { type: "object" },
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
          // English-side disambiguator (e.g. "the object you read" for a card whose English prompt
          // collides with another's). Shown on the Production (English→Target) front only — on the
          // Recognition front it would give the answer away, so there it shows on the back.
          hint: { type: ["string", "null"] },
          // Situation cue (e.g. "answering whose bag this is", "the wine is already under
          // discussion") — the context without which the sentence is ambiguous. Shown on the FRONT
          // of BOTH directions; must never contain or paraphrase the answer. Distinct from `hint`.
          scene: { type: ["string", "null"] },
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
          // THE CONTRACT, stated the same way in every prompt and every doc: `ttsText` is the text
          // TTS speaks instead of the target whenever the written target would be misread (numerals
          // AND kanji-bearing targets); it is never rendered on any card face.
          //
          // In practice that means the target rewritten in the language's own phonetic script: kana
          // にせんえん for a "2,000えん" target, because the romanizer and the voice both mishandle a
          // bare numeral (kuroshiro leaves "2,000えん" as "2 , 000 en"; ElevenLabs may read it as an
          // English number) and both guess at kanji. When set it drives BOTH the romaji
          // `pronunciation` and the `audio`; `target` stays the natural display form. Carried through
          // translate onto the card's `ttsText` field.
          //
          // Named `ttsText` and not `reading` on purpose: `reading` read like a display field, and a
          // field nothing renders is exactly the kind of thing a later change quietly starts
          // rendering. The Anki note type still has a field literally named "Reading" (inert, no
          // template references it); the deliverer maps `ttsText` onto it (src/deck/collection.js).
          ttsText: { type: "string" },
          uncertain: { type: "boolean" },
          aiSuggested: { type: "boolean" },
          // Set by the dashboard corpus review to mark an item for exclusion. Reversible in the live
          // UI (a toggle, not a delete); `translate` drops excluded items when it builds cards.json,
          // and the dedup-library copy saved at review time omits them too.
          excluded: { type: "boolean" },
          // Who excluded it, and why. A script's `--apply` exclusion used to be byte-identical to a
          // human's reviewed decision, which made 95 excluded cards unauditable: nobody could tell a
          // judgement call from a sweep, and the extras duplicate check alone false-positives on
          // roughly a third of the groups it reports. BOTH FIELDS ARE OPTIONAL, and absent means
          // human-or-legacy — every file written before this existed stays valid, and a human
          // exclusion made in the dashboard is still allowed to say nothing.
          //
          // `excludedBy` is "human" or the script's name (e.g. "extras-duplicate-check").
          // `excludedReason` is one short line: what the tool concluded, in its own words.
          excludedBy: { type: "string" },
          excludedReason: { type: ["string", "null"] },
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
        // How each model pass turned out — see src/cards/passLedger.js. Free-form by design: a
        // pass records its own name, so adding one must not require a schema change.
        passes: { type: "object" },
        // Opt-in: this unit's TTS input is each card's kanji orthography (`ttsKanji`) rather than
        // its kana. Set at unit creation (`translate --kanji-tts`) and per unit, never globally —
        // the value feeds the ElevenLabs cache key, so flipping it for Japanese wholesale would
        // invalidate ~1,700 paid clips while hand-touched cards stayed exempt from regeneration,
        // leaving a silently mixed-orthography deck. See src/audio/index.js `clipSourceText`.
        kanjiTts: { type: "boolean" },
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
          // Same closed vocabulary as the corpus schema. It was a bare string here, so a category the
          // corpus schema would have rejected could still reach a card, the deck, and the Recognition
          // front's category chip — the one place a wrong category is visible to the learner. Every
          // category on disk today is already in the list; this makes that a rule rather than a
          // coincidence.
          category: { type: "string", enum: CATEGORIES },
          // Back-of-card context (see corpus schema). Renamed from `cardNote`. `reviewNote` is
          // internal-only (review gates), never in the deck/viewer.
          note: { type: ["string", "null"] },
          cardNote: { type: ["string", "null"] },
          reviewNote: { type: ["string", "null"] },
          target: { type: "string" },
          pronunciation: { type: "string" },
          // Same contract as the corpus schema's `ttsText`: the text TTS speaks instead of the target
          // whenever the written target would be misread (numerals AND kanji-bearing targets); never
          // rendered on any card face. `target` is what the learner sees (e.g. kanji 二十一);
          // `ttsText` is only what TTS pronounces (にじゅういち). See generateAudio / speechText.
          ttsText: { type: "string" },
          // The card's kana text rewritten in natural kanji+kana orthography, PURELY as alternate TTS
          // input (src/audio/kanjiOrthography.js). ElevenLabs mis-parses all-kana Japanese — it is out
          // of distribution against how the language is actually written — so a kanji form often
          // voices more naturally. Never rendered: the learner sees `target`, exactly as with
          // `ttsText`. It is only SPOKEN when the unit has opted in via `meta.kanjiTts`; stored
          // otherwise so the review can show it and a human can veto it before anything is generated.
          ttsKanji: { type: "string" },
          // English-side disambiguator, shown on the Production front and the Recognition BACK only
          // (on a Target→English front it is a piece of the answer). Repurposed from the old
          // rarely-used back-note fallback; the migration moves any legacy value into `note`.
          hint: { type: ["string", "null"] },
          // Situation cue shown small on the FRONT of BOTH templates ("answering whose bag this
          // is"). Sets the scene without revealing the answer; see the corpus schema.
          scene: { type: ["string", "null"] },
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
          // True when the automatic trim could NOT find and cut the end marker off this card's
          // shipping clip — the marker survives, audibly, and only ears would otherwise catch it.
          // Badged in the audio review; cleared when the reviewer installs different audio.
          audioMarkerStuck: { type: "boolean" },
          // The 16-hex hash of the TEXT this card's clip was generated from (src/audio/textHash.js).
          // Read off the take's content-addressed filename, never stamped in bulk from the card's
          // current text — that would certify the very drift it exists to detect. Absent means
          // "unverifiable", which is what the 30 hand-named and uploaded takes on disk are.
          audioTextHash: { type: "string" },
          // A human's "keep this clip for the current text" decision, made per card in the audio
          // review. It re-stamps `audioTextHash` from CURRENT text, so recording who and when is the
          // only thing that keeps that from being an untraceable one-click certification of drift.
          audioTextHashAcceptedBy: { type: "string" },
          audioTextHashAcceptedAt: { type: "string" },
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
          // The retrofit batch that added this card to a unit that was already finished, and the
          // sign-off that lets it ship. A card is a PENDING addition while `addition` is set and
          // `additionReviewed` is not true, and a pending card is filtered out by
          // `shippableCards()` so neither delivery path can see it. `addition` is never cleared:
          // it is the durable record of which batch a card arrived in.
          addition: { type: "string" },
          additionReviewed: { type: "boolean" },
          additionDone: { type: "boolean" },
          // Set when a retrofit brought this card's clip WITH it, rather than the audio stage
          // synthesizing a new one after the content gate. The audio review can then separate "a
          // clip I have already heard, in another deck" from "a clip nobody has heard yet", which
          // is the difference that decides how carefully it needs auditioning.
          additionAudioInherited: { type: "boolean" },
          // Which card DIRECTIONS this note should not be studied in, as template ordinals
          // (0 = Recognition, 1 = Production — see src/deck/cardTemplates.js, where the order is a
          // contract). `[1]` on a three-clause self-introduction means "study it Recognition-only".
          //
          // This is the AUTHORING surface, and suspension is the mechanism. Two alternatives were
          // ruled out as actively harmful: gating a template's qfmt on a field produces an EMPTY
          // card, which Anki's Tools → Empty Cards deletes along with its interval and its review
          // log; and omitting the card row at BUILD time is inert on the AnkiConnect path (Anki
          // generates one card per template on `addNote`) and self-reversing on the .apkg path (Check
          // Database and any template update regenerate it).
          //
          // So the .apkg builder deliberately still emits BOTH card rows and the DELIVERER suspends
          // the unwanted ordinal — which means the .apkg no longer reproduces the delivered deck
          // card-for-card. That is stated in docs/PIPELINE.md and in LIMITATIONS.
          dirSuspended: { type: "array", items: { type: "integer", minimum: 0 } },
          // Set by the dashboard translate review to drop a card from the built deck (reversible
          // flag, not a delete). The deck build skips excluded cards.
          excluded: { type: "boolean" },
          // Who excluded it, and why. A script's `--apply` exclusion used to be byte-identical to a
          // human's reviewed decision, which made 95 excluded cards unauditable: nobody could tell a
          // judgement call from a sweep, and the extras duplicate check alone false-positives on
          // roughly a third of the groups it reports. BOTH FIELDS ARE OPTIONAL, and absent means
          // human-or-legacy — every file written before this existed stays valid, and a human
          // exclusion made in the dashboard is still allowed to say nothing.
          //
          // `excludedBy` is "human" or the script's name (e.g. "extras-duplicate-check").
          // `excludedReason` is one short line: what the tool concluded, in its own words.
          excludedBy: { type: "string" },
          excludedReason: { type: ["string", "null"] },
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

// Memoized so every call in one test process gets the same scratch dir, and so the exit handler
// that cleans it up is registered exactly once.
let scratchLibraryHome = null;

/**
 * A throwaway library for this test process, under one parent shared by the whole suite run.
 *
 * `node --test` runs each test file in its own child, so a naive per-process tmpdir scatters ~75
 * directories across /tmp per `npm test`. `process.ppid` is the runner that spawned them all, which
 * gives every child the same parent directory to sit under. Each process still gets its own subdir:
 * they run concurrently, and a shared library would let one test file's dedup registry leak into
 * another's. The exit handler removes this process's own dir and then tries to remove the parent,
 * which succeeds for whichever process happens to exit last.
 */
function scratchLibraryHomeDir() {
  if (scratchLibraryHome) return scratchLibraryHome;
  const parent = resolve(join(tmpdir(), `anki-builder-test-${process.ppid}`));
  scratchLibraryHome = join(parent, String(process.pid));
  process.on("exit", () => {
    try {
      rmSync(scratchLibraryHome, { recursive: true, force: true });
      rmdirSync(parent); // throws while other processes still have dirs here; that is fine.
    } catch {
      // Best effort. A leftover tmpdir is noise, never a correctness problem.
    }
  });
  return scratchLibraryHome;
}

// All durable cross-run state (audio cache, EPUB registry) lives inside this
// checkout — never in $HOME. Most of it is gitignored; see .gitignore for the
// hand-reviewed parts that are not.
//
// Under the test runner this resolves to a throwaway tmpdir instead. `npm test` used to write
// straight into the real library: a fake EPUB registry under `epubs/h1/` and four 4-byte stub clips
// in the audio cache, sitting beside three real voice caches holding 3,610 paid clips. Every writer
// (saveChapterCorpus, removeChapterCorpus, registerEpub, the audio cache) resolves through this one
// function, so the redirect belongs here rather than in each of them — otherwise safety depends on
// every future test author remembering to inject a stub, which is exactly the assumption
// assertExternalCallAllowed already exists to reject.
//
// The trigger is NODE_TEST_CONTEXT and ONLY that. isTestEnv() also returns true for
// NODE_ENV === "test", and a real deck build run from a shell that exports NODE_ENV=test would
// silently write its library into /tmp and look like it had lost the dedup registry — a worse and
// far more confusing failure than the one being fixed here.
export function libraryHome() {
  if (process.env.NODE_TEST_CONTEXT && !process.env.ANKI_BUILDER_ALLOW_REAL_LIBRARY_IN_TESTS) {
    return scratchLibraryHomeDir();
  }
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

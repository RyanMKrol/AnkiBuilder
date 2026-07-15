import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { CATEGORIES } from "./categories.js";

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
        required: ["id", "english", "category", "notes", "target"],
        properties: {
          id: { type: "string" },
          english: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          notes: { type: ["string", "null"] },
          target: { type: ["string", "null"] },
          uncertain: { type: "boolean" },
          aiSuggested: { type: "boolean" },
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
          notes: { type: "string" },
          target: { type: "string" },
          pronunciation: { type: "string" },
          hint: { type: "string" },
          image: { type: "string" },
          audio: { type: "string" },
          uncertain: { type: "boolean" },
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
    deck: resolve(join(resolvedRunDir, "deck.apkg")),
  };
}

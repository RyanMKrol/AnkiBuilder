import { existsSync, readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, join, resolve } from "path";
import { writeFileAtomic, backupFileOnce } from "../util/atomicWrite.js";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { runClaude as defaultRunClaude } from "../translate/runClaude.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULT_TEMPLATE_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "cross-lesson-note-prompt.md"),
);

const NO_EARLIER_LESSONS = "(nothing — this is the first lesson)";
const BACKUP_SUFFIX = ".pre-enhance.bak";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, obj) {
  writeFileAtomic(path, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Every unit under a book/course dir, ordered by `chapterNumber` (tie-break: folder name) — i.e. in
 * study order, which is the order the backward-only context depends on.
 *
 * Includes units that have only got as far as `corpus.json`, flagged `hasCards: false`. That is the
 * whole point of this function existing alongside `lessonUnits`: a half-built earlier lesson is
 * INVISIBLE to a scan that requires cards.json, so a pass reading only prepared siblings cannot tell
 * "this is the first lesson of the book" from "lesson 7 hasn't been prepared yet" — and would happily
 * build lesson 8 as though it had no predecessors.
 *
 * Each unit carries the lesson's OWN name from `chapterLabel`, NOT its position in this list. An
 * un-numbered unit (front matter, an intro section, a supplement) shifts the two out of step, so a
 * note citing a position sends the learner to the wrong lesson. Cards are tagged with this label, and
 * the prompt requires notes to cite lessons exactly as tagged. Trimmed at the first ":" so a long
 * title reduces to the citable name the learner sees.
 */
export function lessonSiblings(deckDir) {
  const units = [];
  for (const entry of readdirSync(deckDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(deckDir, entry.name, "cards.json");
    const corpusFile = join(deckDir, entry.name, "corpus.json");
    const hasCards = existsSync(file);
    if (!hasCards && !existsSync(corpusFile)) continue;

    // An unreadable json means "we can't place this unit", never a fatal error — it must not take
    // down a build of a different lesson.
    let data = null;
    let meta = {};
    try {
      if (hasCards) {
        data = readJson(file);
        meta = data.meta ?? {};
      } else {
        meta = readJson(corpusFile).meta ?? {};
      }
    } catch {
      continue;
    }

    units.push({
      file,
      name: entry.name,
      number: meta.chapterNumber ?? 0,
      label: (meta.chapterLabel ?? entry.name).split(":")[0].trim(),
      hasCards,
      reviewed: !!meta.reviewed,
      done: !!meta.done,
      data,
    });
  }
  units.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  return units;
}

/**
 * The subset of `lessonSiblings` that has been through `translate` — the lessons whose cards can
 * actually be fed to a pass as context. Every consumer that reads `unit.data` wants this one.
 */
export function lessonUnits(deckDir) {
  return lessonSiblings(deckDir).filter((unit) => unit.hasCards);
}

export function renderCrossLessonNotePrompt({
  cards,
  currentLabel,
  earlierLabels,
  targetLanguage,
  templatePath = DEFAULT_TEMPLATE_PATH,
} = {}) {
  return renderPromptTemplate(templatePath, {
    TARGET_LANGUAGE: targetLanguage,
    CURRENT_LESSON: currentLabel,
    EARLIER_LESSONS: earlierLabels.length ? earlierLabels.join(", ") : NO_EARLIER_LESSONS,
    CARDS_JSON: JSON.stringify(
      cards.map((card) => ({
        id: card.id,
        lesson: card.__lesson,
        english: card.english,
        target: card.target,
        romaji: card.pronunciation || card.reading || "",
        category: card.category,
        currentNote: card.note || card.cardNote || "",
      })),
      null,
      2,
    ),
  });
}

function parseNotes(raw, allowedIds) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  if (!parsed || !Array.isArray(parsed.notes)) {
    throw new Error('model response must be a JSON object with a "notes" array');
  }
  const notes = new Map();
  for (const note of parsed.notes) {
    if (
      note &&
      typeof note.id === "string" &&
      typeof note.note === "string" &&
      allowedIds.has(note.id)
    )
      notes.set(note.id, note.note.trim());
  }
  return notes;
}

/**
 * Writes back-of-card notes for ONE lesson, fed that lesson plus every EARLIER lesson of the same
 * book/course as context. Cross-references are therefore structurally BACKWARD-only: the model never
 * sees a later lesson, so it cannot reference material the learner hasn't met — that's a property of
 * what it's shown, not a rule it's asked to follow.
 *
 * Writes the current lesson only, leaving `hint`/`reviewNote` untouched, and keeps corpus.json in
 * lockstep with cards.json. Each file is backed up once to `<file>.pre-enhance.bak` before its first
 * rewrite.
 *
 * Returns `{ changed, skipped }` — `changed` is how many notes were written, `skipped` a reason
 * string when the pass didn't run at all (a lone lesson with no siblings, an unknown unit). Fails
 * open on a model/parse error: logs and returns `changed: 0`.
 */
export function enhanceLessonNotes({
  deckDir,
  unitName,
  targetLanguage,
  dry = false,
  log = () => {},
  runClaude = defaultRunClaude,
} = {}) {
  if (!existsSync(deckDir)) {
    return { changed: 0, skipped: `no deck directory at ${deckDir}` };
  }
  const units = lessonUnits(deckDir);
  const index = units.findIndex((unit) => unit.name === unitName);
  if (index === -1) {
    return { changed: 0, skipped: `no lesson "${unitName}" under ${deckDir}` };
  }

  const current = units[index];
  const language = targetLanguage || current.data.meta?.targetLanguage || "the target language";
  // Cards carry the lesson's own name, never its position — see lessonUnits().
  const contextCards = units
    .slice(0, index + 1)
    .flatMap((unit) => unit.data.items.map((item) => ({ ...item, __lesson: unit.label })));
  const earlierLabels = units.slice(0, index).map((unit) => unit.label);
  const currentIds = new Set(current.data.items.map((item) => item.id));

  let notes;
  try {
    notes = parseNotes(
      runClaude(
        renderCrossLessonNotePrompt({
          cards: contextCards,
          currentLabel: current.label,
          earlierLabels,
          targetLanguage: language,
        }),
      ),
      currentIds,
    );
  } catch (error) {
    log(`cross-lesson notes: failed (${error.message}) — leaving this lesson's notes as they are`);
    return { changed: 0 };
  }

  const pending = current.data.items.filter(
    (item) => notes.has(item.id) && notes.get(item.id) !== (item.note || ""),
  );
  if (dry) {
    for (const item of pending) {
      log(`  [${current.label}] ${item.english} / ${item.target}`);
      log(`     ${item.note ? "was: " + item.note : "(no note)"}`);
      log(`     now: ${notes.get(item.id)}`);
    }
    return { changed: pending.length };
  }
  if (pending.length === 0) {
    return { changed: 0 };
  }

  for (const item of pending) {
    // An empty returned note means "delete this restatement" → store null, not "".
    item.note = notes.get(item.id) || null;
  }
  backupFileOnce(current.file, BACKUP_SUFFIX);
  writeJson(current.file, current.data);

  // corpus.json carries the same notes; keep the two in lockstep so a later re-translate or a
  // corpus-derived save doesn't resurrect the pre-enhancement text.
  const corpusPath = join(deckDir, current.name, "corpus.json");
  if (existsSync(corpusPath)) {
    const corpus = readJson(corpusPath);
    let corpusChanged = 0;
    for (const item of corpus.items || []) {
      if (notes.has(item.id) && notes.get(item.id) !== (item.note ?? "")) {
        item.note = notes.get(item.id) || null;
        corpusChanged++;
      }
    }
    if (corpusChanged) {
      backupFileOnce(corpusPath, BACKUP_SUFFIX);
      writeJson(corpusPath, corpus);
    }
  }

  return { changed: pending.length };
}

/** `enhanceLessonNotes` addressed by run directory: the unit is the folder, the deck its parent. */
export function enhanceRunDirNotes({ runDir, ...rest } = {}) {
  const absolute = resolve(runDir);
  return enhanceLessonNotes({
    deckDir: dirname(absolute),
    unitName: basename(absolute),
    ...rest,
  });
}

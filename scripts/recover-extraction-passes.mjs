// Re-run the EXTRACTION-BRANCH passes against a unit that already has a corpus.
//
//   node --env-file=.env scripts/recover-extraction-passes.mjs <runDir> [--flags] [--sort] [--romaji]
//
// WHY THIS EXISTS. `assemble` runs the taught index, the forward-flag pass and the pedagogical sort
// inside its extraction branch, and that whole branch is skipped once corpus.json exists. So a pass
// that fails there — a quota window, a timeout — cannot be recovered by re-running anything: the
// only route was deleting corpus.json and paying for a fresh extraction, which also discards every
// hand-authored card and leaks a new run directory (see SKILL.md's troubleshooting note). This
// drives the same modules directly against the corpus already on disk.
//
// Both passes are safe by construction. The flag pass only ANNOTATES (`uncertain` + `reviewNote`)
// and never adds or removes an item; `reorderByIds` cannot add, drop or duplicate one, so the worst
// case is the order the unit already has. Neither rewrites a card's content.
//
// --romaji is the same problem one stage later. The romanization-correction pass runs inside
// `translate`, and re-running `translate` is not a fix: it rebuilds cards.json from corpus.json,
// which discards the drill block, every audio reference and the cross-lesson notes. So it too can
// only be recovered by driving the module directly. It rewrites `pronunciation` and nothing else.
//
// --flags and --sort are EPUB-only: both need the book. --romaji works on any unit.
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { flagForwardConcerns } from "../src/corpus/epubForwardFlags.js";
import { romanizeAndEvaluate } from "../src/translate/romanizationEval.js";
import { ROMANIZATION_LIBRARIES } from "../src/translate/romanizationLibraries.js";
import { resolveIso639Code } from "../src/model/iso639.js";
import { sortItemsPedagogically } from "../src/corpus/pedagogicalSort.js";
import { writeUnitJson } from "../src/util/unitWrite.js";
import { libraryHome } from "../src/model/index.js";

const args = process.argv.slice(2);
const runDir = args.find((a) => !a.startsWith("--"));
const wantFlags = args.includes("--flags");
const wantSort = args.includes("--sort");
const wantRomaji = args.includes("--romaji");

if (!runDir || (!wantFlags && !wantSort && !wantRomaji)) {
  console.error(
    "usage: node --env-file=.env scripts/recover-extraction-passes.mjs <runDir> [--flags] [--sort]\n" +
      "  --flags  re-run the forward-flag pass (builds the book's taught index if absent)\n" +
      "  --sort   re-run the pedagogical sort\n" +
      "  --romaji re-run the romanization correction over cards.json (pronunciation only)\n" +
      "Pick at least one; each is a paid model pass.",
  );
  process.exit(2);
}

const corpusPath = join(runDir, "corpus.json");
const cardsPath = join(runDir, "cards.json");
if (!existsSync(corpusPath)) {
  console.error(`no corpus.json in ${runDir} — nothing to recover against`);
  process.exit(2);
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));
const { epubHash, targetLanguage } = corpus.meta;
if (!epubHash && (wantFlags || wantSort)) {
  console.error("this unit has no epubHash — --flags and --sort are EPUB-only");
  process.exit(2);
}
if (corpus.meta.reviewed) {
  console.error(
    "this unit is already REVIEWED. Both passes change what the reviewer signed off on, so clear the " +
      "review first (dashboard: Unreview) rather than editing underneath it.",
  );
  process.exit(2);
}

const bookDir = join(libraryHome(), "epubs", epubHash);
const conventionsPath = join(bookDir, "conventions.md");
const bookConventions = existsSync(conventionsPath) ? readFileSync(conventionsPath, "utf-8") : null;
const epubPath = join(bookDir, "book.epub");

/** Write `patch(items)` into BOTH files, matching by id and leaving every other field alone. */
function writeBoth(reason, patch) {
  for (const path of [corpusPath, cardsPath]) {
    if (!existsSync(path)) continue;
    const file = JSON.parse(readFileSync(path, "utf-8"));
    const before = file.items.length;
    patch(file);
    if (file.items.length !== before) {
      throw new Error(`${path}: item count changed (${before} -> ${file.items.length}), refusing`);
    }
    writeUnitJson(path, file, { reason });
    console.log(`  ${path.split("/").pop()}: ${file.items.length} items`);
  }
}

/** How this pass's own notes always open — see the idempotency note below. */
const FLAG_MARKER = /Possibly premature/;

if (wantFlags) {
  const chapterNumber = corpus.meta.lastChapterNumber ?? corpus.meta.chapterNumber;
  console.log(
    `forward flags: ${corpus.items.length} item(s) against chapters after ${chapterNumber}`,
  );
  const { items, flagged } = flagForwardConcerns({
    candidateItems: corpus.items,
    epubPath,
    chapterNumber,
    targetLanguage,
    bookConventions,
    log: (line) => console.log(`  ${line}`),
  });
  console.log(`forward flags: ${flagged.length} item(s) flagged`);
  if (flagged.length) {
    const byId = new Map(items.map((i) => [i.id, i]));
    writeBoth("recover-forward-flags", (file) => {
      for (const item of file.items) {
        const flaggedItem = byId.get(item.id);
        if (!flaggedItem?.uncertain) continue;
        // Idempotency has to key on the pass's MARKER, not on the note being byte-identical. The
        // wording comes from a model, so a second run rephrases it, an equality check misses, and the
        // card ends up carrying the same warning two or three times over. (It did: one card collected
        // three copies of its forward-flag note before this check was written.)
        if (FLAG_MARKER.test(item.reviewNote ?? "")) continue;
        item.uncertain = true;
        item.reviewNote = item.reviewNote
          ? `${item.reviewNote} ${flaggedItem.reviewNote}`
          : flaggedItem.reviewNote;
      }
    });
  }
}

if (wantSort) {
  const fresh = JSON.parse(readFileSync(corpusPath, "utf-8"));
  const { items, changed } = sortItemsPedagogically({
    items: fresh.items,
    targetLanguage,
    bookConventions,
    log: (line) => console.log(`  ${line}`),
  });
  console.log(`pedagogical sort: ${changed ? "reordered" : "no change"}`);
  if (changed) {
    const order = new Map(items.map((item, index) => [item.id, index]));
    // Anything the sort never saw (the drill block, cards hand-added at gate 1) keeps its relative
    // position at the end rather than being dropped.
    const rank = (item) => (order.has(item.id) ? order.get(item.id) : Number.MAX_SAFE_INTEGER);
    writeBoth("recover-pedagogical-sort", (file) => {
      file.items = [...file.items].sort((a, b) => rank(a) - rank(b));
    });
  }
}

if (wantRomaji) {
  // Reads and writes cards.json ONLY: corpus.json has no `pronunciation` field, by schema.
  const cards = JSON.parse(readFileSync(cardsPath, "utf-8"));
  const code = resolveIso639Code(targetLanguage);
  const libraryEntry = ROMANIZATION_LIBRARIES[code];
  if (!libraryEntry) {
    console.error(`no romanization library configured for ${targetLanguage} — nothing to correct`);
    process.exit(2);
  }
  const subjects = cards.items.filter((item) => !item.excluded && (item.ttsText || item.target));
  console.log(`romanization: correcting ${subjects.length} item(s)`);
  const { items } = await romanizeAndEvaluate(subjects, {
    targetLanguage,
    libraryEntry,
    log: (line) => console.log(`  ${line}`),
    // An item whose library adapter fails keeps whatever pronunciation it already has, rather than
    // being dropped from the file.
    fallback: (rest) => ({ items: rest, errors: [] }),
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  let changed = 0;
  for (const item of cards.items) {
    const fixed = byId.get(item.id);
    if (!fixed?.pronunciation || fixed.pronunciation === item.pronunciation) continue;
    console.log(`  ${item.target}\n      ${item.pronunciation}\n   -> ${fixed.pronunciation}`);
    item.pronunciation = fixed.pronunciation;
    changed++;
  }
  console.log(`romanization: ${changed} item(s) corrected`);
  if (changed) writeUnitJson(cardsPath, cards, { reason: "recover-romanization" });
}

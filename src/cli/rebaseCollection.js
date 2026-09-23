// Moves a collection onto a new edition of its own EPUB, keeping everything a person has done to it.
//
// A converted book is rebuilt whenever its chapter selection changes, and a rebuilt EPUB has a new
// content hash. The hash is how a collection and its units are found (`book.json`, `.epub-hash`,
// each unit's `meta.epubHash` + `meta.chapterNumber`, the dedup library under `<hash>/`), so without
// this a rebuilt book registers as a NEW collection with a `-2` slug, and a new slug is a new GUID
// namespace: every delivered note would be orphaned. First needed on 2026-09-24, when Genki's
// conversion had counted its writing-system introduction as Chapter 01 and every real chapter was
// one number too high.
//
// What changes: the collection's markers and book.epub, each unit's hash, spine number and label,
// and the reading dedup library entries (copied to the new hash). What does not: the slug, the
// guidNamespace, the card ids, the audio, the review and done flags, and the unit folders. So a
// delivered collection keeps its notes, and `deliver-to-anki --refile` moves them to the renamed
// chapter decks.
//
// Units are matched to the new book by the chapter's own name, the label with its "Chapter NN: "
// removed, which is the part a renumbering does not touch. Anything that does not match exactly one
// chapter of the new book stops the whole rebase before anything is written.

import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { writeFileAtomic, copyFileAtomic } from "../util/atomicWrite.js";

const UNIT_FILES = ["cards.json", "corpus.json", "as-generated.json"];

/** The chapter's own name: "Chapter 02: Greetings" and "Chapter 01: Greetings" are both "Greetings". */
export const chapterName = (label) =>
  String(label ?? "")
    .replace(/^Chapter\s+\d+\s*:\s*/i, "")
    .trim();

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));

/**
 * Works out the rebase without writing anything. `lessons` is the new book's
 * `listLessons()` output (`{ label, firstChapterNumber }`). Throws, naming every problem, when a
 * unit cannot be placed or a build is running.
 */
export function planRebase({ collectionDir, newHash, lessons }) {
  const marker = readJson(join(collectionDir, "book.json"));
  const oldHash = marker.epubHash;
  const problems = [];
  const units = [];
  for (const name of readdirSync(collectionDir).sort()) {
    const dir = join(collectionDir, name);
    if (!/^chapter-\d+(-extras)?$/.test(name) || !existsSync(join(dir, "cards.json"))) continue;
    if (existsSync(join(dir, "claim.json"))) {
      problems.push(`${name} has a claim.json: a build may be running on it`);
      continue;
    }
    const meta = readJson(join(dir, "cards.json")).meta ?? {};
    const matches = lessons.filter((l) => chapterName(l.label) === chapterName(meta.chapterLabel));
    if (matches.length !== 1) {
      problems.push(
        `${name} ("${meta.chapterLabel}") matches ${matches.length} chapter(s) of the new book, not one`,
      );
      continue;
    }
    units.push({
      name,
      from: { label: meta.chapterLabel, chapterNumber: meta.chapterNumber },
      to: { label: matches[0].label, chapterNumber: matches[0].firstChapterNumber },
      reviewed: meta.reviewed === true,
    });
  }
  if (problems.length) {
    throw new Error(`cannot rebase ${collectionDir}:\n  - ${problems.join("\n  - ")}`);
  }
  return { oldHash, newHash, deckKind: marker.deckKind ?? null, units };
}

/**
 * Applies a plan. `libraryCorpus(hash, chapterNumber)` is the dedup library path for this
 * collection's kind; `registerSlug(newHash)` records the slug under the new hash; `epubPath` is the
 * new book, copied in as book.epub. The old library entries are left where they are, as a record.
 */
export function applyRebase(plan, { collectionDir, epubPath, libraryCorpus, registerSlug }) {
  const retag = (meta, unit) => ({
    ...meta,
    epubHash: plan.newHash,
    chapterNumber: unit.to.chapterNumber,
    chapterLabel: unit.to.label,
  });
  for (const unit of plan.units) {
    for (const file of UNIT_FILES) {
      const path = join(collectionDir, unit.name, file);
      if (!existsSync(path)) continue;
      const data = readJson(path);
      if (!data?.meta) continue;
      writeFileAtomic(
        path,
        `${JSON.stringify({ ...data, meta: retag(data.meta, unit) }, null, 2)}\n`,
      );
    }
    const oldEntry = libraryCorpus(plan.oldHash, unit.from.chapterNumber);
    if (unit.reviewed && existsSync(oldEntry)) {
      const corpus = readJson(oldEntry);
      const newEntry = libraryCorpus(plan.newHash, unit.to.chapterNumber);
      mkdirSync(dirname(newEntry), { recursive: true });
      writeFileAtomic(
        newEntry,
        JSON.stringify({ ...corpus, meta: retag(corpus.meta, unit) }, null, 2),
      );
    }
  }
  copyFileAtomic(epubPath, join(collectionDir, "book.epub"));
  writeFileAtomic(join(collectionDir, ".epub-hash"), plan.newHash);
  const marker = readJson(join(collectionDir, "book.json"));
  writeFileAtomic(
    join(collectionDir, "book.json"),
    `${JSON.stringify({ ...marker, epubHash: plan.newHash }, null, 2)}\n`,
  );
  registerSlug(plan.newHash);
}

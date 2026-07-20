import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { validateCorpus as defaultValidateCorpus } from "../../model/index.js";
import { saveChapterCorpus as defaultSaveChapterCorpus } from "../../corpus/epubLibrary.js";
import { httpError } from "../../util/httpError.js";

// Write-back for the dashboard corpus review — the live equivalent of the old `review` CLI. Each
// action is a read-modify-write of corpus.json, targeting items by their `id`. Marking a corpus
// reviewed also preserves the CLI's load-bearing side effect: for an EPUB source it saves the
// reviewed (excluded-filtered) corpus into the local library, which is the backward-dedup input for
// later chapters of the same book.

function loadCorpus(runDir) {
  const corpusPath = join(runDir, "corpus.json");
  if (!existsSync(corpusPath)) throw httpError(404, "corpus.json not found for this deck unit");
  return { corpusPath, data: JSON.parse(readFileSync(corpusPath, "utf-8")) };
}

// Toggle a corpus item's exclusion flag (reversible — a flag, not a delete). translate drops
// excluded items when it builds cards.json.
export function setCorpusItemExcluded(
  runDir,
  cardId,
  excluded,
  { validateCorpus = defaultValidateCorpus } = {},
) {
  const { corpusPath, data } = loadCorpus(runDir);
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `item ${JSON.stringify(cardId)} not found`);
  if (excluded) item.excluded = true;
  else delete item.excluded;
  try {
    validateCorpus(data);
  } catch (e) {
    throw httpError(400, `invalid corpus data after edit: ${e.message}`);
  }
  writeFileSync(corpusPath, JSON.stringify(data, null, 2));
  return { excluded: !!excluded };
}

// Mark a run's corpus reviewed (meta.reviewed = true) — the gate `translate` checks — and, for an
// EPUB source, save the reviewed corpus (excluded items filtered out) into the dedup library.
export function markCorpusReviewed(
  runDir,
  { validateCorpus = defaultValidateCorpus, saveChapterCorpus = defaultSaveChapterCorpus } = {},
) {
  const { corpusPath, data } = loadCorpus(runDir);
  data.meta = { ...(data.meta || {}), reviewed: true };
  try {
    validateCorpus(data);
  } catch (e) {
    throw httpError(400, `invalid corpus data after edit: ${e.message}`);
  }
  writeFileSync(corpusPath, JSON.stringify(data, null, 2));

  const { epubHash, chapterNumber } = data.meta;
  if (epubHash && chapterNumber != null) {
    const filtered = { ...data, items: data.items.filter((i) => !i.excluded) };
    saveChapterCorpus(epubHash, chapterNumber, filtered);
  }
  return { reviewed: true };
}

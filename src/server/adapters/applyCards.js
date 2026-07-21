import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import { saveChapterCorpus as defaultSaveChapterCorpus } from "../../corpus/epubLibrary.js";
import { httpError } from "../../util/httpError.js";

// Write-back for the dashboard Corpus review — non-audio edits to cards.json (exclude a card, fix its
// target/pronunciation/reading, or mark the lesson reviewed). Each is a read-modify-write targeting the
// item by `id`. (Audio edits live in applyCardAudio.js.)

const EDITABLE_FIELDS = ["target", "pronunciation", "reading"];

function loadCards(runDir) {
  const cardsPath = join(runDir, "cards.json");
  if (!existsSync(cardsPath)) throw httpError(404, "cards.json not found for this deck unit");
  return { cardsPath, data: JSON.parse(readFileSync(cardsPath, "utf-8")) };
}

function findItem(data, cardId) {
  const item = (data.items || []).find((i) => i.id === cardId);
  if (!item) throw httpError(404, `card ${JSON.stringify(cardId)} not found`);
  return item;
}

function persist(cardsPath, data, validateCards) {
  try {
    validateCards(data);
  } catch (e) {
    throw httpError(400, `invalid card data after edit: ${e.message}`);
  }
  writeFileSync(cardsPath, JSON.stringify(data, null, 2));
}

// Toggle a card's exclusion flag (reversible — a flag, not a delete). The deck build drops excluded
// cards.
export function setCardExcluded(
  runDir,
  cardId,
  excluded,
  { validateCards = defaultValidateCards } = {},
) {
  const { cardsPath, data } = loadCards(runDir);
  const item = findItem(data, cardId);
  if (excluded) item.excluded = true;
  else delete item.excluded;
  persist(cardsPath, data, validateCards);
  return { excluded: !!excluded };
}

// Set/clear the lesson's final "done" sign-off (cards.meta.done) — the audio-review "Mark done" /
// "Reopen". Only `done` lessons are merged into the book/course deck. Deleting the key on reopen keeps
// cards.json clean (undefined = not done).
export function setLessonDone(runDir, done, { validateCards = defaultValidateCards } = {}) {
  const { cardsPath, data } = loadCards(runDir);
  data.meta = data.meta || {};
  if (done) data.meta.done = true;
  else delete data.meta.done;
  persist(cardsPath, data, validateCards);
  return { done: !!done };
}

// Mark a lesson's Corpus review signed off (cards.meta.reviewed = true) — the gate `audio` checks —
// and, for an EPUB source, save the reviewed (excluded-filtered) corpus into the dedup library as the
// backward-dedup input for later chapters. The corpus is derived from the cards (English is unchanged
// by translation), so this preserves the load-bearing side effect that used to fire at the old
// corpus-stage "Mark reviewed".
export function markCardsReviewed(
  runDir,
  { validateCards = defaultValidateCards, saveChapterCorpus = defaultSaveChapterCorpus } = {},
) {
  const { cardsPath, data } = loadCards(runDir);
  data.meta = { ...(data.meta || {}), reviewed: true };
  persist(cardsPath, data, validateCards);

  const { epubHash, chapterNumber } = data.meta;
  if (epubHash && chapterNumber != null) {
    const items = data.items
      .filter((i) => !i.excluded)
      .map((i) => ({
        id: i.id,
        english: i.english,
        category: i.category,
        notes: i.notes ?? null,
        target: i.target ?? null,
        reading: i.reading,
        ...(i.uncertain ? { uncertain: true } : {}),
        ...(i.aiSuggested ? { aiSuggested: true } : {}),
      }));
    saveChapterCorpus(epubHash, chapterNumber, { meta: data.meta, items });
  }
  return { reviewed: true };
}

// Edit a card's text fields. Only the whitelisted fields are ever written, and each is coerced to a
// string; anything else in the body is ignored.
export function editCard(runDir, cardId, fields, { validateCards = defaultValidateCards } = {}) {
  const { cardsPath, data } = loadCards(runDir);
  const item = findItem(data, cardId);
  const applied = {};
  for (const key of EDITABLE_FIELDS) {
    if (fields && Object.prototype.hasOwnProperty.call(fields, key)) {
      item[key] = String(fields[key]);
      applied[key] = item[key];
    }
  }
  persist(cardsPath, data, validateCards);
  return applied;
}

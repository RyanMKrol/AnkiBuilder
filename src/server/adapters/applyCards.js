import { readFileSync, existsSync } from "fs";
import { writeFileAtomic } from "../../util/atomicWrite.js";
import { basename, join } from "path";
import { validateCards as defaultValidateCards } from "../../model/index.js";
import {
  saveChapterCorpus as defaultSaveChapterCorpus,
  removeChapterCorpus as defaultRemoveChapterCorpus,
} from "../../corpus/epubLibrary.js";
import { lessonReadiness, describeReadiness } from "../../cards/readiness.js";
import { httpError } from "../../util/httpError.js";

// Write-back for the dashboard Corpus review — non-audio edits to cards.json (exclude a card, fix its
// target/pronunciation/ttsText, or mark the lesson reviewed). Each is a read-modify-write targeting the
// item by `id`. (Audio edits live in applyCardAudio.js.)

const EDITABLE_FIELDS = ["target", "pronunciation", "ttsText"];

/**
 * Is this run dir an `-extras` unit, and therefore banned from touching the dedup library?
 *
 * The library is keyed purely on `(epubHash, chapterNumber)`, and a unit shares its `chapterNumber`
 * with its own `-extras` sibling by design: chapter-13 and chapter-13-extras are both 33 today,
 * because the extras unit holds the drills for that same chapter. So an extras unit that carries an
 * `epubHash` owns no key of its own. Signing it off would write its drill cards OVER the base
 * chapter's dedup entry, and every later chapter of the book would then be deduped against the
 * drills instead of the lesson, silently. Withdrawing the sign-off is worse still: it would DELETE
 * the base chapter's entry outright.
 *
 * What has saved the live book so far is an accident of authoring, not a rule: no extras unit
 * happens to carry an `epubHash`, because assemble writes that field and an extras unit is
 * hand-authored. One copied `meta` block is all it would take. The refusal lives here, at the only
 * two callers that write to the library, and preflight's `extras-library-write` check asserts the
 * precondition never arises in the first place.
 */
function isExtrasRunDir(runDir) {
  return /-extras$/.test(basename(String(runDir).replace(/[/\\]+$/, "")));
}

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
  writeFileAtomic(cardsPath, JSON.stringify(data, null, 2));
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
  if (excluded) {
    item.excluded = true;
    // Provenance, so a reviewed decision is distinguishable from a script sweep. No reason: the
    // dashboard toggle carries none, and inventing one would be worse than saying nothing.
    item.excludedBy = "human";
    delete item.excludedReason;
  } else {
    delete item.excluded;
    delete item.excludedBy;
    delete item.excludedReason;
  }
  persist(cardsPath, data, validateCards);
  return { excluded: !!excluded };
}

// Set/clear the lesson's final "done" sign-off (cards.meta.done) — the audio-review "Mark done".
// Only `done` lessons are merged into the book/course deck. The clearing form has no UI (done
// lessons stay editable); it exists as the programmatic escape hatch, and deleting the key rather
// than writing `false` keeps cards.json clean (undefined = not done).
export function setLessonDone(runDir, done, { validateCards = defaultValidateCards } = {}) {
  const { cardsPath, data } = loadCards(runDir);
  data.meta = data.meta || {};

  // The second gate checks its precondition the same way the first does. `done` is what puts a lesson
  // into the merged .apkg and, from there, into the live Anki collection — so a lesson that never
  // passed the corpus review must not be able to reach it. The UI only offers "Mark done" at the audio
  // stage, but the endpoint is reachable without the UI (a stale tab, a stray request), and "the UI
  // doesn't offer it" is exactly the kind of guarantee that turned out not to be one.
  if (done && data.meta.reviewed !== true) {
    throw httpError(
      409,
      `this lesson has not passed the corpus review, so it cannot be marked done — ` +
        `marking it done would ship it into the deck. Review it first.`,
    );
  }

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

  // The gate checks the lesson's STATE, not how it got here. A cards.json alone used to be enough to
  // sign off — so a bare `translate`, a `prepare` that died after translate, or a lesson built before
  // a pass existed all presented as final card sets when they weren't. Refusing here is what makes
  // "the reviewer sees the finished lesson" true rather than merely intended.
  const readiness = lessonReadiness(data.meta || {}, data.items);
  if (!readiness.ready) {
    throw httpError(
      409,
      `this lesson is not ready to review — ${describeReadiness(readiness)}. ` +
        `Run "anki-builder prepare --run ${runDir}" to finish it.`,
    );
  }

  data.meta = { ...(data.meta || {}), reviewed: true };
  persist(cardsPath, data, validateCards);

  const { epubHash, chapterNumber } = data.meta;
  if (epubHash && chapterNumber != null && !isExtrasRunDir(runDir)) {
    const items = data.items
      .filter((i) => !i.excluded)
      .map((i) => ({
        id: i.id,
        english: i.english,
        category: i.category,
        reviewNote: i.reviewNote ?? null,
        target: i.target ?? null,
        ttsText: i.ttsText,
        ...(i.uncertain ? { uncertain: true } : {}),
        ...(i.aiSuggested ? { aiSuggested: true } : {}),
      }));
    saveChapterCorpus(epubHash, chapterNumber, { meta: data.meta, items });
  }
  return { reviewed: true };
}

// Withdraw a lesson's corpus sign-off — the reverse of markCardsReviewed, for the mis-click that
// used to require hand-editing JSON. Refuses while the lesson is `done`: done means "in the
// shipping deck", and un-reviewing underneath that would leave a lesson shipping without a valid
// review chain (clearing `done` itself is a hand edit). For an EPUB source the lesson's
// dedup-library entry is removed too, since the library holds only signed-off chapters. An extras
// unit is refused outright: it shares its base chapter's library key, so removing "its" entry would
// delete the base chapter's. See isExtrasRunDir.
export function unmarkCardsReviewed(
  runDir,
  { validateCards = defaultValidateCards, removeChapterCorpus = defaultRemoveChapterCorpus } = {},
) {
  const { cardsPath, data } = loadCards(runDir);
  data.meta = data.meta || {};

  if (data.meta.done === true) {
    throw httpError(
      409,
      "this lesson is marked done (it ships in the deck), so it can no longer be sent back to the corpus review.",
    );
  }

  delete data.meta.reviewed;
  persist(cardsPath, data, validateCards);

  const { epubHash, chapterNumber } = data.meta;
  if (epubHash && chapterNumber != null && !isExtrasRunDir(runDir)) {
    removeChapterCorpus(epubHash, chapterNumber);
  }
  return { reviewed: false };
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

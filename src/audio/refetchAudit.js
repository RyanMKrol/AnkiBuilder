// Would running the audio stage re-buy a clip that already exists?
//
// WHY THE CACHE HIT RATE IS THE WRONG QUESTION. The obvious check is whether every card's text
// still resolves to a file in `.anki-builder/audio`, and measured against the real deck that comes
// out at 76%. It is not a regression: the cache is documented as disposable, `rm -rf` on it is a
// sanctioned move whenever audio generation changes, and it has been dropped. The clips themselves
// live in each unit's `audio/` directory, which is 296 MB against the cache's 171 MB.
//
// THE REAL INVARIANT is that a card's SHIPPING clip is still the one its current text asks for. A
// default clip is named for the hash of the text it speaks, so if the derivation still produces that
// same hash the clip stands and nothing is fetched. If the derivation drifts, every card's name
// stops matching and the stage re-buys roughly 4,400 clips at once, silently, because a refetch
// looks exactly like a first fetch.
//
// A hand-curated take (a manual trim, an upload, a generated variant) keeps its own filename by
// design and is counted separately: it is not "matching" and it is emphatically not stale, and
// collapsing those two into one number is how this check would come to report a false alarm every
// run and then be ignored.

import { defaultClipText, hashTerm, isDefaultClipFilename } from "./index.js";

/**
 * Classifies every shipping card of one unit as `current`, `curated` or `refetch`.
 *
 * `refetch` is the number that must stay zero. Each entry names the clip it ships and the filename
 * its text now asks for, because "these disagree" is only actionable if you can see both.
 */
export function auditUnitRefetch({ items, meta }, languageCode) {
  const kanjiTts = meta?.kanjiTts === true;
  const result = { current: 0, curated: 0, refetch: [] };

  for (const item of items ?? []) {
    if (item.excluded || !item.audio) continue;
    const text = defaultClipText(item, languageCode, { kanjiTts });
    if (!text) continue;
    const expected = `${hashTerm(text)}.mp3`;
    if (item.audio === expected) {
      result.current++;
    } else if (!isDefaultClipFilename(item.audio)) {
      // A hand-curated take keeps its own name on purpose. Counting it as stale would make this
      // check cry wolf on 326 cards and be ignored within a week.
      result.curated++;
    } else {
      result.refetch.push({ id: item.id, ships: item.audio, wants: expected });
    }
  }
  return result;
}

/** The same audit across a chapter's units, summed. */
export function auditChapterRefetch(units, languageCode) {
  const total = { current: 0, curated: 0, refetch: [] };
  for (const unit of units) {
    const one = auditUnitRefetch(unit, languageCode);
    total.current += one.current;
    total.curated += one.curated;
    total.refetch.push(...one.refetch.map((r) => ({ ...r, unit: unit.name })));
  }
  return total;
}

/** One line a person can read, and the sentence that says what zero means. */
export function describeRefetchAudit(audit) {
  const clean = audit.refetch.length === 0;
  return (
    `${audit.current} clip(s) match the current derivation, ${audit.curated} hand-curated, ` +
    `${audit.refetch.length} would be refetched` +
    (clean ? "." : ` — the derivation has drifted and this run will re-buy them.`)
  );
}

/**
 * The SHAPE of a unit's drilling: which sentence frame dominates it, and which taught items are only
 * ever drilled inside that frame.
 *
 * ── Why this is facts-only, and why the verdict lives elsewhere ───────────────────────────────────
 *
 * Everything here is arithmetic over strings and says nothing about whether what it found is wrong.
 * That split is not squeamishness, it is the calibration result. On 2026-09-20 an extras unit was
 * built whose gap fills were 51% one frame, the request pattern, which is NOT what its chapter
 * teaches; ten of its nineteen taught verb forms appeared in that frame and nowhere else. The
 * obvious check ("flag a unit where one frame dominates") was measured against every unit already
 * shipped in this book before being written, and it fires on the units that are RIGHT:
 *
 *   chapter-16-extras  48% "invite" frame   its lesson IS making an invitation
 *   chapter-17         45% "past wish"      its lesson IS stating a wish
 *   chapter-12-extras  35% "there is"       its lesson IS asking what is somewhere
 *   chapter-5-extras   25%, and 11 taught items drilled in that frame alone, its lesson IS
 *                      ordering things, so the counters SHOULD only appear in it
 *
 * A dominant frame is what a well-built unit looks like when the chapter has one grammar point. The
 * defect is a dominant frame that is not the chapter's point, and no arithmetic over the cards can
 * tell the two apart: it needs to know what the chapter teaches. So this module computes, an agent
 * names the grammar point (`src/agents/finalReview.js`), and the diff between them is
 * mechanical again.
 *
 * Shipping the threshold version would have added 7-12 findings per chapter, nearly all of them
 * correct behaviour, which is the failure the registry warns about in as many words: a permanently
 * non-zero number teaches the operator to ignore the report.
 */

/** Cards worth treating as sentences: long enough that a trailing frame means something. */
const MIN_SENTENCE_CHARS = 8;
/** Below this many sentences a "dominant" frame is an artefact of a small sample. */
const MIN_SENTENCES = 8;
/** A frame shorter than this is a grammatical ending every sentence shares, not a frame. */
const MIN_FRAME_CHARS = 4;
const MAX_FRAME_CHARS = 10;

const sentences = (items) =>
  items.filter((item) => !item.excluded && (item.target ?? "").length >= MIN_SENTENCE_CHARS);

/**
 * The trailing frame shared by the most of a unit's sentences, preferring the LONGEST frame at a
 * given count so "please do X" wins over the bare politeness ending inside it.
 *
 * Returns null when the unit has too few sentences to say anything, which is a real answer and not
 * a zero: a 5-card unit has no shape to report.
 */
export function dominantFrame(items) {
  const targets = sentences(items).map((item) => item.target);
  if (targets.length < MIN_SENTENCES) return null;

  let best = null;
  for (let length = MIN_FRAME_CHARS; length <= MAX_FRAME_CHARS; length++) {
    const counts = new Map();
    for (const target of targets) {
      if (target.length < length) continue;
      const frame = target.slice(-length);
      counts.set(frame, (counts.get(frame) ?? 0) + 1);
    }
    for (const [frame, count] of counts) {
      if (count < 2) continue;
      const better =
        !best || count > best.count || (count === best.count && frame.length > best.frame.length);
      if (better) best = { frame, count, total: targets.length, share: count / targets.length };
    }
  }
  return best;
}

/** Every frame that at least `minCount` of a unit's sentences end with, largest share first. */
export function frameDistribution(items, { minCount = 3 } = {}) {
  const targets = sentences(items).map((item) => item.target);
  if (!targets.length) return [];
  const counts = new Map();
  for (const target of targets) {
    for (let length = MIN_FRAME_CHARS; length <= MAX_FRAME_CHARS; length++) {
      if (target.length < length) continue;
      const frame = target.slice(-length);
      counts.set(frame, (counts.get(frame) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count >= minCount)
    .map(([frame, count]) => ({
      frame,
      count,
      total: targets.length,
      share: count / targets.length,
    }))
    .sort((a, b) => b.count - a.count || b.frame.length - a.frame.length);
}

/**
 * Taught items that appear in the drill unit ONLY inside sentences ending with `frame`.
 *
 * `taughtItems` are the base unit's approved cards; `drillItems` the extras unit's. An item drilled
 * nowhere at all is not reported here, that hole is `taughtNeverUsed`'s job, and reporting it twice
 * under two names is how one problem becomes two numbers nobody reads.
 */
/**
 * The forms a taught item might actually be written as inside a sentence.
 *
 * A handful of headwords carry the book's optional-part notation (`いろいろ(な)`, `(お)さら`) and
 * that literal string appears in no sentence, so a card using the word every day counted as drilled
 * zero times. Reported by the final review on Lesson 19, where `いろいろ(な)` read as undrilled while
 * two shipping sentences used いろいろな.
 *
 * This is a COUNTING aid only. `assignSourceOrder` deliberately does not do this: it matches against
 * the chapter, where `normalizeDisplayText` already resolves the notation, and adding variants there
 * was measured and moved a card to the wrong offset.
 */
function writtenForms(target) {
  const base = String(target ?? "");
  if (!base) return [];
  if (!/[()（）]/.test(base)) return [base];
  return [
    ...new Set([base.replace(/[()（）]/g, ""), base.replace(/[(（][^)）]*[)）]/g, ""), base]),
  ].filter(Boolean);
}

// A drill is read in both its written and its spoken text. A sentence that writes a number as a
// digit (うちからえきまで…15ふん) spells it out only in `ttsText` (じゅうごふん), so reading the target
// alone reported じゅうごふん, さんじゅっぷん and いちじかん as undrilled on Lesson 20 while three
// shipping sentences drilled them.
const drillTexts = (drill) =>
  [drill.target, drill.ttsText].filter((t) => typeof t === "string" && t.length);
const usesItem = (drill, itemTarget) =>
  writtenForms(itemTarget).some((form) => drillTexts(drill).some((text) => text.includes(form)));

export function itemsOnlyInFrame(taughtItems, drillItems, frame) {
  if (!frame) return [];
  const drills = drillItems.filter((item) => !item.excluded && item.target);
  return taughtItems
    .filter((item) => !item.excluded && item.target)
    .map((item) => {
      const using = drills.filter((drill) => usesItem(drill, item.target));
      return { item, using };
    })
    .filter(({ using }) => using.length > 0 && using.every((d) => d.target.endsWith(frame)))
    .map(({ item, using }) => ({ item, count: using.length }));
}

/** How many sentences drill each taught item, so a 16-versus-1 skew is visible rather than felt. */
export function drillCoverage(taughtItems, drillItems) {
  const drills = drillItems.filter((item) => !item.excluded && item.target);
  return taughtItems
    .filter((item) => !item.excluded && item.target)
    .map((item) => ({
      item,
      count: drills.filter((drill) => usesItem(drill, item.target)).length,
    }))
    .sort((a, b) => a.count - b.count);
}

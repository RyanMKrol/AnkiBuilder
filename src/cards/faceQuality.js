// The three mechanical tests behind rules `references/card-authoring-rules.md` already states in
// prose. Each one detects a shape; NONE of them decides whether the card is wrong. That split is the
// point: "It's the 3rd floor." with no scene is unanswerable as a Production prompt and perfectly
// fine as a Recognition one, and only a human looking at the card knows which it is.
//
// They live here rather than inside a check so the fill-in-the-blank pass (which already warns on the
// first of them at generation time) and preflight (which reports all three over the finished deck)
// cannot disagree about what the rule is.

/**
 * English that supplies no subject of its own, so the card only makes sense as a reply to something.
 * Deliberately narrow — a leading pronoun stand-in is the shape that actually goes wrong, and a
 * looser test flags ordinary self-contained sentences ("It's 10am in Tokyo.") that need no cue.
 */
export const ANSWER_SHAPED =
  /^\s*(it['’]s|it is|that['’]s|they['’]re|they are|he['’]s|she['’]s)\b/i;

/** True when the English reads as an answer to an unstated question and no `scene` supplies one. */
export function isContextlessAnswer(item) {
  return typeof item.english === "string" && ANSWER_SHAPED.test(item.english) && !item.scene;
}

/**
 * How long an English prompt can get before the Production card stops being one prompt.
 *
 * 60 characters is the point at which the live deck stops holding single sentences: below it the
 * cards are ordinary drill lines, above it they are three-clause self-introductions ("Nice to meet
 * you. I am Brown of the Bank of London. I look forward to working with you." — 87 characters, one
 * card, one expected answer). The learner has to reproduce all of it from an English paragraph,
 * which is a recall task, not a flashcard.
 */
export const PRODUCTION_FACE_MAX_CHARS = 60;

/** True when the Production front is long enough to be worth splitting or shipping Recognition-only. */
export function isOverlongProductionFace(item) {
  return typeof item.english === "string" && item.english.length >= PRODUCTION_FACE_MAX_CHARS;
}

// A slot is a digit run (a price, a clock time, a floor) or a Capitalised word (a personal name, a
// place, a company). Those are the two things a textbook swaps to turn one sentence pattern into a
// bank of drill cards.
const SLOT = /\b\d+(?:[:.,]\d+)*\b|\b[A-Z][\p{L}]+(?:-[a-z]+)?\b/gu;
const SLOT_MARK = "◇";

/**
 * The minimum number of ORDINARY words a frame must still carry once its slots are blanked out.
 *
 * This is the whole difference between a signal and a permanent report line. Without it the check
 * groups `Yes` / `No` / `Germany` / `China` under the frame `◇` and reports 270 cards, and it fires
 * on the deck's best minimal-pair drills (`Nine minutes` / `Six minutes`) — which are not near
 * siblings, they are the counter series the lesson exists to teach. At three words the check keeps
 * only real sentence frames: on the live book it names 7 frames over 24 cards, e.g. `Smith-san, what
 * country are you from?` swapped three ways.
 */
const MIN_FRAME_WORDS = 3;

/** The frame a sentence belongs to, or `null` when it has no slots or too little else. */
export function sentenceFrame(english) {
  if (typeof english !== "string") return null;
  const slots = english.match(SLOT);
  if (!slots) return null;
  const frame = english.replace(SLOT, SLOT_MARK);
  const words =
    frame
      .split(SLOT_MARK)
      .join(" ")
      .match(/[a-z']+/gi) ?? [];
  if (words.length < MIN_FRAME_WORDS) return null;
  return { key: frame.toLowerCase().replace(/\s+/g, " ").trim(), slots: slots.join("|") };
}

/**
 * Groups of 3+ cards that are the SAME sentence with a different name or number in it.
 *
 * A group only counts when every member fills the slots differently. Two cards with identical slots
 * are the same card twice, which is the duplicate check's business and not this one's.
 */
export function findNearSiblings(items) {
  const byFrame = new Map();
  for (const item of items) {
    const frame = sentenceFrame(item.english);
    if (!frame) continue;
    if (!byFrame.has(frame.key)) byFrame.set(frame.key, []);
    byFrame.get(frame.key).push({ item, slots: frame.slots });
  }
  return [...byFrame.entries()]
    .filter(
      ([, members]) =>
        members.length >= 3 && new Set(members.map((m) => m.slots)).size === members.length,
    )
    .map(([key, members]) => ({ frame: key, members: members.map((m) => m.item) }));
}

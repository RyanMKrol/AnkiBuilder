import { defineCheck } from "../registry.js";
import { unitChapterNumber, unitLanguage } from "../units.js";
import { loadEarlierTaughtItems } from "../../cards/earlierUnits.js";
import { isPredicateShaped } from "../../cards/predicateShape.js";
import { teachableVocabulary, findUnteachable } from "../../agents/extrasVocabulary.js";
import { normalizeDisplayText } from "../../model/scriptSpacing.js";
import { uncardedVerbs } from "../../cards/uncardedVerbs.js";

// Does a sentence the DECK wrote use a word the book has not taught yet?
//
// QA rulings 5 and 6 (2026-10-18, DECISIONS.md "A deck reads as the book..." and "When a class
// convention and the book disagree"). A card the book printed can use whatever the book likes; a card
// the deck wrote (`aiSuggested`, from the extras passes) or brought in from class notes (`addition`)
// has to work for a learner who has studied only what the book taught before it. The rule was in
// docs/card-rules-shared.md and in every authoring prompt, and the QA run still found 26 cards
// breaking it, 13 of them from the additions pathway, which runs no "taught by here" step at all.
// This is the check that was missing.
//
// "Before it" is BOOK position (`meta.chapterNumber`, through `loadEarlierTaughtItems`), so a
// supplement built late is judged where the book prints it. The card's own chapter counts as taught
// too: the extras passes are told they may use the chapter's approved base vocabulary, and a word card
// in the same extras unit is a card the learner meets alongside the sentence.
//
// HOW A WORD IS FOUND. The same coverage test the extras passes already run on their own output
// (`findUnteachable`): mark every character a taught form accounts for, and what is left is the
// residue. Substring containment over a space-free script cannot be certain, which is why this is a
// report with the residue in it, not a verdict. Three refinements keep the residue to content words:
//
//   - the deck cards verbs in their ます form, so each taught ます verb also teaches its stem
//     (いきます teaches いき, which is what covers いきました);
//   - the polite endings and particles are grammar the book teaches in its first lessons, so they
//     cover too;
//   - a piece followed by さん, ちゃん, くん or さま is a person's name, and names are not cards
//     (ruling 4), so they are never a finding.
//
// VERBS are found a second way, by their endings (src/cards/uncardedVerbs.js), because containment
// let おきます ("get up") through two Lesson 9 sentences: its おき sits inside おおきい ("big"), and
// a piece seen inside any earlier card counts as met. Owner review, 2026-10-30.
//
// A word that IS glossed in the card's note is ruling 5's default fix, already applied. It is still
// reported, by the separate INFO check below, so a reviewer can see what the note introduces.
//
// TIER. ACK, as the design (docs/designs/qa-fix-pass-2026-10.md, T6) asks: a finding is a judgement
// (gloss, swap or cut, or a false match), so each one is accepted or fixed by hand. Its first live run
// on Busy People Book 1 found 8 unglossed instances, few enough for the QA fix pass to judge, which is
// why it did not ship as INFO. The glossed check stays INFO: there the fix is already in the note.

/** Polite endings and particles: grammar, never a content word. Japanese only. */
const JA_GRAMMAR_FORMS = [
  "ませんでした",
  "ではありません",
  "じゃありません",
  "ましょう",
  "ました",
  "ません",
  "でした",
  "ください",
  "ます",
  "です",
  "から",
  "まで",
  "より",
  // The inflections the book drills on a word it has taught (an い-adjective's negative and past,
  // a verb's negative request). The stem rule below is what lets these cover.
  "くなかった",
  "ないでください",
  "くない",
  "かった",
];
const JA_PARTICLES = new Set([..."はがをにでへもとのかねよや"]);
const JA_NAME_SUFFIXES = ["さん", "ちゃん", "くん", "さま"];
/** Anything that is not a word character of the script: digits, Latin, punctuation. */
const NON_WORD = /[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+/u;

/** Is this card one the deck wrote, rather than one the book printed? */
export function isDeckWritten(item) {
  return Boolean(item?.aiSuggested || item?.addition);
}

/** Every form the learner has met before `card`, plus the grammar every lesson takes for granted. */
function taughtForms(taughtItems, card, languageCode) {
  const others = taughtItems.filter(
    (item) => !(item.id === card.id && item.target === card.target),
  );
  const forms = teachableVocabulary({ earlierItems: others }, languageCode);
  if (languageCode === "ja") {
    for (const form of [...forms]) {
      if (form.endsWith("ます") && form.length > 2) forms.add(form.slice(0, -2));
      // An い-adjective teaches its stem (さむい teaches さむ, which with くない covers さむくない).
      // Only for a word, never a sentence: a stem cut off the end of a sentence covers nothing real.
      else if (form.endsWith("い") && form.length > 2 && !NON_WORD.test(form)) {
        forms.add(form.slice(0, -1));
      }
    }
    for (const form of JA_GRAMMAR_FORMS) forms.add(form);
  }
  return forms;
}

/**
 * Is this piece (part of) a person's name? It is when an honorific follows it directly or within two
 * characters, since the containment test often covers a name's last kana (the か of たなか is the
 * question particle) and leaves only the front of it.
 */
function isName(piece, sentence) {
  for (let at = sentence.indexOf(piece); at !== -1; at = sentence.indexOf(piece, at + 1)) {
    const after = sentence.slice(at + piece.length, at + piece.length + 5);
    if (JA_NAME_SUFFIXES.some((suffix) => [0, 1, 2].some((gap) => after.startsWith(suffix, gap)))) {
      return true;
    }
  }
  return false;
}

/** The residue pieces that look like content words, with particles and names taken out. */
function contentWords(runs, sentence, languageCode) {
  const words = [];
  for (const run of runs) {
    for (let piece of run.split(NON_WORD)) {
      if (!piece) continue;
      if (languageCode === "ja") {
        if (isName(piece, sentence)) continue;
        // One particle each side at most: the residue usually starts on the particle after a
        // taught word (これ|はとけい), and stripping more would eat the と of とけい.
        if (JA_PARTICLES.has(piece[0])) piece = piece.slice(1);
        if (JA_PARTICLES.has(piece.at(-1))) piece = piece.slice(0, -1);
      }
      // One leftover character is noise from the containment test (a kana between two taught
      // forms), not a word anyone could gloss.
      if ([...piece].length >= 2 && !words.includes(piece)) words.push(piece);
    }
  }
  return words;
}

/**
 * Every deck-written card in a collection with the words in it the book has not taught by the
 * card's unit, split into the ones its note glosses and the ones it does not.
 *
 * A lexical entry (a word card) is skipped: it teaches its own target, so its target is not a word
 * the learner has to know already.
 */
export function findUntaughtWords(collectionDir, units) {
  const rows = [];
  const byChapter = new Map();
  let checked = 0;
  for (const unit of units) {
    const chapterNumber = unitChapterNumber(unit.meta);
    const languageCode = unitLanguage(unit);
    if (chapterNumber === null || !languageCode) continue;
    const cards = (unit.items ?? []).filter((item) => !item.excluded && isDeckWritten(item));
    if (cards.length === 0) continue;
    // Everything through this chapter: the earlier units by book position, then this chapter's base
    // unit and the word cards of its extras (loadEarlierTaughtItems' own rule for an extras unit).
    if (!byChapter.has(chapterNumber)) {
      byChapter.set(
        chapterNumber,
        loadEarlierTaughtItems(collectionDir, chapterNumber + 1, languageCode),
      );
    }
    const taughtItems = byChapter.get(chapterNumber);

    for (const card of cards) {
      if (isPredicateShaped(card.target, languageCode) === false && !NON_WORD.test(card.target)) {
        continue;
      }
      checked++;
      const taught = taughtForms(taughtItems, card, languageCode);
      const [hit] = findUnteachable([card], taught, { languageCode, maxResidue: 1 });
      const sentence = normalizeDisplayText(card.target.trim(), languageCode);
      // A piece the learner has SEEN inside an earlier card is met, even though no card teaches it
      // on its own: the book teaches おねがいします inside よろしくおねがいします, and its names
      // inside its dialogue lines.
      const seen = [...taught];
      const words = hit
        ? contentWords(hit.runs, sentence, languageCode).filter(
            (word) => !seen.some((form) => form.includes(word)),
          )
        : [];
      // Verbs are found by their endings instead, because the "seen inside an earlier card" rule
      // above is what let おきます ("get up") through: its おき sits inside おおきい ("big").
      // src/cards/uncardedVerbs.js.
      const others = taughtItems.filter((item) => item.id !== card.id);
      for (const verb of uncardedVerbs(sentence, others, languageCode) ?? []) {
        if (!words.some((word) => verb.includes(word) || word.includes(verb))) words.push(verb);
      }
      if (words.length === 0) continue;
      const note = normalizeDisplayText(card.note ?? card.cardNote ?? "", languageCode);
      rows.push({
        unit: unit.name,
        card,
        glossed: words.filter((word) => note.includes(word)),
        unglossed: words.filter((word) => !note.includes(word)),
      });
    }
  }
  return { rows, checked };
}

// Both checks read the same collection, so the work is done once per loaded collection.
const cache = new WeakMap();
function untaughtFor(collection, units) {
  if (!cache.has(collection)) cache.set(collection, findUntaughtWords(collection.dir, units));
  return cache.get(collection);
}

const appliesTo = (collection) => collection.kind === "epub" || collection.kind === "course";

function describe(row, words, tail) {
  const { card } = row;
  return (
    `${row.unit}: "${card.target}" (${card.english || "no gloss"}, ` +
    `${card.addition ? `addition ${card.addition}` : "deck-written"}) uses ` +
    `${words.map((word) => `"${word}"`).join(", ")}, which no card the book has taught by this ` +
    `unit carries. ${tail}`
  );
}

export const untaughtWordsCheck = defineCheck({
  id: "untaught-words",
  title: "untaught words",
  scope: "collection",
  tier: "ACK",
  appliesTo,
  run({ collection, units }) {
    const { rows, checked } = untaughtFor(collection, units);
    if (checked === 0) return { skipped: "no deck-written sentence cards in a numbered unit" };
    const findings = rows
      .filter((row) => row.unglossed.length > 0)
      .map((row) => ({
        key: `${row.unit}/${row.card.id}`,
        message: describe(
          row,
          row.unglossed,
          `Gloss it in the note, swap it for a word the learner has met, or cut the card if the ` +
            `grammar is untaught (ruling 5). It can also be a false match: a name, or a form the ` +
            `containment test could not see.`,
        ),
      }));
    return { findings, summary: `${checked} deck-written card(s) checked against book order` };
  },
});

export const untaughtGlossedCheck = defineCheck({
  id: "untaught-words-glossed",
  title: "untaught, glossed",
  scope: "collection",
  tier: "INFO",
  appliesTo,
  run({ collection, units }) {
    const { rows, checked } = untaughtFor(collection, units);
    if (checked === 0) return { skipped: "no deck-written sentence cards in a numbered unit" };
    const findings = rows
      .filter((row) => row.glossed.length > 0)
      .map((row) => ({
        key: `${row.unit}/${row.card.id}`,
        message: describe(
          row,
          row.glossed,
          `The note glosses it, which is ruling 5's default fix.`,
        ),
      }));
    return { findings, summary: `${checked} deck-written card(s) checked against book order` };
  },
});

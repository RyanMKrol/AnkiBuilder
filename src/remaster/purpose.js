// What a conversion is FOR. The conversion pipeline is shared end to end (OCR, outline,
// transcription, two readings, settling, figures, build, verify); the purpose changes one thing,
// which study units the selection agent recommends converting, and it names the result.
//
// Owner ruling, 2026-09-21 (DECISIONS.md, "A conversion has a purpose, and each purpose is its own
// collection"): the deck pipeline builds for speaking and listening, so that is the default. A
// reading-and-writing conversion picks the script and character units instead (Genki's kanji
// lessons), and is its own collection, so its cards are never deduplicated against the speaking
// deck's.
//
// Amended 2026-09-23: an `everything` purpose keeps every study unit, so a reading deck
// (docs/designs/reading-decks/) misses nothing the book teaches. The 2026-09-21 reason for not having
// one still holds for speaking decks (feeding the kanji units to the speaking pipeline flagged every
// kanji card as "already taught"), so it is enforced as a check instead: the speaking pipeline
// refuses a book converted for anything but speaking and listening (refuseForSpeakingDeck, below).
//
// Transcripts are per page and shared by every purpose, so converting a book for a second purpose
// only pays for the pages the first did not cover.

export const PURPOSES = Object.freeze({
  "speaking-listening": {
    title: "speaking and listening",
    // Whether a deck pipeline consumes this purpose today. A conversion for a purpose nothing
    // consumes still works; the converter says so rather than implying a deck will follow.
    hasDeckPipeline: true,
    criteria: `The learner is building speaking and listening decks: vocabulary, set phrases and
grammar, each card with native audio, studied by hearing a word and saying it back. Written
Japanese on a card only supports what is heard.

- Include a unit that teaches words, phrases or grammar the learner would say or hear: every
  numbered conversation or grammar lesson, and warm-up units such as greetings or numbers.
- Exclude a unit whose subject is the writing system: alphabet or kana charts, an introduction to
  how the script works, a lesson that teaches characters (kanji) or how to write them, and
  reading passages whose purpose is practising a script. Those belong to a reading-and-writing
  conversion, not this one.
- Exclude reference material that restates the lessons.`,
  },
  "reading-writing": {
    title: "reading and writing",
    hasDeckPipeline: false,
    criteria: `The learner is building reading and writing decks: recognising and writing the script, and
for languages written with characters, each character's meaning, readings and the words it
spells. Spoken vocabulary and grammar are covered by a separate speaking-and-listening deck.

- Include a unit whose subject is the writing system: alphabet or kana lessons, an introduction to
  how the script works, lessons that teach characters (kanji) with their readings, and reading
  passages written to practise them.
- Exclude a unit that teaches spoken vocabulary or grammar without teaching the script.
- Exclude a chart or reference table that only repeats a unit you include; prefer the unit that
  teaches.`,
  },
  everything: {
    title: "everything",
    // The reading deck pipeline builds from it (docs/designs/reading-decks/).
    hasDeckPipeline: true,
    criteria: `The learner wants the whole book: every unit that teaches something, whatever skill it
teaches. The result feeds a reading deck, which needs both the vocabulary the book teaches and the
characters it teaches, so nothing that teaches may be left out.

- Include every study unit: numbered conversation and grammar lessons, warm-up units such as
  greetings or numbers, alphabet or kana lessons, an introduction to how the script works, lessons
  that teach characters (kanji) with their readings, and reading passages.
- Exclude front matter and back matter: the cover, copyright, preface, contents, an introduction
  for teachers, and the book's own navigation pages.
- Exclude reference material that restates the lessons: indexes, glossaries, conjugation charts,
  maps and answer keys.`,
  },
});

export const DEFAULT_PURPOSE = "speaking-listening";

export function resolvePurpose(name = DEFAULT_PURPOSE) {
  const purpose = PURPOSES[name];
  if (!purpose) {
    throw new Error(
      `unknown purpose "${name}". A conversion is for one of: ${Object.keys(PURPOSES).join(", ")}`,
    );
  }
  return { name, ...purpose };
}

/** The purposes a speaking-and-listening deck may be built from. */
const SPEAKING_SOURCE_PURPOSES = new Set(["speaking-listening"]);

const PURPOSE_IN_SOURCE = /\bpurpose ([a-z-]+)\s*$/;

/**
 * The purpose a converted book was made for, read from its OPF `<dc:source>` text (written by
 * src/remaster/epubWriter.js as "remastered from page images, ..., purpose <name>"). `null` for a
 * book that was not converted, or a conversion from before purposes existed.
 */
export function purposeFromSource(sourceText) {
  if (!sourceText || !sourceText.startsWith("remastered from page images")) return null;
  const match = PURPOSE_IN_SOURCE.exec(sourceText);
  return match ? match[1] : null;
}

/**
 * Throws when a book was converted for a purpose a speaking deck must not be built from. This is the
 * 2026-09-21 ruling's reason, kept as a check now that an `everything` purpose exists: a book holding
 * the kanji lessons makes the speaking pipeline flag every kanji card as already taught. A book that
 * was never converted, or was converted for speaking and listening, passes.
 */
export function refuseForSpeakingDeck(sourceText) {
  const purpose = purposeFromSource(sourceText);
  if (!purpose || SPEAKING_SOURCE_PURPOSES.has(purpose)) return;
  throw new Error(
    `this book was converted for "${purpose}", and a speaking-and-listening deck is only built from ` +
      `a book converted for speaking-listening. Convert it for that purpose ` +
      `(convert-book, --purpose speaking-listening) and build the speaking deck from that book; ` +
      `a reading deck is built from this one.`,
  );
}

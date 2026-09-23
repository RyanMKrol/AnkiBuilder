// What a conversion is FOR. The conversion pipeline is shared end to end (OCR, outline,
// transcription, two readings, settling, figures, build, verify); the purpose changes one thing,
// which study units the selection agent recommends converting, and it names the result.
//
// Owner ruling, 2026-09-21 (DECISIONS.md, "A conversion has a purpose, and each purpose is its own
// collection"): the deck pipeline builds for speaking and listening, so that is the default. A
// reading-and-writing conversion picks the script and character units instead (Genki's kanji
// lessons), and is its own collection, so its cards are never deduplicated against the speaking
// deck's. There is deliberately no "everything" purpose: feeding the kanji units to a speaking
// pipeline is exactly what flagged every kanji card as "already taught".
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

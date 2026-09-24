// The READING collection's checks (docs/designs/reading-decks/07-checks.md). Each rule in
// docs/card-rules-reading.md and the language plugin (src/reading/readingSchemes.js) that code can
// see is a check here, because a rule in prose is a hope.
//
// Every check reads ONE reading collection, like every check in this directory. They only apply to a
// reading collection (`collection.deckKind`), and the speaking checks that do not apply to one are
// skipped for it by src/audit/checks/index.js and listed by `readingSkippedChecks`, so "not run"
// never reads as "passed".

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { defineCheck } from "../registry.js";
import { unitLanguage } from "../units.js";
import { isReadingKind } from "../../model/deckKind.js";
import { readingScheme, isSilentReadingCard } from "../../reading/readingSchemes.js";

const shipped = (unit) => unit.items.filter((item) => !item.excluded);
const isReading = (collection) => isReadingKind(collection?.deckKind);
const chars = (text) => [...String(text ?? "").trim()];

/** Past this many characters a front stops being word-sized. A starting point, tuned on the pilot. */
export const READING_TARGET_MAX_CHARS = 16;

const RUBY = /<\/?(ruby|rt|rp)\b/i;
const BRACKETED_KANA = /[(（][\p{Script=Hiragana}\p{Script=Katakana}ー\s]+[)）]/u;
// A question mark is left alone: お元気ですか？ is a set phrase. A full stop or an exclamation mark
// on a front means a sentence got in (the merge strips the one a book prints after a phrase).
const SENTENCE_PUNCTUATION = /[。！!]/;
const LATIN = /[A-Za-z]/;

function readingCheck(spec) {
  return defineCheck({ appliesTo: isReading, ...spec });
}

export const readingFrontCheck = readingCheck({
  id: "reading-front",
  title: "reading front gives nothing away",
  scope: "unit",
  tier: "FAIL",
  /**
   * The front is `target` alone (the reading template), so `target` must not carry the answer:
   * no furigana markup, no reading in brackets, and no sentence punctuation, which means a sentence
   * got in (card rules 3 and 6).
   */
  run({ unit }) {
    const findings = [];
    for (const item of shipped(unit)) {
      const target = String(item.target ?? "");
      const problem = RUBY.test(target)
        ? "carries furigana markup"
        : BRACKETED_KANA.test(target)
          ? "carries a reading in brackets"
          : SENTENCE_PUNCTUATION.test(target)
            ? "ends like a sentence"
            : null;
      if (problem) {
        findings.push({ key: item.id, message: `${item.id} "${target}" ${problem}` });
      }
    }
    return { findings, summary: "every front is the written form alone" };
  },
});

export const readingLatinCheck = readingCheck({
  id: "reading-latin",
  title: "reading front with Latin letters",
  scope: "unit",
  tier: "ACK",
  /**
   * Latin letters on a front are usually romaji leaking in, which gives the answer away. Not always:
   * Japanese writes some words with them (Ｔシャツ), so this is an acknowledgement, not a failure.
   */
  run({ unit }) {
    const findings = shipped(unit)
      .filter((item) => LATIN.test(String(item.target ?? "")))
      .map((item) => ({ key: item.id, message: `${item.id} "${item.target}" has Latin letters` }));
    return { findings, summary: "no front carries Latin letters" };
  },
});

export const readingOneCardPerFrontCheck = readingCheck({
  id: "reading-one-card-per-front",
  title: "one card per written form",
  scope: "collection",
  tier: "FAIL",
  /**
   * Two cards with the same front are the same question with two answers (card rules 3). Across the
   * whole collection, since the collection is one deck.
   */
  run({ units }) {
    const seen = new Map();
    const findings = [];
    for (const unit of units) {
      for (const item of shipped(unit)) {
        const key = String(item.target ?? "").trim();
        if (!key) continue;
        if (seen.has(key)) {
          findings.push({
            key: `${unit.name}/${item.id}`,
            message: `"${key}" is carded twice: ${seen.get(key)} and ${unit.name}/${item.id}`,
          });
        } else {
          seen.set(key, `${unit.name}/${item.id}`);
        }
      }
    }
    return { findings, summary: "every written form is carded once" };
  },
});

export const readingSingleCharacterCheck = readingCheck({
  id: "reading-single-character",
  title: "single-character cards",
  scope: "unit",
  tier: "FAIL",
  /**
   * A single character is a card only when the language plugin cards characters and this is one it
   * cards (card rules 4). A single kana is judged by reading-single-kana instead: it is right as a
   * word (に "Two") and wrong as a letter, and the card does not record which.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    const findings = [];
    for (const item of shipped(unit)) {
      const target = String(item.target ?? "").trim();
      if (chars(target).length !== 1 || scheme?.isSingleLetter?.(target)) continue;
      const allowed = scheme?.characterCards && scheme.isCharacterTarget(target);
      if (!allowed) {
        findings.push({
          key: item.id,
          message: `${item.id} "${target}" is a single character this deck does not card`,
        });
      }
    }
    return { findings, summary: "every single-character card is one the language cards" };
  },
});

export const readingKanaInChapterCheck = readingCheck({
  id: "reading-kana-in-chapter",
  title: "kana words stay in the kana deck",
  scope: "unit",
  tier: "FAIL",
  /**
   * In a language whose reading scheme has a kana deck, a chapter cards kanji only; its kana words
   * are chosen once for the whole collection in the kana deck (src/reading/kanaUnits.js; owner
   * decisions, 2026-09-24). The kana unit itself is the one whose label is the scheme's.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    if (!scheme?.kanaDeck || unit.meta?.chapterLabel === scheme.kanaDeck.label) {
      return { findings: [], summary: "not a chapter of a collection with a kana deck" };
    }
    const findings = shipped(unit)
      .filter((item) => !scheme.requiresReading(String(item.target ?? "")))
      .filter((item) => !isSilentReadingCard(item, scheme))
      .map((item) => ({
        key: item.id,
        message: `${item.id} "${item.target}" is a kana word in a chapter; it belongs in the kana deck (re-merge the chapter)`,
      }));
    return { findings, summary: "every chapter card has a kanji" };
  },
});

export const readingSingleKanaCheck = readingCheck({
  id: "reading-single-kana",
  title: "single-kana cards",
  scope: "unit",
  tier: "ACK",
  /**
   * A single kana is a card only as a word the book teaches with its own meaning (に "Two"), never as
   * a letter of the syllabary (card rules 5, owner ruling 2026-09-24). The merge keeps only the ones
   * a reader called a word, but the card does not carry that, so each is confirmed by a person.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    const findings = shipped(unit)
      .filter((item) => scheme?.isSingleLetter?.(String(item.target ?? "").trim()))
      .map((item) => ({
        key: item.id,
        message: `${item.id} "${item.target}" (${item.english}) is a single kana: right as a word, wrong as a letter`,
      }));
    return { findings, summary: "no single-kana card" };
  },
});

export const readingLengthCheck = readingCheck({
  id: "reading-length",
  title: "reading front is word-sized",
  scope: "unit",
  tier: "ACK",
  run({ unit }) {
    const findings = shipped(unit)
      .filter((item) => chars(item.target).length > READING_TARGET_MAX_CHARS)
      .map((item) => ({
        key: item.id,
        message:
          `${item.id} "${item.target}" is ${chars(item.target).length} characters; a reading ` +
          `card is a word or a set phrase. Accept it if the book teaches it as one unit.`,
      }));
    return { findings, summary: `no front over ${READING_TARGET_MAX_CHARS} characters` };
  },
});

export const readingReadingCheck = readingCheck({
  id: "reading-kana-reading",
  title: "kanji words carry a kana reading",
  scope: "unit",
  tier: "FAIL",
  /**
   * A word the language plugin says needs a reading (a Japanese word with kanji) must carry one, in
   * kana, or the TTS voice may read it wrongly. A silent character card needs none.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    if (!scheme) return { findings: [], summary: "this language needs no separate reading" };
    const findings = [];
    for (const item of shipped(unit)) {
      if (isSilentReadingCard(item, scheme) || !scheme.requiresReading(item.target)) continue;
      if (!item.ttsText) {
        findings.push({ key: item.id, message: `${item.id} "${item.target}" has no reading` });
      } else if (!scheme.isValidReading(item.ttsText)) {
        findings.push({
          key: item.id,
          message: `${item.id} "${item.target}" has a reading that is not kana: "${item.ttsText}"`,
        });
      }
    }
    return { findings, summary: "every kanji word carries a kana reading" };
  },
});

export const readingKanjiSpellingCheck = readingCheck({
  id: "reading-kanji-spelling",
  title: "the kanji spelling was used",
  scope: "unit",
  tier: "ACK",
  /**
   * When the book prints a word in kanji, the card is the kanji spelling (05, part 1). A kana-only
   * card whose text is the READING of a kanji spelling the readers saw in this chapter slid back to
   * kana. Read from the unit's own candidates, never from the book.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    if (!scheme) return { findings: [], summary: "this language has one written form per word" };
    const kanjiByReading = new Map();
    const note = (target, reading) => {
      if (target && reading && scheme.requiresReading(target)) {
        kanjiByReading.set(String(reading).trim(), String(target).trim());
      }
    };
    for (const item of unit.items) note(item.target, item.ttsText);
    for (const file of ["tables.json", "chapter.json", "images.json"]) {
      const path = join(unit.dir, "candidates", file);
      if (!existsSync(path)) continue;
      try {
        for (const item of JSON.parse(readFileSync(path, "utf-8")).items ?? []) {
          note(item.target, item.reading);
        }
      } catch {
        /* an unreadable candidates file has nothing to say here */
      }
    }
    const findings = [];
    for (const item of shipped(unit)) {
      const target = String(item.target ?? "").trim();
      if (scheme.requiresReading(target)) continue;
      const kanji = kanjiByReading.get(target);
      if (kanji && kanji !== target) {
        findings.push({
          key: item.id,
          message: `${item.id} "${target}" is carded in kana, and the book prints it as "${kanji}"`,
        });
      }
    }
    return { findings, summary: "no word is carded in kana where the book prints its kanji" };
  },
});

export const readingEnglishCheck = readingCheck({
  id: "reading-english",
  title: "every reading card has English",
  scope: "unit",
  tier: "FAIL",
  run({ unit }) {
    const findings = shipped(unit)
      .filter((item) => !String(item.english ?? "").trim())
      .map((item) => ({ key: item.id, message: `${item.id} "${item.target}" has no English` }));
    return { findings, summary: "every card has its English" };
  },
});

export const readingRomajiCheck = readingCheck({
  id: "reading-romaji",
  title: "every voiced card has its romaji",
  scope: "unit",
  tier: "FAIL",
  /**
   * The back shows the romaji (owner decision, 2026-09-23 evening), so a card with audio and no romaji
   * leaves the learner unable to check how they read it. A silent character card has none by design.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    const findings = shipped(unit)
      .filter(
        (item) => !isSilentReadingCard(item, scheme) && !String(item.pronunciation ?? "").trim(),
      )
      .map((item) => ({ key: item.id, message: `${item.id} "${item.target}" has no romaji` }));
    return { findings, summary: "every voiced card carries its romaji" };
  },
});

export const readingSilentCheck = readingCheck({
  id: "reading-silent",
  title: "silent cards stay silent",
  scope: "unit",
  tier: "FAIL",
  /**
   * A character card is silent by design: a kanji alone has no one pronunciation. One carrying a clip
   * means the audio stage ignored the plugin, and the clip teaches one arbitrary reading.
   */
  run({ unit }) {
    const scheme = readingScheme(unitLanguage(unit));
    const findings = shipped(unit)
      .filter((item) => isSilentReadingCard(item, scheme) && item.audio)
      .map((item) => ({
        key: item.id,
        message: `${item.id} "${item.target}" is a character card and carries audio (${item.audio})`,
      }));
    return { findings, summary: "no character card carries audio" };
  },
});

/**
 * The speaking checks a reading collection does not run, reported so their absence is visible. Built
 * by src/audit/checks/index.js from the checks it marks speaking-only.
 */
export function readingSkippedChecks(speakingOnlyIds) {
  return readingCheck({
    id: "reading-skipped-speaking-checks",
    title: "speaking checks not run",
    scope: "collection",
    tier: "INFO",
    run() {
      return {
        findings: [],
        summary: `not run on a reading collection: ${speakingOnlyIds.join(", ")}`,
      };
    },
  });
}

export const READING_CHECKS = [
  readingFrontCheck,
  readingLatinCheck,
  readingSingleCharacterCheck,
  readingSingleKanaCheck,
  readingKanaInChapterCheck,
  readingLengthCheck,
  readingReadingCheck,
  readingKanjiSpellingCheck,
  readingEnglishCheck,
  readingRomajiCheck,
  readingSilentCheck,
  readingOneCardPerFrontCheck,
];

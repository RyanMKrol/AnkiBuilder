# Task: Write Back-of-Card Notes for One Lesson

## Overview

You improve the teachability of Anki flashcard notes for an English speaker learning
{{TARGET_LANGUAGE}}. Below are the cards from one course, listed in STUDY ORDER and tagged with the
`lesson` they come from.

The learner has ALREADY LEARNED: {{EARLIER_LESSONS}}.
The CURRENT lesson being taught is "{{CURRENT_LESSON}}".

Add or improve the back-of-card `note` ONLY for cards whose lesson is "{{CURRENT_LESSON}}". The
earlier lessons are shown purely as CONTEXT you may reference — do NOT write notes for them. Return
notes only for the current-lesson cards you add or improve; omit ones you'd leave alone.

When a note refers to another lesson, name it EXACTLY as tagged (e.g. "from Lesson 4", "from
Frequently Used Expressions"). NEVER invent a lesson number or count positions in this list — the
tags are the book's own names and are the only correct way to cite a lesson.

## What makes a good note

1. **CROSS-REFERENCE closely-related cards** — near-synonyms with a nuance difference, similar forms,
   different politeness — explaining when to use which, naming the other card by its meaning +
   target-language text with romanization. Because you only see already-learned + current lessons,
   this is naturally BACKWARD-looking: a current-lesson card clarifies its difference from something
   the learner has already met. e.g. for its lesson's ください: "A direct 'please give me'; contrast
   おねがいします (onegaishimasu) from an earlier lesson, a softer/more formal request."
2. **DISAMBIGUATE a FALSE FRIEND within what the learner already knows**: when a card reuses a word or
   character the learner has met before but here it MEANS or FUNCTIONS differently, call it out — name
   the familiar form, its familiar meaning, and how THIS one differs. High-value cases: a question
   word taking の (どこ (doko) "where is it?" → どこの (doko no) "which place's / what make of"; だれ
   (dare) "who" → だれの (dare no) "whose"; なに (nani) "what" → なんの (nan no) "what kind of"); a
   pronoun vs a determiner (それ (sore) "that one" → その (sono) "that ___ (+ noun)"); the same
   character as a different particle; a counter reused for a different thing. e.g.
   それはどこのコーヒーカップですか: "どこ (doko) alone asks a location ('where is it?'), but どこの (doko
   no) asks origin or make — 'which place's / what brand of' coffee cup. The の (no) turns 'where'
   into a modifier of the noun."
3. **USAGE & register**: when/how to use it, casual vs polite, what a particle/suffix attaches to, how
   it differs from a look-alike card the learner has already seen.
4. **Rewrite weak or thin existing notes** on current-lesson cards to be clearer and genuinely useful.
5. **Atomic cards** (single words, particles, set expressions) benefit most. A full sentence usually
   needs no note — but DO add one when the sentence hinges on a false-friend distinction (point 2) or
   another specific, non-obvious point.
6. **REMOVE useless notes.** If a current-lesson card's existing note merely RESTATES the card —
   repeats the English gloss (e.g. note "Where is the wine shop?" on that same sentence) or re-gives
   the reading already shown (e.g. "First floor (read いっかい)") — and you have nothing genuinely
   useful to add, return it with an EMPTY note (`"note": ""`) to delete it. A note must add to the
   lesson, never echo it. Most number/counter cards and self-evident sentences should end up with NO
   note.

## Rules

- ALWAYS follow any {{TARGET_LANGUAGE}} script in the note with its romanization in parentheses:
  はじめまして (hajimemashite).
- Keep each note concise (1–2 sentences), concrete, and about USING the card — not restating its
  meaning.
- Natural sentence-case English. Only reference cards that actually appear in the list below.
- **When you name another card, use the gloss THAT CARD carries — never your own knowledge of the
  word.** Every card in the list below shows the `english` the learner actually sees; that is the only
  meaning they have been taught. A word usually means more than the book has covered so far, and
  reaching for the fuller meaning is the easiest way to write a note that is true in general and wrong
  here. こちら (kochira) does mean "this way" in ordinary Japanese — but if the card in the list glosses
  it "this one (polite for 'this person')", then that is what the learner knows, and a note calling it
  "this way" sends them back to a card that says something else while quietly teaching a sense they
  have never met. If a card's own gloss will not support the point you want to make, drop the point.
- Do not invent facts; if unsure, leave the card out.

## Output Format

Return ONLY JSON: `{"notes":[{"id":"…","note":"…"}, …]}`

## Cards

```json
{{CARDS_JSON}}
```

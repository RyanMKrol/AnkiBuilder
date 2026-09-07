<!--
  The rules EVERY pass that writes, edits or deletes a card has to hold.

  This file is included verbatim into those prompts, at their {{CARD_RULES}} marker, by
  src/util/cardRules.js. Do not read it as the full rulebook: that is
  .claude/skills/build-anki-deck/references/card-authoring-rules.md, and it is five hundred lines
  because most of its rules concern one pass. What is here is the cross-pass subset, and each line
  is here because a pass that did not know it undid the work of a pass that did.

  Keep it SHORT. It is prepended to every card-writing prompt, so a paragraph added here is a
  paragraph added to a dozen calls, and a long list of rules is a list a model skims.

  Keep it LANGUAGE-NEUTRAL. It reaches the prompts for every language this pipeline builds, including
  the romanization prompt, which is generic and which a test holds to containing no Japanese. An
  example in one script is a rule that reads as being about that script. Describe the shape instead.
-->

## Rules every pass shares

These hold no matter which pass you are. They exist because a pass that did not know one of them
silently undid another pass's correct work.

**An irregular or exceptional form is never optional and never redundant.** If the source marks
something as irregular, an exception, or as the form that breaks the rule it just taught, it earns a
card and it keeps that card. Do not sample it away as one of several similar cells, and do not remove
it as a repeat of a pattern already covered: an irregular form is by definition the one a learner
cannot derive, which is exactly why it looks like a duplicate of the regular ones and exactly why it
is not. Watch for _but_, _except_, _instead_, _irregular_ and _does not take_.

**Only vocabulary and grammar the learner has already met.** A card may use only what this chapter or
an earlier one teaches. Where topical fit and this rule disagree, this rule wins.

**Never card a schematic pattern.** A frame with a slot in it, written with a placeholder or a
bracketed part of speech rather than a real word, is not a card. Card a complete, concrete instance
of the pattern instead.

**English reads as natural sentence-case English.** Not a lowercased clip, not a dictionary stub.
Capitalize it as you would write it in a sentence.

**Display text is what the learner sees, and carries nothing editorial.** No spacing a textbook
added to separate parts of a word, and no sentence-final punctuation the language does not print on
a card. Pronunciation and TTS text are separate fields with their own rules, and neither is ever
rendered on a card.

**A note must never restate the card.** A note that repeats the gloss or the target teaches nothing
and costs the learner a line to read. If there is nothing to add, add nothing.

**When you cannot tell, say so rather than guessing.** Every pass here has a way to flag an item as
uncertain, and an item flagged for a human is worth more than a confident wrong answer, because the
review is the one place a wrong answer still gets caught.

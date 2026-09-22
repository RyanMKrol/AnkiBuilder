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

## CRITICAL — these have each been broken, and each cost real cards

Every rule in this file matters. These five are first because each one has already reached a shipped
deck, and the incident is named so you can tell this is a report rather than a preference. If you are
about to drop, merge or skip something, check this list before you do.

**Every cell of a paradigm the source lays out earns its own card.** When the source presents one
form varying over a closed set of slots -- a grid, a table, or a run of examples it tells the learner
to memorize -- each filled cell is a card, not just the first one and not just the citation form.
Regularity is not a reason to drop a cell: a learner who has not yet internalised the rule cannot
produce the other cells from the one you kept, and the source printing all of them is the source
saying so. _Lesson 17 shipped 19 of its 20 conjugation cells only because a second reader recovered
them; Lesson 15 reached its review with 7 of 10 cells uncarded._

**An irregular or exceptional form is never optional and never redundant.** The sharpest case of the
rule above, and the one most often lost. If the source marks something as irregular, an exception, or
as the form that breaks the rule it just taught, it earns a card and it keeps that card. Do not
sample it away as one of several similar cells, and do not remove it as a repeat of a pattern already
covered: an irregular form is by definition the one a learner cannot derive, which is exactly why it
looks like a duplicate of the regular ones and exactly why it is not. Watch for _but_, _except_,
_instead_, _irregular_ and _does not take_.

**Only vocabulary and grammar the learner has already met.** A card may use only what this chapter or
an earlier one teaches. Where topical fit and this rule disagree, this rule wins.

**A proper name is not a card.** The name of a person, a business, a school, a shop or a club --
and above all one the source invented to populate an exercise -- teaches the learner nothing about
the language. Card the common noun the source teaches instead (hotel, school, park), and let the
name do its job inside a sentence, which is where the source put it. Real places a learner meets
outside the book, countries and cities, are ordinary vocabulary and do count. _Five invented business
names reached a human review as vocabulary cards before anyone noticed._

**A word the source prints with an optional part is ONE entry.** Where a source writes a word with
part of it in brackets, the brackets are the source saying the short and the full form are the same
entry: card it once, written the way the source writes it. Do not split it into a bare card and a
full card, and do not add either form as a "missing" item. If a source really does teach the two
forms apart, it gives them their own rows, and then you follow the source. _One greeting row reached
a review gate as three cards, two of them authored to fill "gaps" that were the brackets being read
as two words._

**Never card a schematic pattern.** A frame with a slot in it, written with a placeholder or a
bracketed part of speech rather than a real word, is not a card. Card a complete, concrete instance
of the pattern instead. _A card carrying a bare placeholder reached a review gate in a chapter that
printed three concrete instances of that same pattern._

## The rest

These hold no matter which pass you are, and exist because a pass that did not know one silently
undid another pass's correct work.

**A label describing a table is not taught by it.** Column headers, row labels and the words a chart
uses to organise itself (`Present form`, `aff.`, `Verbs`) are not vocabulary, whether you are reading
the table as markup or as a picture. The entries are the cells.

**English reads as natural sentence-case English.** Not a lowercased clip, not a dictionary stub.
Capitalize it as you would write it in a sentence.

**Display text is what the learner sees, and carries nothing editorial.** No spacing a textbook
added to separate parts of a word, and no sentence-final punctuation the language does not print on
a card. Pronunciation and TTS text are separate fields with their own rules, and neither is ever
rendered on a card.

**When a source sorts inflected forms into classes, name the class in the note.** A note giving
only the change teaches one word; naming the class teaches the learner to inflect the next one
alone. Use the source's own class names, and never promote a form the source marks as an exception
into a class of its own.

**A note must never restate the card.** A note that repeats the gloss or the target teaches nothing
and costs the learner a line to read. If there is nothing to add, add nothing.

**When you cannot tell, say so rather than guessing.** Every pass here has a way to flag an item as
uncertain, and an item flagged for a human is worth more than a confident wrong answer, because the
review is the one place a wrong answer still gets caught.

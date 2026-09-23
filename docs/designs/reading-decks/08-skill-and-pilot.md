# 08 The skill, and the Genki pilot

Depends on: 01 to 07. Status: not built.

## The skill

`.claude/skills/build-reading-deck/SKILL.md`, separate from `build-anki-deck` because the procedure is
different enough that branching one document would make both harder to follow. It is normative for
the reading procedure the way `build-anki-deck` is for speaking.

0. **Which book.** Any registered book. A book not yet registered goes through `onboard-epub` first,
   and through `convert-book` before that if it needs converting. For a converted book, use the
   `everything` conversion (03), so the deck misses nothing the book teaches.
1. **Register the reading collection** for that book. This creates `<slug>-reading` with
   `deckKind: "reading"` (01).
2. **Extract a chapter** with `scripts/build-reading.mjs` (06). `--dry` first.
3. **Gate 1, content.** The owner reviews the chapter in the dashboard, which previews the one card
   face per item. Kanji cards are shown as such.
4. **Audio, then Gate 2.** Generated for word and phrase cards only (05), reviewed as the speaking
   decks' audio is.
5. **Build and preflight** (07).
6. **Deliver.** A human step, as always. The first delivery creates the note type (02).

There is no extras phase, no learning pass and no final review pass in the first version. The skill
says so, so an operator used to `build-anki-deck` does not look for them.

The other skills learn about it in the same commit: `build-anki-deck` names it where a reading
collection is refused, `convert-book` says which deck skill consumes which purpose, and CLAUDE.md's
orientation lists it.

## The pilot

1. **Convert Genki for everything** with `convert-book`. The owner reviews the selection. Only the
   reading and writing half is new transcription (03).
2. **Onboard** the converted book, and register its reading collection.
3. **Build two chapters end to end**, reviewed by the owner at both gates:
   - **Greetings**: kana set phrases and nothing else. Proves kana cards, the phrase rule and audio.
   - **The first kanji lesson** (Reading and Writing 3): kanji cards with no audio, example words
     with readings and audio, and dedup against the vocabulary tables of earlier chapters.
4. **Import into a scratch Anki profile** and look at the cards before any live delivery.
5. **Review the session** (golden rule 5a) and put what it teaches into the rules, prompts and checks
   before building further chapters.

Delivery to the live collection is the owner's step, after the pilot is signed off.

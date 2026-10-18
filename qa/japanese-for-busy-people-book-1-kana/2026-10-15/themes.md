# Themes: Japanese for Busy People Book 1 (Kana), QA run 2026-10-15

Source: `findings.jsonl` (579 findings: 481 CONFIRMED, 43 PLAUSIBLE, 55 REJECTED) and the 54
narratives under `units/`. The 524 non-rejected findings (2 blocker, 196 should-fix, 326 polish)
are each assigned to exactly one of the 14 themes below, so the theme counts sum to 524. Counts
were produced by script from the file, not estimated. Chapters are named by their base unit key
(`chapter-8` covers `chapter-8-extras` too); there are 27 chapters and 3,570 cards. One finding is
present twice in the file under two ids that differ only by a `#chapter-15` suffix
(`chapter-15-extras/nihongo-no-anime-ga-wakaru-no-wa-tanoshii/untaught-prerequisite/1`); it is
counted twice here because the file counts it twice, and a fixer should treat it as one.

## 1. The deck in one paragraph

This is a deck a beginner can actually learn from, and both roles said so chapter after chapter.
The Reader found every chapter a close rendering of the book: every vocabulary entry, every cell of
every conjugation table, every key sentence and nearly every dialogue line is carded with the book's
kana, correct long vowels and the book's own English, and the exclusions it checked were sound. The
Learner found the hard ideas taught well and taught from several sides: いきます against きます by the
speaker's position (Lesson 6), the two jobs of に (Lessons 7 and 9), the give and receive mirror pairs
(Lesson 14), the dictionary-form drill with its trap verbs flagged (Lesson 15), the て-form drill
grouped by sound change (Lesson 18), the three kinds of "know" (Lesson 24), and the た-form rules one
per card (Casual Style 2). Short replies almost always carry a scene naming the question they answer,
minimal pairs change one thing at a time, and the notes that contrast two confusable words (すずしい
and かっこいい, ちかい and ちかく, まで and までに, しっています and わかります) are the best thing in the
deck. The weaknesses are not in what is carded but in the surface around it. Production fronts
often fit two answers the learner has been taught, because a lesson introduces two ways to say one
thing and the front never picks. Notes were written by someone looking at the book and the build
(they cite GRAMMAR 2, "Member 3 of the set", "the card below") rather than at a shuffled card. And
a steady trickle of notes state a rule as absolute that another card in the same deck contradicts,
twice badly enough to count as a blocker. Lesson 9 (`chapter-9`, 42 findings) and Casual Style 1
(`chapter-25`, 33 findings on only 71 cards) carry the most; chapter 0 (8) the fewest, with Lesson 17,
Lesson 22 and Casual Style 2 at 9 each.

## 2. Themes

Ranked by the number of CONFIRMED plus PLAUSIBLE findings each explains.

### Theme 1. The front does not pick the form

**112 findings** (105 confirmed, 7 plausible; 72 should-fix, 40 polish) across **26 chapters**, every
chapter but `chapter-1`.

A lesson teaches two ways to say one thing, the deck cards both, and the English on the Production
front fits either. The learner knows both forms, gives the one the card did not want, and marks
themself wrong. The pairs recur: をください and をおねがいします (Lessons 4 and 9), なんで and どうやって
(Lesson 7), に and へ (Lesson 6), にあります and the contracted です (Lesson 13, where about twenty
location cards are "a coin toss on Production"), って and は (Lesson 12 and Casual Style 1), ね and
よね (Lesson 24), ます and ています for habits (Lesson 23), きいろい and きいろの, the plain and the
honorific お form (おなまえ, おのみもの), and in Casual Style 1 the pronoun set ぼく, おれ and あたし,
where the speaker cue says "(male speaker)" and both male pronouns fit. The same theme covers fronts
that give no cue for a dropped word or a particle the card exists to drill: the three へ sentences
that never ask for へ, the よろしい cards that いい answers equally well, the "your" that makes the
learner reach for あなた. The deck already knows the fix: the one ください/おねがいします pair that carries
hints (`kohi-o-kudasai` / `kohi-o-onegaishimasu`) and the に/へ pair `he-eki-ni-ikimasu` /
`he-eki-e-ikimasu` were praised by the Learner as the pattern that works.

Examples: `chapter-13/-/missing-info/1`, `chapter-7/nande-ikimasuka/unanswerable/1`,
`chapter-4-extras/-/unanswerable/1`, `chapter-25-extras/ore-3/unanswerable/1`,
`chapter-23-extras/kato-guitar-weekly/ambiguous/1`.

The attack. This is one rule, not 112 edits: when a lesson introduces a form that competes with a
form the learner already has for the same English, every card drilling the new form carries a hint
or scene that names what picks it, and the English convention (if there is one, as "I'd like X,
please" for おねがいします) is stated once and followed everywhere. Put the rule in
`docs/card-rules-shared.md` next to the collision rule, so every card-writing pass inherits it, and
have the passes that produce paradigm sets (`docs/example-sentence-miner-prompt.md`,
`docs/exercise-miner-prompt.md`, `docs/gap-author-prompt.md`) apply it when they emit a form pair.
Then make it a check: `src/audit/checks/cardQuality.js` (or a new tier) should flag two shipping
cards in one collection whose Production text, hint and scene are identical or whose English differs
only by a parenthesis, which is what `nannin` / `v-nannin-desu-ka` and the four `yone-*` cards look
like. The sweep itself: per chapter, list the form pairs this lesson introduces, grep every card
using either form, and add the discriminating hint to both sides.

### Theme 2. Notes written for the builder, not the learner

**67 findings** (65 confirmed, 2 plausible; 1 should-fix, 66 polish) across **24 chapters**.

The note on the back cites something the learner cannot see: a book section ("GRAMMAR 2", "NOTES 2",
"Key Sentence 1", "the source", "the chart", "the picture"), the card's place in an authoring set
("Member 3 of the 8,000えん set", "the first of four cards", "Completes the かさ set"), a sibling by
position ("the card below", "directly above", "the previous card", "the next three cards"), a card by
a title that does not ship, an internal card id, or how the deck was built ("already-used"). In a
shuffled review none of that resolves to anything, and in several cases the citation is the whole
note. It is harmless to meaning, which is why 66 of 67 are polish, but it is the most pervasive tell
that the notes were drafted with the chapter open rather than the card in hand, and the Learner
listed it as the one annoyance in otherwise clean chapters (Lessons 4, 6, 7, 13, 16).

Examples: `chapter-6-extras/-/other/1`, `chapter-6-extras/-/other/2`,
`chapter-4-extras/kore-wa-hassen-en-desu-ka/other/1`, `chapter-13-extras/-/other/1`,
`chapter-24-extras/nationality-vs-language-a/other/1`.

The attack. A deterministic sweep, then a check so it stays fixed. Grep every shipping note and hint
for `GRAMMAR \d`, `NOTES \d`, `Key Sentence`, `Word Power`, `Exercise`, `the source`, `the chart`,
`Member \d`, `the set`, `above`, `below`, `previous card`, `next card`, and a card id pattern; either
delete the clause or replace the pointer with the sibling's Japanese. Add that grep as a tier in
`src/audit/checks/noteClaims.js` (it already reads note text) so a new unit cannot ship one. The
rule for writers belongs in `docs/card-rules-shared.md`: a note may name another card only by its
Japanese or its English, never by position, set membership or book section, because the learner
meets the card alone.

### Theme 3. Notes whose grammar claim is wrong or contradicts another card

**61 findings** (59 confirmed, 2 plausible; **1 blocker**, 33 should-fix, 27 polish) across
**22 chapters**.

A note states a rule as absolute and a card the learner already holds contradicts it. "Those four
and no others" are the い-adjective colours, but the ledger has ちゃいろい and きいろい
(`chapter-14-extras/eg-kuroi-beruto/wrong-content/1`, blocker). まえに "always follows the dictionary
form", on fifteen notes across two units, while the same units card noun + のまえに. A place before の
"never" marks possession; a station name is "never" joined with の; "only 3 voices かい" when the deck
taught なんがい; つま and かない are "two readings of the same word" on six cards while the かない card
calls it a different word; らいねん "breaks" the せん／こん／らい pattern when it is the regular member;
every date from the 11th is regular when the book prints three exceptions. Smaller members are plain
errors (two に counted as three, a substitution described backwards, a wrong lesson number) and
authored Japanese that is itself wrong (わたしはとうきょうにすみます glossed as a present state;
ごじのまえに). To a learner who trusts the deck, each of these is a rule to unlearn later, and the
blocker here teaches something false outright.

Examples: `chapter-14-extras/eg-kuroi-beruto/wrong-content/1`, `chapter-17-extras/-/wrong-content/1`,
`chapter-9/tsuma-wife/wrong-content/1`, `chapter-6/kyonen/wrong-content/1`,
`chapter-17-extras/sumimasu-1/wrong-content/1`.

The attack. Two things. First, a writing rule in `docs/card-rules-shared.md`: a note never says
"always", "never", "only", "no others" or "the one" about a form unless the book says it, and a note
that compares the card to another word checks the ledger entry for that word before describing it.
Second, a check: `src/audit/checks/noteClaims.js` should flag the absolute words, and the
cross-lesson pass (`docs/cross-lesson-note-prompt.md`) should be told that its job includes reading
the ledger card for any word a note names, since that pass is the one with both in view. For the
backlog, sweep by grepping notes for the absolute words and for "also read", and fix the fifteen
まえに notes and six spouse notes as two edits, not twenty-one.

### Theme 4. The English already belongs to an earlier word

**48 findings** (36 confirmed, 12 plausible; 25 should-fix, 23 polish) across **19 chapters**.

A new word arrives with an English gloss that an earlier card already owns, and nothing on the front
says which is wanted. "Reception desk" is うけつけ from Lesson 1, so フロント is unanswerable; "Which"
is どれ, so どの loses; "Next" is こんど, so つぎ loses; "Documents" is しりょう, so しょるい and four
sentence cards built on it collide; "Package" is パッケージ (Lesson 18) when にもつ arrives in Lesson 19;
"my phone" makes a learner who was told スマホ is specific say けいたい; "Really" was taught as ほんとうに,
so three とても sentences glossed "really" are marked wrong. The gloss is usually the book's and is
faithful, which is why so many are PLAUSIBLE; the problem is that the deck is studied as one shuffled
whole and the book is not. This differs from Theme 1 in that nothing grammatical is at stake, only
which word the English points at, and the fix is usually a two-word change to the gloss ("Front desk
(at a hotel)", "Mail (postal)", "materials" for しりょう everywhere).

Examples: `chapter-3/furonto/ambiguous/1`, `chapter-6/dono/ambiguous/1`,
`chapter-19/shorui/ambiguous/1`, `chapter-19/nimotsu/ambiguous/1`,
`chapter-11/fib-totemo-yokatta-desu-concert/ambiguous/1`.

The attack. The collision check today compares exact glosses. Extend it (`src/audit/checks/vocab.js`
or `cardQuality.js`) to compare the Production front's English after lowercasing, stripping
parentheses and splitting on commas, so "Restaurant, shop" and "Restaurant" collide and "Watch" meets
"Watch" from うでどけい, and have it look across the whole collection, not the unit. Where the check
fires, the writer narrows the newer gloss or adds a hint. The convention that a deck-wide English
word maps to one Japanese word (really: ほんとうに, very: とても; documents: しょるい, materials: しりょう)
should be written down once in the collection's `conventions.md` under `.anki-builder/`, where the
translate passes (`docs/translate-prompts.md`) can read it.

### Theme 5. Grammar shown on cards, explained on none

**38 findings** (35 confirmed, 3 plausible; 12 should-fix, 26 polish) across **19 chapters**.

The book states a rule, a dozen cards exhibit it, and no card's back says it. The place に thing が
number あります order (Lesson 13), the object of わかります taking が (Lesson 24), a length of time
taking no particle before かかります (Lesson 20), the second use of ています for repeated action over a
period (Lesson 23, which is also why Theme 1's four "takes lessons every week" cards fail), the book's
caveat that たい is for the speaker's own wish and rude as a question to a superior (Lesson 17), the
casual rule that the present affirmative is the dictionary form (Casual Style 1). Also here: a part
of a phrase that appears with no gloss (ちがいます in Lesson 1, おさきに in chapter 0, the ぷん after
さん and よん, the さん of ふじさん, the に of おみやげに). Half the rule is sometimes present and the
other half missing, as on `kakarimasu-2`. The Reader raised most of these; the learner feels them
as rules they could only infer.

Examples: `chapter-13/ks1-chairs/book-gap/1`, `chapter-23/naratte-imasu-taking-lessons/book-gap/1`,
`chapter-17-extras/-/book-gap/1`, `chapter-24-extras/ex9-smith-understands-japanese/book-gap/1`,
`chapter-3/fun-pun-suffix/missing-info/1`.

The attack. The coverage adversary (`docs/coverage-adversary-prompt.md`) checks that each thing the
chapter teaches has a card; it should also check that each GRAMMAR point and each NOTE has a card
whose note states it, not only a card that exhibits it, and name the key-sentence card the note
belongs on. For the backlog, each finding names its host card and the sentence to add; they are
one-line note edits, best done per chapter alongside Theme 3's sweep since both touch the same
backs.

### Theme 6. English that drifts from the target or the book

**38 findings** (33 confirmed, 5 plausible; 11 should-fix, 27 polish) across **16 chapters**.

The English on a card does not say what the Japanese says, or says it in a way that points the
learner at a different sentence. からです rendered "at" so から is lost (two Lesson 3 answer cards);
"Then" with no じゃ in the target; "his" for a character the book draws as a woman (three cards); the
listener made hungry, thirsty and tired in three Lesson 16 invitations where the book has the speaker;
"Let's see" for みましょう; "England" where the book and the Lesson 1 card say United Kingdom; an
invitation glossed as a question about plans; two Lesson 2 fragments ending in は that the book never
prints; "Won't you go" for a ない-form invitation. Three members are target problems rather than
English (らじゃ in hiragana, 10ほん for the book's 10ぽん, Key Sentence 3 shipped in the contracted form
the book does not print) and need audio regenerated. None of these is a theme of one pass; they are
the residue the translate and review passes let through.

Examples: `chapter-3/fib-c3-presentation-a/book-mismatch/1`,
`chapter-16-extras/x16c-onaka-ne-tabemasenka/book-mismatch/1`, `chapter-9/ask-phone-number/book-mismatch/1`,
`chapter-13/ks3-taxi-stand/book-mismatch/1`, `chapter-12/fib-raja-uchi-indo-doko-desuka/book-mismatch/1`.

The attack. Mostly card by card, and short; the fix text is in each finding. Two rules are worth
writing down in `docs/card-rules-shared.md` so they stop recurring: the English of an answer card
keeps every particle the target has a word for (から is "from", not "at"), and a character's gender
follows the book's drawings (Nakamura, Chan and Emma are women). The hiragana-name and 10ほん cases
are catchable: a check in `src/audit/checks/romanization.js` or `vocab.js` that a name written in
katakana anywhere in the collection is never written in hiragana elsewhere, and that a counter after
a sound-changing number matches the deck's own counter cards.

### Theme 7. The hint is the answer

**31 findings** (27 confirmed, 4 plausible; 8 should-fix, 23 polish) across **14 chapters**.

Two shapes. On Recognition, the hint is an English paraphrase of the meaning the face asks for
("a particle meaning until", "the suffix for language", "describes parking"), so the learner reads the
answer instead of recalling it; Lesson 19 alone has six of these on its new verbs and particles. On
Production, the hint prints the Japanese answer in kana and romaji (なんじ on the なん card, いきます with
the formation rule on いきたいです, グラス on the glass card, the spouse word on each of four spouse
sentences), so the card tests copying. The verifiers were careful here: eight similar reports were
rejected because the scene was a mandated collision cue whose small leak the rules accept, and those
are discussed in section 5. The 31 that stand are hints that could cue the sense without defining it,
or that belong on one face only.

Examples: `chapter-3/made-particle/leaks-answer/1`, `chapter-8/nani/leaks-answer/1`,
`chapter-17/ikitai-desu/leaks-answer/1`, `chapter-19/tomemasu/leaks-answer/1`,
`chapter-9-extras/v9-kanai-wa-kaimono/leaks-answer/1`.

The attack. The rule exists (a hint may not restate the answer) but it is applied to one face at a
time while a `hint` renders on both. Two mechanical checks in `src/audit/checks/cardQuality.js`: a
Production hint or scene must not contain the target string (or its romaji) and a Recognition hint
must not contain a word of the English gloss. Where a cue is needed on one face only, the writer uses
the field that face shows, and `docs/card-rules-shared.md` should say which fields render where,
because several findings show writers did not know a `scene` appears on both faces.

### Theme 8. Register and usage claims the book does not make

**27 findings** (25 confirmed, 2 plausible; 4 should-fix, 23 polish) across **18 chapters**.

A note or hint adds a judgement about register or usage that the book does not support and the
learner cannot check: こんにちは is "neutral" (the book says rather informal); さようなら is "fairly
formal" and not for people you will see again (the book's panel says otherwise); ください is "the
blunter" request; どういたしまして is "a little stiff"; ざんねんですが is "softer than" すみません; いや is
"stronger than" だめ; ほうこくします is spoken and to a superior; またこんど is the invitee's line when the
book has the inviter say it; a false etymology (Kamakura as capital); a pitch claim (にほん "identical
in sound"). Some are probably true of Japanese and still do not belong, because a finding never says
the book is wrong and the learner has no way to weigh them. Each is one sentence to cut.

Examples: `chapter-0/sayounara/book-mismatch/1`, `chapter-0/konnichiwa/book-mismatch/1`,
`chapter-16/mata-kondo/book-mismatch/1`, `chapter-11/dou-itashimashite/note-unverifiable/1`,
`chapter-4-extras/kohi-o-kudasai/note-unverifiable/1`.

The attack. A rule in `docs/card-rules-shared.md`: a note states register only in the book's words
or not at all, and a comparative ("softer", "stiffer", "stronger", "blunter", "more traditional") is
allowed only when the book makes the comparison. `src/audit/checks/noteClaims.js` can flag the
comparatives for review. The book-faithful rewording is in each finding's `fix`.

### Theme 9. Romaji, punctuation and other surface drift

**27 findings** (26 confirmed, 1 plausible; 27 polish) across **11 chapters**.

The same word is romanized two ways: `iie` beside `īe`, doubled vowels (`yuumei`, `mafuraa`,
`teemapaaku`, `shaapupenshiru`, `chou`) where the deck's pinned style is macrons, `doitsu jin` split
where every nationality card runs `jin` on, `happon` beside `ip-pon` and `rop-pon`, `nebō shimasu`
one word on the base cards and two in the extras, `uun` beside `ūn`, one casing for place names in
the base unit and another in the extras. Also here: a kanji せんせい in a kana-only deck, a
full-width ？ after か on two targets the book never writes, and two Production fronts that print the
same disambiguator twice. All polish, but the Learner's point stands: when the "Says" line spells one
word two ways it looks like a distinction being taught.

Examples: `chapter-1-extras/irl-l1-26/other/1`, `chapter-12/fib-cashew-nuts-yuumei/wrong-content/1`,
`chapter-5/counter-hon-8/other/1`, `chapter-25-extras/-/other/1`, `chapter-13/-/other/2`.

The attack. `src/audit/checks/romanization.js` already exists; the gap is that it checks each card's
romaji against its own target, not against the deck. Add a cross-card pass: for each kana word that
appears on more than one card, the romaji token must be identical, and doubled vowels `aa ii uu ee
oo ou` are flagged where the collection's convention is macrons. The note romaji (not just the
`pronunciation` field) needs the same check, since `gochisousama` in a note sits beside `gochisōsama`
on the card. A full-width `？` in a target is a one-line check.

### Theme 10. Untaught words and structures in authored sentences

**26 findings** (26 confirmed; 14 should-fix, 12 polish) across **12 chapters**.

An aiSuggested sentence uses a word or a structure the learner has not met. Lesson 9's extras have
four sentences on おきます and ねます, verbs first carded in Lessons 21 and 17, and two on どう, which
their own note says is Lesson 11's; Lesson 2 needs ホテル, Lesson 5 needs くつした and a シャツ the book
never teaches, Lesson 17 needs みてください before the て-form exists, Lesson 20 needs ひ meaning "day"
when the only ひ taught means "fire"; Lesson 15 has two sentences built on a verb clause modifying a
noun (ははがくれるおかし, にあうふく) and one on a のは frame, none of which the chapter teaches. Casual Style 1 uses わからない and いかない
before Lesson 22 teaches the ない-form; that one reflects book order (the chapter sits after Lesson 17)
and the Verifier left the ruling to the owner: add a one-line note, or accept that the casual
chapters assume Lesson 22. Also here, new words inside a sentence with no note (かじ, でんわします
without を), and a base card that uses きのう before its card ships.

Examples: `chapter-9-extras/p102-hachiji-ni-okimasu/untaught-prerequisite/1`,
`chapter-15-extras/haha-ga-kureru-okashi-ga-suki/untaught-prerequisite/1`,
`chapter-20-extras/yasumi-ni-nebou-suru-no-ga-suki/untaught-prerequisite/1`,
`chapter-25-extras/saa-1/untaught-prerequisite/1`, `chapter-2-extras/irl-l1-42/untaught-prerequisite/1`.

The attack. The rule is already in `docs/card-rules-shared.md` (an authored sentence uses taught
words or glosses the new one in its note), so this is a check that did not exist or did not fire:
`src/audit/checks/taughtNeverUsed.js` looks the wrong way round. A companion check should tokenise
each aiSuggested target against `taught-index.json` up to that unit's position in **book order**
(not build order; the Casual Style units are the case that shows the difference) and flag a content
word with no earlier card and no gloss in the note. Structures cannot be tokenised, so the
sentence-authoring prompts (`docs/example-sentence-miner-prompt.md`,
`docs/inventive-author-prompt.md`, `docs/gap-author-prompt.md`) should say in one line that a
sentence uses only the grammar frames the chapter or an earlier one teaches, with the Lesson 15
relative clause as the example.

### Theme 11. Grammar labels the deck never taught, or that are false

**17 findings** (17 confirmed; **1 blocker**, 5 should-fix, 11 polish) across **12 chapters**.

Notes label forms with words the learner has never been given, and sometimes with the wrong word.
まちます is called the "plain/dictionary form" (blocker: `chapter-10/machimasu/wrong-content/1`,
repeated on `matte-kudasai`), あるきます is the "dictionary/plain form", きれいでした, たいへんでした and
たのしかったです are each the "plain past form"; all are polite forms, and the learner has never seen a
plain one. A "plain form" hint sits on a noun. The verb groups are named five ways across the deck:
Regular 1 and 2 (Lesson 15, which the Learner accepted), R1 and R2, Regular I and II, "ru-verb", and
once "the one cell the book stars". A "まし past-tense pattern" is not a form; から is called a suffix;
chapter 0 explains ちょっとまってください with a て-form the learner meets in Lesson 18.

Examples: `chapter-10/machimasu/wrong-content/1`, `chapter-11/kirei-deshita/wrong-content/1`,
`chapter-22/-/other/1`, `chapter-21/akemasu/other/1`, `chapter-12/sobaya-soba-shop/other/1`.

The attack. Fix the glossary once: `docs/card-rules-shared.md` names the terms a note may use
(ます form, dictionary form, て-form, ない-form, Regular 1, Regular 2, Irregular) and says "plain" is
not one of them until a chapter teaches it. Then grep every note for `plain`, `R1`, `R2`,
`Regular I`, `ru-verb`, `u-verb` and normalise. The blocker and its echo on `matte-kudasai` are a
two-note edit to do first.

### Theme 12. Book items with no card

**14 findings** (13 confirmed, 1 plausible; 6 should-fix, 8 polish) across **9 chapters**.

Things the book prints that the deck never cards: the alternate number readings (れい, し, しち, く and
the second readings of 14, 17, 19, 24, 27, 29), three rows of the large-number chart (じゅうまん,
ひゃくまん, せんまん), どうもありがとうございます, しろワイン, だれも with a negative, いいです as a table
cell, 9 of the 20 conjugation cells Lesson 9 tells the learner to memorise, あしたやすんでもいいですか
from Exercise II, and several Lesson 23 Speaking Practice lines. Each is a card to author from the
book's own line, so a fixer can batch them per chapter.

Examples: `chapter-2/-/book-gap/1`, `chapter-4/-/book-gap/1`, `chapter-9/-/book-gap/2`,
`chapter-5/-/book-gap/3`, `chapter-23-extras/-/book-gap/2`.

The attack. These are gaps the coverage adversary should have caught; the pattern in the misses is
tables (number alternates, chart rows, conjugation cells) rather than running text, so
`docs/coverage-adversary-prompt.md` and `docs/table-specialist-prompt.md` should be told that every
cell and every alternate reading in a table is an item to cover or to exclude with a reason.

### Theme 13. Duplicates and exclusion bookkeeping

**14 findings** (11 confirmed, 3 plausible; 3 should-fix, 11 polish) across **8 chapters**.

Two cards for one thing (`5th-floor` and the base ５かい, `1st-floor` and １かい, the Lesson 7 bus
sentence that repeats a Lesson 6 one verbatim, `kakimasu-l19` repeating Lesson 17's かきます, the
absorbed course card すごい "Amazing!" beside the book's すごい "That's great!"), and exclusions whose
reason is false or missing: あさごはん and ばんごはん excluded in Lesson 3 as duplicates of Lesson 8,
which comes later, so the learner uses both words five lessons before their card; `hoteru` and
`a-interjection` excluded with no `excludedReason`; `mousugu-kaigi-hajimemasu` excluded because
はじめます is "untaught" when it is a Lesson 17 card; a card whose reviewNote says it was excluded but
which ships. The Verifier separately rejected a report on five Lesson 17 cards that repeat earlier
words with `repeatOf` set, which is the sanctioned mechanism; the question of whether knowing repeats are worth their reviews
is for the owner, not a card defect.

Examples: `chapter-5-extras/1st-floor/ambiguous/1`, `chapter-3-extras/asagohan/other/1`,
`chapter-15-extras/amazing/ambiguous/1`, `chapter-7/hoteru/book-gap/1`,
`chapter-23-extras/mousugu-kaigi-hajimemasu/other/1`.

The attack. The backward dedup pass (`docs/backward-deduplicator-prompt.md`) compares against earlier
units in build order; the Lesson 3 / Lesson 8 case shows it must use book order, and that when it finds
the duplicate in a later unit, the later card is the one to exclude. `src/audit/checks/library.js` or
`state.js` should refuse an `excluded: true` with no `excludedReason`, and should flag a target string
that ships twice in one collection (the floor cards differ only in digit versus kana).

### Theme 14. Proper names carded as vocabulary

**4 findings** (3 confirmed, 1 plausible; 2 should-fix, 2 polish) across **2 chapters**.

とうきょうタワー, えびすえき and ぎんざどおり ship as word cards in Lesson 19, and an authored Lesson 9
sentence makes レストランローマ the answer. `docs/card-rules-shared.md` already says a name is not a card
and does its job inside the sentence where the book put it. Small, but the same rule produced six
rejected findings (section 5), so it is worth stating precisely once.

Examples: `chapter-19/tokyo-tower/other/1`, `chapter-19/ebisu-eki/other/1`,
`chapter-19/ginza-dori/other/1`, `chapter-9-extras/v9-resutoran-roma-no-basho/other/1`.

The attack. Exclude the three word cards and rebuild the Lesson 9 sentence on a common noun. Add to
the rule in `docs/card-rules-shared.md` the two clarifications the run exposed: a name inside a
book sentence is fine, and a named facility (tower, station, street) is a name even when the book
lists it as vocabulary. A check in `src/audit/checks/vocab.js` can flag a word-card target that is
katakana plus a place suffix (タワー, えき, どおり, デパート) with a `fromTable` or vocabulary provenance.

## 3. Chapter table

Findings are non-rejected, as blocker/should-fix/polish. "Strongest" and "weakest" are the two
roles' own words condensed.

| Chapter    | Label                           | Cards | Findings     | Strongest                                                                 | Weakest                                                                                              |
| ---------- | ------------------------------- | ----: | ------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| chapter-0  | Frequently Used Expressions     |    18 | 8 (0/4/4)    | Good-bye cluster: four same-English fronts each cued cleanly              | Register notes beyond the book (さようなら, こんにちは)                                              |
| chapter-1  | Lesson 1: Meeting               |   122 | 27 (0/3/24)  | Country vs nationality and さん taught by contrast; complete rendering    | Romaji drift (`doitsu jin`, `iie`), builder citations                                                |
| chapter-2  | Lesson 2: Possession            |   120 | 17 (0/8/9)   | Minimal pairs changing one thing; homophones (さん, うでどけい) explained | Two は fragments the book never prints; "your" cues missing                                          |
| chapter-3  | Lesson 3: Asking the Time       |   179 | 23 (0/5/18)  | Irregular hour and minute notes; から/まで pairs                          | からです glossed "at"; そうですか intonation note wrong                                              |
| chapter-4  | Lesson 4: Shopping (1)          |   142 | 23 (0/5/18)  | Distance kept clear on every English; number sound changes                | ください/おねがいします unpicked; "Member n of the set" notes                                        |
| chapter-5  | Lesson 5: Shopping (2)          |   184 | 30 (0/11/19) | Counter drill clean; この/その/あの explained                             | Notes contradicting the lesson's own rules (はっぽん omitted, つ "round", それ)                      |
| chapter-6  | Lesson 6: Going Places (1)      |   153 | 19 (0/5/14)  | いきます/きます from every speaker's position; に/へ pair with hints      | Three へ sentences never ask for へ; らいねん note wrong                                             |
| chapter-7  | Lesson 7: Going Places (2)      |   185 | 25 (0/10/15) | Two jobs of に in one sentence; irregular date notes                      | なんで/どうやって unpicked on six fronts; "every date regular" note                                  |
| chapter-8  | Lesson 8: Doing Things (1)      |   166 | 12 (0/3/9)   | Particle contrast notes; bare count vs reply hints                        | なに card leaks and its なんの derivation is false                                                   |
| chapter-9  | Lesson 9: Doing Things (2)      |   172 | 42 (0/19/23) | Target に minimal pairs; family vocabulary never collides                 | Spouse notes ("also read") on six cards; おきます/ねます/どう untaught; hints print the answer       |
| chapter-10 | Lesson 10: Describing Things    |   145 | 14 (1/3/10)  | い/な split on every back; よくない explained twice                       | まちます called the dictionary form (blocker)                                                        |
| chapter-11 | Lesson 11: Impressions          |   133 | 16 (0/8/8)   | Two よかったです cards kept apart; つまらない warnings                    | "plain past form" on four notes; "really" for とても                                                 |
| chapter-12 | Lesson 12: Asking about Places  |   141 | 16 (0/6/10)  | あります/います and や/と cued on the front                               | って and よ cards never ask for them; らじゃ in hiragana                                             |
| chapter-13 | Lesson 13: Asking for a Place   |   139 | 17 (0/11/6)  | ここ/そこ/あそこ scissors triple; ちかい/ちかく split                     | Twenty location cards: にあります or です is a coin toss                                             |
| chapter-14 | Lesson 14: Giving and Receiving |   136 | 18 (1/4/13)  | Give/receive mirror pairs; くれます by contrast                           | Colour note "those four and no others" (blocker); マフラー = スカーフ                                |
| chapter-15 | Lesson 15: Preferences          |   133 | 22 (0/7/15)  | Dictionary-form drill with trap verbs flagged                             | Regular 1/2 never defined; untaught relative-clause sentences                                        |
| chapter-16 | Lesson 16: Invitations          |    99 | 22 (0/11/11) | Accept/decline scenes; two senses of あります                             | Three invitations put the hunger on the listener; またこんど wrong speaker                           |
| chapter-17 | Lesson 17: Stating a Wish       |   183 | 9 (0/7/2)    | たい grid tied to い-adjective endings                                    | まえに "always dictionary form" on seven notes; すみます sentence wrong                              |
| chapter-25 | Casual Style 1                  |    71 | 33 (0/17/16) | "casual style" hint on every front; いい irregular explained              | ぼく/おれ/あたし cues do not pick; って vs dropped は unpicked                                       |
| chapter-18 | Lesson 18: Explaining Plans     |   103 | 16 (0/6/10)  | て-form drill grouped by sound change                                     | よろしい cards answered by いい; あと vs あとで                                                      |
| chapter-19 | Lesson 19: Making a Request     |   156 | 29 (0/10/19) | まで/までに pair; さき/てまえ taxi drills                                 | Eight Recognition hints paraphrase the answer; しょるい/しりょう/にもつ collide; names as word cards |
| chapter-20 | Lesson 20: Going Places (3)     |   139 | 10 (0/4/6)   | Duration sound changes noted; day counts hinted against dates             | か/にち unanswerable; かかります note gives half the rule                                            |
| chapter-21 | Lesson 21: Asking Permission    |   135 | 16 (0/4/12)  | は tooth vs particle; dictionary-form notes consistent                    | Hints give the sense away; "bag", "phone", "documents" cue the wrong word                            |
| chapter-22 | Lesson 22: Forbidding Actions   |   122 | 9 (0/3/6)    | ない-form set consistent; かえらない and すわない traps called out        | Verb groups named two ways; ないでください register note missing                                     |
| chapter-23 | Lesson 23: Explaining Actions   |   125 | 22 (0/11/11) | ています/ていません pairs; three kinds of もう                            | Habitual ています never explained, so four "weekly lesson" fronts fail                               |
| chapter-24 | Lesson 24: Work and Interests   |   119 | 20 (0/8/12)  | Three kinds of "know" kept apart                                          | Four よね fronts answered by ね; すんでいます note contradicts Lesson 17                             |
| chapter-26 | Casual Style 2                  |    50 | 9 (0/3/6)    | た-form one rule per card; refusal scenes                                 | "Thanks" and "Well, it's a bit..." already owned by earlier cards                                    |

## 4. Single items worth doing first

Every finding belongs to a theme, but these twenty are worth doing on their own before any sweep:
the two blockers, cards whose Japanese or English is wrong rather than under-cued, and the handful
whose fix unlocks several other findings.

1. `chapter-10/machimasu/wrong-content/1` (blocker): まちます called the plain/dictionary form; fix with
   `chapter-10/matte-kudasai/wrong-content/1`, which repeats it.
2. `chapter-14-extras/eg-kuroi-beruto/wrong-content/1` (blocker): "those four and no others" when the
   learner holds ちゃいろい and きいろい.
3. `chapter-17-extras/sumimasu-1/wrong-content/1`: わたしはとうきょうにすみます glossed as a present state;
   fixing it also settles `chapter-24/sundeimasu/other/1`.
4. `chapter-17-extras/mae-time-go-home/wrong-content/1`: ごじのまえに, wrong Japanese stated as a rule.
5. `chapter-13/ks3-taxi-stand/book-mismatch/1`: Key Sentence 3 shipped in a form the book does not
   print; target and audio change.
6. `chapter-12/fib-raja-uchi-indo-doko-desuka/book-mismatch/1`: らじゃ in hiragana; target and audio.
7. `chapter-13/fib-fork-table-count-a/book-mismatch/1`: 10ほん for the book's 10ぽん; target and audio.
8. `chapter-14/mafuraa/book-mismatch/1`: narrowing the マフラー gloss clears
   `chapter-14/kuremasu-example/ambiguous/1` and `chapter-14-extras/x14-suteki-na-sukaafu-desune/ambiguous/1`.
9. `chapter-16/mata-kondo/book-mismatch/1`: the wrong speaker, so the card teaches the phrase for the
   wrong moment.
10. `chapter-3/sou-desu-ka/book-mismatch/1`: an intonation split the book does not make, on a phrase
    met in Lesson 3 and used for the rest of the deck.
11. `chapter-0/sayounara/book-mismatch/1`: a restriction the book's own panel contradicts, on card 1 of
    the deck.
12. `chapter-8/nani/wrong-content/1` with `chapter-8/nani/leaks-answer/1`: a false derivation and a
    leaking hint on one card; both roles caught it.
13. `chapter-1/o-prefix/wrong-content/1` with `chapter-1/o-prefix/untaught-prerequisite/1`: a false
    generalisation and a hint built on untaught words, on a Lesson 1 card.
14. `chapter-9/-/book-gap/2`: 9 of the 20 cells the book tells the learner to memorise have no card.
15. `chapter-9-extras/p102-hachiji-ni-okimasu/untaught-prerequisite/1` and its three siblings
    (`p102-mainichi-nanji-ni-okimasu-ka`, `p102-sakuban-nanji-ni-nemashita-ka`,
    `p102-juuniji-ni-nemashita`): two verbs with no card anywhere before Lessons 17 and 21.
16. `chapter-7/tsuitachi-1st/book-mismatch/1` with `chapter-7/nichi-suffix/book-mismatch/1`: "every
    date from the 11th is regular" against three irregular dates the same lesson teaches.
17. `chapter-6/kyonen/wrong-content/1`: らいねん called the exception when it is the regular member.
18. `chapter-15/kiku-listen-dict-form/wrong-content/1`: a false "only" and a Recognition answer that
    rejects a correct reading.
19. `chapter-2-extras/irl-l1-41/other/1` and `chapter-2-extras/irl-l1-42/other/1`: two fragments ending
    in は that the book never prints; exclude.
20. `chapter-7/nannichi/ambiguous/1`: "What day" is the natural English for なんようび; one word fixes a
    base card every date drill leans on.

## 5. What was rejected, and why it kept coming up

55 findings were rejected. They fall into six groups, and four of them are prompt problems the next
run can prevent.

**A required collision scene read as a free leak (8).** `chapter-0/itadakimasu/leaks-answer/1`,
`chapter-2/num-2/other/1`, `chapter-2/num-5/other/1`, `chapter-2/hon/other/1`,
`chapter-3/yasumi/leaks-answer/1`, `chapter-4/to-particle/leaks-answer/1`,
`chapter-4/de-particle/leaks-answer/1`, `chapter-21/hai-douzo-permission/leaks-answer/1`. The Learner
sees only earlier units, so a scene whose job is to separate this card from a later card with the
same target looks gratuitous. The rules name that small leak as the accepted price. Next run: give the
Learner the collection's shared-target index (which targets recur, and where), and say in
`qa/prompts/learner.md` that a scene on a shared target is mandated and is not a leak unless it
restates the English outright.

**Faithful to the book (20).** The largest group: `chapter-1/dochira`, `chapter-2/okashi`,
`chapter-3/resutoran`, `chapter-3/ranchitaimu`, the three Lesson 3 digit-time cards
(`fib-c3-gym-open-7`, `fib-c3-restaurant-open-8`, `fib-c3-supermarket-10-6`),
`chapter-3-extras/toukyou-ima-gogo-yoji-han`, `chapter-5/cheesecake`, `chapter-5/achira`,
`chapter-6/douzo-kochira-e`, `chapter-7/gatsu-suffix`, `chapter-8/wakarimashita`,
`chapter-10/-/book-gap/3`, `chapter-15/jouzu-na-skilled`, `chapter-15-extras/x15a-jouzu-desu-ne`,
`chapter-17-extras/neru-mae-ni-stretch`, `chapter-19/onegai-dekimasu-ka`,
`chapter-19-extras/nimotsu-go-ji-made-azukatte`, `chapter-22-extras/osake-ex1`. The gloss, the digit
convention or the note is the book's own, and a finding never says the book is wrong. Most are the
Learner's, who cannot know what the book says. Next run: either let the Verifier keep doing this (it
did it well and cheaply) or have the Learner mark a finding "unless the book says so" when it rests on
a gloss or convention, so the Verifier can triage it first.

**A proper name inside a sentence (6).** `chapter-2-extras/irl-l1-37`, `chapter-8/tenmasa-degozaimasu`,
`chapter-8/nozomi-depaato-degozaimasu`, `chapter-9/shibuya-library-a`, `chapter-9/yoku-library-q`,
`chapter-24-extras/-/other/1`. The Reader applied the proper-name rule to names doing their job inside
the book's own sentence, which the rule allows. Next run: quote the whole rule in
`qa/prompts/reader.md`, including the "inside a sentence" clause, so only word cards and authored
sentences built on a name are reported (the four that survived, Theme 14).

**Already taught or already cued, and the Learner missed it (12).** `chapter-6-extras/ga-kore-ga-sumisu-san-no-desu`,
`chapter-7-extras/juuji-ni-ikimasu`, `chapter-8/onamae/missing-info/1`, `chapter-11/deeto`,
`chapter-12-extras/ex12-kaigishitsu-ni-dare-ga-imasu-ka`, `chapter-12-extras/eg-chairoi-tsukue`,
`chapter-18/itte-2`, `chapter-18-extras/eat-after-meeting-ato-de`, `chapter-19-extras/chotto-matte-bike`,
`chapter-22-extras/ireru-box-pen`, `chapter-24-extras/yoku-shitte-imasu`,
`chapter-24-extras/tsutometeimasen-sentence`. The ledger had the word (はこ in Lesson 12 extras, よく
"well" in Lesson 14, とめる "park" in the same chapter) or the scene already carried the cue. Next run:
the Learner should grep the ledger for the exact kana before claiming a word untaught, and the prompt
should say so.

**One word, two English senses (3).** `chapter-14/arimasen`, `chapter-14/arimashita`,
`chapter-14/arimasendeshita`: "there isn't" and "do not have" are one Japanese word, so either reading
is right. Not a prompt problem; the Learner's unease is real but the card is correct.

**Deliberate deck decisions, provenance, or reported elsewhere (6).** `chapter-10/ojama-shimasu`
(an owner edit recorded in `docs/card-rules-shared.md`), `chapter-16/-/other/2` and
`chapter-16-extras/-/other/3` (aiSuggested is provenance, kept by design), `chapter-17/-/ambiguous/1`
(five repeats carrying `repeatOf`, kept at gate 1), `chapter-19/-/book-gap/1` (えびす, already in
preflight's coverage output), `chapter-12-extras/f12-kyonen-eki-no-mae-ni-konbini-ga-arimashita`
(literally true). Next run: the Learner prompt should say that `aiSuggested` and `repeatOf` are
metadata and never a finding, and that preflight's own output is not to be re-reported; the Reader's
`chapter-16` reports show the renderer's "(authored for the deck)" annotation was mistaken for a face,
so `scripts/qa-render-unit.mjs` should label its annotations as such.

One further note for the owner rather than the prompts: the Verifier flagged `chapter-17/-/ambiguous/1`
as a policy question. Five Lesson 17 base cards knowingly repeat earlier words through `repeatOf`; each
costs reviews for no new content, and whether to prune repeats deck-wide is a decision, not a defect.

# Card-authoring rules

Every rule about what a card may contain and how the card set must be shaped. These apply to every
source (EPUB chapter, dictated lesson, template) and to every pass that writes cards: the extraction,
the fill-in-the-blank miner, the cross-lesson note pass, the extras pass, and you, when you author or
edit cards by hand. The workflow spine ([SKILL.md](../SKILL.md)) states each rule once, briefly; this
file is the canonical, full statement.

**Scope, once, for the whole file.** Every rule here, and every audit it tells you to run, applies
WITHIN ONE COLLECTION: one book under `output/epubs/<slug>/`, one course under
`output/courses/<slug>/`, one template under `output/templates/<name>/<lang>/`. Where a rule says
"the deck" or "deck-wide", it means that one collection and all of its lessons and `-extras` units.
It never means two of them together. Two collections are two separate products and are never
overlapped, compared, cued against each other, or considered in reference to each other, even though
the learner may study both on the same day. See CLAUDE.md, "Collections are isolated".

## English glosses read as natural sentence-case English

**Every English gloss reads as natural sentence-case English — capitalized, never a lowercased clip.**
Each card's `english` starts with a capital letter (sentence case, *not* Title Case): a single common
noun is `Bag` / `Water` / `Green tea`, a phrase is `Nice to meet you`, a full sentence is punctuated
(`Is this a pen?`, `This is my pen.`). This holds no matter how the source arrived — when you author a
word list from a dictated/pasted lesson (the `--words` path), capitalize each gloss *as you write the
words file*, since `assemble` stores the English verbatim and later stages never re-case it. Proper
nouns keep their own casing (`UK`, `French Person`); items opening with a digit or symbol keep it and
capitalize the first letter (`5 AM`, `9 PM`). Match the existing lessons in the same course/book so the
deck reads consistently — a lowercase `bag` next to `Good morning` looks wrong.

## Display text: no editorial spaces, no terminal 。

**Japanese (and other space-free scripts) render without editorial spaces, and cards never end in 。.**
A textbook writes Japanese with word-separation spaces (a beginner aid) and terminal `。` periods, but
the deck face, reading, and reviews strip both — `normalizeDisplayText` in `src/model/scriptSpacing.js`,
applied at assemble + translate. So `これは ワインです。` is stored/shown as `これはワインです`. (Romaji
keeps its own punctuation.) The displayed face and reading never carry a `。` at all: for Japanese TTS
the audio stage appends a throwaway end marker (`。ででで`) to the *spoken* text only, and the trim cuts
it back off. See [audio-pipeline.md](audio-pipeline.md) for how that works.

## Never card a SCHEMATIC pattern; card a real sentence instead

**A card's `target` must be something a person could actually say.** Textbook vocabulary lists print
grammar patterns as schematics, with a placeholder standing in for the slot: `だれも…〜ません`,
`〜から〜まで`, `〜って なんですか`. Those are fine on the page, and useless as a card. The `…` and `〜`
are not language, so the TTS voice reads the placeholders or stumbles over them and the clip is
meaningless; the romaji comes out as `dare mo … ~ masen`; and the Production face asks the learner to
produce a notation they cannot say or type. The extraction lifts these verbatim because they sit in
the vocabulary list looking exactly like every other entry, so check for them: a `target` containing
`…`, `〜`, `~` or `...` is almost always this bug.

Deliver the pattern the way every other rule here says to, **as a worked sentence with the slot
filled**: `だれもいません` teaches `だれも + negative` better than the schematic ever could. So:

- If the deck already teaches the pattern in a real sentence (it usually does, in the same lesson),
  **exclude the schematic row** and move any genuinely useful content off its `note` onto the real
  card, checking that no other card's note points back at the row you just dropped.
- If nothing demonstrates the pattern yet, replace the schematic with a sentence built from
  vocabulary already introduced, marked `aiSuggested` with a `reviewNote` saying it stands in for the
  book's pattern entry.

The gloss is worth fixing at the same time. A schematic row usually carries a bare label ("No one")
that no longer matches once the card is a sentence ("There is no one.").

## Pedagogical order, and the number-run jumble

The items in `corpus.json` are **already pedagogically sorted** — as the last step of `assemble`, a
dependency-aware LLM pass (`sortItemsPedagogically`, Sonnet-medium) re-orders them for learning flow
so a learner meets vocabulary before the sentences built from it (atoms → molecules), rather than raw
textbook order (which often prints a Key Sentence before the words inside it). This is on by default
for every source; pass `--no-sort` to `assemble` to keep the raw extracted order instead. It's purely
a re-ordering (never adds/drops/rewrites a card) and fails open. The order you see in the corpus
review **is** the study order the deck will use, so the review is your chance to sanity-check the
sequence — if a sentence still lands before its vocabulary, tell me and I'll nudge it.

**Jumble any run of sequential numbers — never leave 1, 2, 3, 4, 5… in ascending order.** When a source
teaches a sequence of numbers or counters in order (plain 1–10, `いっぷん/にふん/さんぷん` minutes,
`いちじ/にじ/さんじ` o'clock, floors, prices climbing by one, …), studying them in that order teaches the
*position* — the learner recalls "what comes next" and looks fluent until the numbers show up shuffled
in real life. So the numbers in such a run must be **shuffled into a non-sequential order**. The
pedagogical-sort pass does this automatically (principle 6 in `docs/pedagogical-sort-prompt.md`), and
you should apply it by hand whenever you author/reorder a corpus with numbers in it. Two rules keep it
tidy: **(1) jumble ONLY within the number run** — keep those cards contiguous as their own numbers block
and never interleave them with the surrounding non-number cards (a "dog, cat, horse, 1, 2, 3, 4, 5"
section keeps dog/cat/horse put and only shuffles the 1–5 among their five slots); and **(2) each
distinct run is jumbled on its own** (a minutes run and an o'clock run are shuffled separately). One
trap: a run can be **interleaved by counter type** — e.g. `1-flat, 1-long, 1-general, 2-general, 3-flat,
3-long, 3-general, 4-flat, …` (Japanese counters ～まい/～ほん/～つ taught side by side). No single counter
forms a clean contiguous 1→10 run, so a naive detector skips it and the numbers stay predictable; treat
the **whole interleaved block as one run** and shuffle it as a unit. (For an older deck built before
this rule, `scripts/jumble-number-runs.mjs` de-sequences its number runs, reversibly via a `.bak`.)

**Every review stage reflects this one pedagogical order.** The sort runs once, at assemble, and the
order flows straight through: `translate` and `audio` preserve the item order, so the corpus,
translate, and audio review surfaces all present the cards in the same pedagogical sequence, and the
deck's study order matches it. There's no per-stage re-sort — fix the order once (in `corpus.json`,
or by telling me) and every downstream stage and review inherits it. When you hand-edit the order (or
I split/add/reorder rows), keep `corpus.json` and `cards.json` in the same sequence so the reviews and
the deck stay aligned.

## Numbers carry a spoken `ttsText`

**What `ttsText` is.** The text TTS speaks instead of the target whenever the written target would be
misread (numerals AND kanji-bearing targets). It is never rendered on any card face. It was called
`reading` before the 2026-08 rename; the Anki note type still has a field named "Reading", which
holds this value and which no template shows.

**Numbers carry a spoken `ttsText`.** When a `target` contains a numeral (a price, floor, count —
e.g. `2,000えん`, `５かい`), the item also gets a `ttsText` field with the number spelled out in the
target language's own script (`にせんえん`, `ごかい`). The digits stay in `target` for a natural card
face, but the spelled-out `ttsText` is what drives the romaji pronunciation AND the audio — because
digits break both (kuroshiro renders `2,000えん` as `2 , 000 en`, and ElevenLabs may read it in
English). The `ttsText` drives the **Pronunciation** you see in the Corpus review, so a wrong counter
shows up as wrong romaji there — if a number's pronunciation looks off, tell me and I'll fix the
`ttsText`. (The `audio` stage refuses to run while any card would send a raw numeral to the TTS
voice, so a missing `ttsText` surfaces before credits are spent.)

## The romanization style is pinned, and linted

**`pronunciation` follows ONE pinned style, and hand-authored cards follow it too.** The field renders
on the back of both card directions, so a deck that spells `konbini` in one lesson and `kombini` in
the next is teaching two spellings of one word. The style below is the single source: it is injected
verbatim into every prompt that produces a romanization (the romanization-correction pass, the
number-reading pass and the fill-in-the-blank pass), and `npm run preflight` lints the finished cards
against it. Anything you write by hand — an extras card, a fixed-up `pronunciation` in the dashboard —
is held to the same list.

The rules live in `src/translate/romajiStyle.js` (`JA_ROMAJI_STYLE`) and are copied here so you can
read them without opening the code. A test fails if the two ever disagree, so this copy cannot drift:

- Long vowels take a MACRON, never a doubled vowel and never a trailing `u`: `tōkyō`, `ginkō`, `yūmei`, `tanjōbi`, `dō`, `rāmen`, `ōsutoraria`. Never `ginkou`, `yuumei`, `dou`, `raamen`.
- Two long vowels keep their doubled spelling: えい stays `ei` (`sensei`, `kirei`, `eiga`) and いい stays `ii` (`ōkii`, `oishii`, `atarashii`). A vowel that begins a new morpheme is not a long vowel either: みずうみ is `mizuumi`, not `mizūmi`.
- ん is always `n`, never `m`, including before b/p/m: `konbini`, `konbanwa`, `sanpo`, `tenpura`, `shinbun`. (Traditional Hepburn writes `m` there; this deck does not.)
- ん before a vowel or `y` takes an apostrophe, so the syllable break is unambiguous: `sen'en`, `kin'yōbi`, `pan'ya`, `tan'i`. Without it `kinyōbi` reads as きにょうび.
- Particles are written as they are SPOKEN: を is `o`, topic は is `wa`, direction へ is `e`. `hon o yomimasu`, `watashi wa`, `gakkō e ikimasu` — never `wo`, `ha` or `he`.
- The small っ doubles the following consonant (`kitte`, `gakkō`, `zasshi`), and becomes `tch` before ち (`matcha`). Never spell it as a literal `tsu`. The doubling survives the counter hyphen below: ろっかい is `rok-kai`.
- A romanization is split into WORDS, not into the syllables a morphological analyser happened to find. `nihongo`, `arimasen`, `hanashimasu`, `deshita` — never `ni hon go`, `ari mase n`, `hanashi masu` or `deshi ta`. A trailing ん is part of the word before it and never stands alone.
- A romanization NEVER ends in `.`, `!` or `?`. 。／！／？ are marks of the written target, not sounds the learner says: `ohayō gozaimasu`, not `ohayō gozaimasu.` A 、 inside the sentence stays a comma, and a target running two sentences together separates them with a period and a space.
- Only proper nouns are capitalised — personal names, place names, company names: `Tanaka-san`, `Tōkyō`, `Nihon`, `Nozomi Depāto`. Everything else is lowercase, INCLUDING the first word of the romanization, because a romanization is a pronunciation guide and not a sentence.
- An honorific or title suffix attaches to the name with a HYPHEN, never a space and never fused: `Tanaka-san`, `Sumisu-sensei`, `Yamada-sama`, `Kumano-jinja`. `tanaka san` reads as two words.
- A number and its counter are joined by a HYPHEN: `jūni-nichi`, `shi-gatsu`, `go-ji`, `nijūgo-nen`, `ip-pon`, `san-gai`. Never fuse them into one token — `jūninichi` reads as if it contains an "ichi" that is not there. An ordinary word that merely looks like a counter keeps its spelling: にほん "Japan" is `nihon`, not `ni-hon`. The NATIVE ひとつ series is one word and never hyphenates: `hitotsu`, `futatsu`, `mittsu`, `yottsu`, `muttsu` — not `mit-tsu`.

Two of these are taught but not linted, because a regex cannot decide them: proper-noun casing (a
capital in first position is right for `Tanaka-san` and wrong for `Hai, wakarimashita`) and the
missing ん apostrophe (the same letters whether the kana was ん+や or に+ょ). Those two are on you.

The lint is INFO-tier and reports, it never rewrites. Fixing a romanization correctly is the
romanization pass's job: `dou` → `dō` is safe right up until the word is 同 and the fix has to know
which.

## Provenance flags: `aiSuggested` and `uncertain`

**Provenance flags are core, persisted, and shown at EVERY review stage.** Two boolean fields track
where an item came from: **`aiSuggested`** (you/the model added this item as a critical-gap suggestion,
not from the source) and **`uncertain`** (the extractor flagged it as possibly premature or already
taught). Both are first-class fields carried **all the way through the pipeline** — set at assemble,
preserved by `translate` into `cards.json` (never auto-cleared), so the record survives for auditing
over time. The dashboard **badges them at every gate** — a coloured **AI-suggested** / **Uncertain**
badge in the corpus Flags column and inline under the English gloss at the translate and audio reviews
— so a reviewer can always see, without asking, which items are AI-added or flagged. When you author
items yourself (e.g. AI suggestions on a dictated lesson), set `aiSuggested: true` on them so they're
visibly delineated. Reviewing a flagged item does **not** clear the flag; it's informational
provenance, kept indefinitely.

## Every Grammar & Function Words card needs a worked example

**Every `Grammar & Function Words` card needs a worked example somewhere in the lesson.** This is not
just a particle rule. Any card whose gloss describes a form's *function* rather than a meaning you can
picture (particles が, は, を, も, と, で, から, まで, か; copulas and polite forms like でございます;
suffixes and prefixes; conjunctions; question words) has to be met somewhere as a full sentence that
actually uses it. A bare gloss like "(polite form of です)" teaches nothing on its own: the learner can
recite the card and still have no idea what a sentence containing it looks like. So for each such card,
check the lesson for a sentence card whose `target` contains that form. If the chapter supplies one
(a Key Sentence, a grammar example, a drill's worked example), that satisfies it, and you add nothing.
A DIALOGUE line satisfies it only if it has actually been extracted as a card: extraction does not
mine the dialogue as a script, and it takes a line only under the one exception (the chapter's only
demonstration of a function word Step 2 requires an example for, carrying a `reviewNote` naming that
form). A line still sitting in the book demonstrates nothing to the learner.
If the chapter introduces the form but demonstrates it nowhere, add the example yourself as a separate
card marked `"aiSuggested": true`, reusing vocabulary already introduced, with a `reviewNote` naming
the form it illustrates. The form's own vocabulary entry still stays the bare morpheme; the example is
an additional card, never a rewrite of the entry.

Two things make this easy to get wrong. First, chapters often DO demonstrate the form, but only inside
the dialogue, which extraction does not mine, so the sentence exists in the book and never became a
card. Look there before inventing one: that single line is exactly what the dialogue exception is for,
and the book's own sentence beats one you write. Second, one example
shows the form; two show the *pattern*. Where a form generalizes (でございます works for any business
naming itself), prefer the book's own sentence plus one built from earlier vocabulary, so the learner
sees it is a slot and not a fixed phrase.

Audit an existing deck for this the same way: list every `Grammar & Function Words` card whose `target`
is a bare morpheme, and check whether any longer `target` in the deck contains it. The gaps are real
bugs, not stylistic preferences.

## Fill-in-the-blank cards and the semantic de-dup

**Fill-in-the-blank (FIB) cards must be semantically de-duped against the corpus.** When AI-generated
fill-in-the-blank practice sentences are added (marked `"fillInBlank": true`, mixed into the lesson
and clearly delineated in reviews), they are prone to **pattern overlap** — regenerating a sentence
frame the corpus already teaches, or producing many near-identical siblings (e.g. "X is from France"
vs "Y is from France", or the same shopping dialogue with the nouns swapped). Before finalizing, run a
**semantic de-dup pass** (not just exact-string): group every card — corpus **and** FIB — by its
sentence pattern, then keep **at most ~2 examples per pattern counting the corpus lines**, preferring
FIB that introduce a **new** pattern or genuinely new vocabulary/context, and **remove the rest**. A
couple of same-pattern examples is fine; many is not. Record the keep/remove decision per card (frame
+ reason), back up removed cards so any can be restored, and surface the result in the review so the
human can push back before the deck is built. This applies both to any FIB extraction going forward
**and** as a gate on FIB content already in a book.

In the pipeline this is `src/cards/semanticDedup.js` (prompt in `docs/semantic-dedup-prompt.md`),
run by `prepare` after FIB enrichment. A redundant practice card is **excluded, not deleted** —
`excluded: true` plus a `reviewNote` naming what already covers it — so the reviewer sees each call
with its reasoning at gate 1 and can restore any card with one click. It only ever touches cards
marked `fillInBlank`; source material is off limits.

Check every FIB card against the lesson's **excluded** rows too: a drill sentence must not lean on
vocabulary the reviewer has already dropped. Substitute an equivalent kept word instead (if `あした`
was excluded, build the sentence on `らいしゅう`).

**FIB placement — a contiguous drill block at the END of the lesson.** Append the kept FIB cards after
all of that lesson's vocabulary and textbook sentences; do **not** interleave them earlier. A drill only
ever reuses vocabulary the lesson has already introduced, so putting the whole block last keeps the
lesson's dependency order intact (vocab → textbook sentences → practice drills) and is what the
pedagogical-order check expects. Keep each split Q&A pair adjacent (question card immediately followed
by its answer card).

## Split every combined question-and-answer card

**Never put a question and its answer on the same card — split them into two.** A single card that
holds both a question and its answer (e.g. `プレゼンはいつですか。きょうのさんじからです` / "When is the
presentation? It's at 3:00 today.") reviews awkwardly — flashcards are one prompt → one response. When
generation produces a combined Q&A line, split it into **two separate items**: a question card and an
answer card, each with its own `target`/`ttsText`/`english`/`pronunciation` and its own audio (the
Japanese splits on the internal `。`, the English on the `?`). Keep both marked `fillInBlank` when they
came from a drill. This holds for any source, not just FIB.

## The four note fields: `scene`, `hint`, `note`, `reviewNote`

**Four note fields: front-of-both `scene`, Production-front `hint`, back `note`, internal
`reviewNote`.** Each card carries four distinct note fields (the review shows the scene and hint
stacked in one column, plus **Note** + **Review note**):

- **`scene`** (shown small/italic under the prompt on the front of BOTH card directions) sets the
  situation the sentence lives in: the question just asked, who is speaking, what is already under
  discussion. It exists because an elliptical reply or a context-bound set phrase is unanswerable
  without it in EITHER direction ("answering whose bag this is", "the wine is already under
  discussion, so it is not named", "said when entering another person's room"). Because it renders
  before the learner answers on both sides, a scene must never contain or paraphrase the answer.
  Textbook contextual parentheticals live here: "Excuse me. (said when entering a room)" becomes
  `english` "Excuse me." + `scene` "said when entering a room".

  **The parenthetical convention, stated once.** A textbook parenthetical goes to one of two places,
  and which one depends entirely on whether the TARGET drops the same thing:

  - **It stays in `english`** when it restores a subject, object or topic the target drops too.
    `にちようびです` glossed "(The party) is on Sunday." keeps its parenthetical, because the Japanese
    is elliptical in exactly the same way and the parenthetical is part of the meaning. Stripping it
    would leave "It's on Sunday." — an English sentence that cannot yield that target.
  - **It moves to `scene`** when it describes the SITUATION rather than the sentence: who is speaking,
    what was just asked, when the phrase is used. "Excuse me. (said when entering a room)" →
    `english` "Excuse me." + `scene` "said when entering a room".

  The test is one question: does the target drop it too? If yes it is meaning and belongs in the
  gloss; if no it is context and belongs in the scene. Never both, and never a parenthetical in
  `english` that a reader would take as a stage direction.
- **`hint`** (shown on the Production front only; on the Recognition front it is part of the answer,
  so there it renders on the back) tells apart two cards whose ENGLISH prompt collides, by
  describing the target word itself: meaning ("the object you read"), register ("warm but casual"),
  or form ("use the へ (e) direction particle"). If the cue describes the situation rather than the
  word, it is a `scene`, not a `hint`.
- **`note`**: BACK-of-card context shown after answering (when/how to use it, register, how it
  differs from a related card, cross-references). Renamed from the old `cardNote`.
- **`reviewNote`**: internal rationale (why `uncertain` / why `aiSuggested`), shown ONLY at the
  review gate, NEVER in the deck or viewer.

(A one-off migration for decks built before this split, `scripts/split-front-hint.mjs`, moves
disambiguation parentheticals out of `english` into `hint` and renames the old `cardNote` to `note`,
book by book, backing up to `.pre-hint.bak`. Every deck on disk has been through it; it is kept for a
deck restored from an old backup.)

**Any `hint`/`note` that quotes non-Roman target script ALWAYS shows its romanization in brackets** —
`はじめまして (hajimemashite)`, `お (o) + かし (kashi) = おかし (okashi)` — because the learner may not
yet read the script (this is a learner-facing rule; `reviewNote` is internal and needs none).
**Back-note cross-references look BACKWARD only** — a card may compare itself to a card from the SAME or
an EARLIER lesson, never a later one the learner hasn't met (so その (sono) references それ (sore) from
an earlier lesson, not vice-versa). The extraction prompt enforces all of this
(`docs/epub-extraction-prompt.md`); apply it by hand when you author or edit a `hint`/`note`.

## A cue is mandatory on an English-gloss or target collision

**Two cards that share an English gloss MUST each carry a `hint` (or a `scene`), and two cards that
share a `target` MUST each carry a `scene`.** Cues are usually optional. They stop being optional
the moment two cards in the same DECK (not just the same lesson) can be reached by the same prompt
with different answers. On a Production card the learner sees only the English, so two cards reading
"How many people?" are literally the same question with two different right answers, and the only
honest way to study either one is a front cue saying which is wanted: なんにん (nan-nin) gets "the
plain, everyday way to ask", なんめいさまですか (nanmeisama desu ka) gets "what a restaurant asks a
customer". The reverse collision, one `target` with two glosses (すみません (sumimasen) = "Excuse
me." / "I'm sorry."), bites on the RECOGNITION front, which only a `scene` can fix (a `hint` doesn't
render there before answering). Situational scenes are ideal ("getting someone's attention" /
"apologizing for a mistake"); for a grammar word or counter where any cue partially points at the
answer ("counting, not the particle"), a small leak is the accepted price of an answerable card.
Pair the cue with a `note` on the back that explains the *relationship* (which is politer, which
register, which one answers the other), because the front cue only has room to point.

The collision is easy to miss during a single-lesson build, since the two cards often live in
different chapters and neither pass ever sees both. Check for it across the WHOLE COLLECTION, and
only that collection: group every card in this one book or course by its normalized English and by
its `target`, and any group with more than one distinct answer needs cues.

Common shapes in a Japanese course: a polite/plain register pair (なんにん (nan-nin) vs なんめいさま
(nanmeisama), じゃ (ja) vs では (dewa), はい (hai) vs ええ (ē)), a noun and its noun+します verb
(しごと (shigoto) "Work" vs しごとをします (shigoto o shimasu) "Work"), two particles glossed with the
same English, and a number that sounds like a word (さん (san) "3" vs さん (san) "Mr., Mrs., Ms.,
Miss"; ほん (hon) "Book" vs the ほん (hon) long-object counter).

**The boundary is the collection.** A card in a DIFFERENT book or course is a different product, and
is never cued against, compared with, or considered alongside this one, even though the learner may
study both decks on the same morning. That is a deliberate rule, not an oversight; see CLAUDE.md,
"Collections are isolated". Within this collection every lesson and every `-extras` unit is in scope,
which is exactly what `extras-collision-audit.mjs <bookDir>` reads.

**Run `scripts/extras-collision-audit.mjs <bookDir>` at the end of EVERY chapter, not only during an
extras pass.** Collisions are the one defect class that grows as the deck grows: each new lesson
reuses forms the earlier ones already glossed, so a book gains a couple of them per chapter and no
single-lesson pass can see any of them. Left alone they compound, and they get more expensive to fix
as the units they live in are signed off. The audit is seconds; run it before the unit goes `done`
and fix what it names while the cards are still open.

Two traps when you act on its output:

- **A `hint` cannot fix a target collision.** It renders on the Production front only; on the
  Recognition front it belongs to the answer and shows on the back, after the learner has already
  had to answer. Only a `scene` renders before the answer on both faces. The audit enforces this
  asymmetry (target groups demand a `scene`), but apply it by hand too whenever you word a cue.
- **Not every collision is a sense distinction; some are duplicates.** Two cards with the same
  target and glosses that mean the same thing ("To be (copula)" vs "Is / am / are (copula)") are one
  card entered twice, and writing a cue there invents a difference the language does not have. Read
  both glosses before wording anything: if you cannot state what separates them, exclude the later
  one (keeping the earliest occurrence, as the duplicate-check script does) and the collision
  disappears. A card the backward de-dup already flagged `uncertain` is the usual suspect.

## An answer card must be answerable alone

**An ANSWER card must be answerable alone.** Textbook drills and dialogues are question/answer pairs,
and the pipeline splits them into two cards that are then studied shuffled, weeks apart. The answer
card arrives with no memory of the question, so two things have to hold.

First, the `english` must be able to produce the whole `target`. `パーティーはごじです` glossed "It's at
5:00." cannot: the target states its topic, the English doesn't, and nothing in the prompt tells the
learner to reach for パーティーは. Gloss it "The party is at 5:00." Dropping the topic in English is
correct ONLY when the target drops it too (`にちようびです` → "It's on Sunday."). The check is
mechanical: read the English alone and ask whether it could yield that exact target.

Second, an elliptical answer card needs a `scene` naming the question it replies to: "answering where
the computer is", "answering when the presentation is". State the QUESTION, never leak the answer.
Without it "It's on Sunday." is a card with no discoverable right answer.

This is enforced where the pairs are made: `docs/fill-in-blank-prompt.md` rules 4 and 5, with `scene`
carried through by `src/cards/fillInBlank.js`, which also logs a warning naming any answer-shaped card
that came back without one. Over a finished deck, `npm run preflight`'s **`answerable-alone`** check
does the same sweep: every card whose English starts with a pronoun stand-in ("It's", "That's",
"They're") and carries no `scene`. It is INFO and never blocks, because some of them really are
producible on their own — the shape is mechanical, the verdict is yours. Both read the same predicate
(`src/cards/faceQuality.js`), so the pass and the audit cannot disagree about what the rule is.

## A Production face is one prompt, not a paragraph

**Keep the `english` under 60 characters, or ship the card Recognition-only.** A Production card asks
the learner to produce the entire target from the entire English. Past about a sentence that stops
being one prompt: the live deck's longest is "Nice to meet you. I am Raja of the University of Tokyo.
I look forward to working with you." at 91 characters, which is three sentences and one expected
answer. There are exactly two honest fixes, and both are yours to choose: **split** it into the cards
it really is, or **suspend the Production direction** for it (`dirSuspended: [1]`) and let it be a
Recognition card, which is what it was always going to be studied as.

`npm run preflight`'s **`production-length`** check lists them (INFO; 31 live cards on the book
today). The ceiling lives in `src/cards/faceQuality.js` as `PRODUCTION_FACE_MAX_CHARS`.

## Watch for a sentence frame drilled with only a name swapped

**Three or more cards that are the same sentence with a different name or number in it are a drill
bank, not three cards.** `Smith-san, what country are you from?` / `Chan-san, …` / `Raja-san, …` gives
the learner one thing to learn and three cards to answer it with, and the third is answered from
working memory. Usually two of them earn their place and the rest do not; occasionally all of them do,
because the swapped slot IS the drill.

`npm run preflight`'s **`near-siblings`** check reports them, and it is deliberately narrow: only
frames that still carry three ordinary words once names and numbers are blanked out, and only when
every member fills the slots differently. That narrowness is the whole point — a blanket "these look
alike" check groups `Yes` / `No` / `Germany` under one frame, reports 270 cards, and fires on the
counter series (`Nine minutes` / `Six minutes`) that a lesson exists to teach. On the live book the
narrow version names 7 frames over 24 cards.

## Irregular members of a counter series each earn a `note`

**Irregular members of a counter series each earn a `note`.** Number and counter cards usually want
no note at all, but the ones that BREAK the series are the exception, because the learner has just
been taught a pattern that these violate. ひとり (hitori) and ふたり (futari) take no にん (nin) at
all; よにん (yo-nin) uses よ (yo) and not よん (yon); とお (tō) is the one general-object number with
no つ (tsu). Say what the regular pattern would predict and why this one does not follow it, and
name the counter card the exception belongs to.

## `category` is required, and shown on the Production front only

**`category` is REQUIRED on every card.** It is never optional — both schemas require it and hold it
to the fixed enum in `src/model/categories.js`, the extraction validates it too, and the
dictated-lesson path auto-assigns it. A card missing a category is a bug; if you author cards by
hand, set one.

**The chip renders on the PRODUCTION front only.** It used to render on both. On a Recognition front
it is an uncontrolled answer cue: "Shopping" sitting above a bare デパート narrows the answer more
than any `scene` the collision doctrine would let you write, on 2,150 fronts, 86% of which carry no
scene at all — so the cue you are forbidden from writing was being supplied automatically. On the
Production front the learner is already reading the English, so the chip adds context without
answering anything, and the card is still studied *with* its domain in the direction where that
helps.

Two rules about WHICH one:

- **Before reaching for `"Other"`, try `"Descriptions & Qualities"`** (adjectives and descriptive
  words: big, cheap, delicious, quiet) **or `"Everyday Objects"`** (ordinary things belonging to no
  narrower topic: pen, key, umbrella, bag). Those two were added because `"Other"` had grown into the
  second-largest bucket in the book, and a bucket that big says nothing about what a card is.
- **A worked example takes the category of the FORM it demonstrates, not of the words it is built
  from.** A sentence written to show the particle よ at work is `"Grammar & Function Words"` even
  though it is about coffee: the card exists to teach the particle. A sentence that is in the chapter
  as ordinary content and merely happens to contain the form takes its own topic.

## The cross-lesson note pass (teachability / cross-reference)

**Cross-lesson notes** (`src/cards/crossLessonNotes.js`, prompt in
`docs/cross-lesson-note-prompt.md`) run for every lesson of a book or course; skipped for a template,
which has no earlier lessons to reference. "Cross-lesson" means **within one collection**: the pass
sees this book's or course's own earlier lessons and nothing else. It never reaches into another
book or course, because collections are isolated (CLAUDE.md). This is the step that turns a flat vocabulary list into a
connected knowledge base where each card knows what came before it. The extraction runs one chapter at
a time, so it can only cross-reference within that chapter — genuinely useful comparisons that span
lessons (おねがいします vs ください, the greeting time-chain, その vs それ) have to be added by a pass
that can see across lessons. It runs automatically inside `prepare` (Sonnet; raise it with
`ANKI_BUILDER_TRANSLATE_EFFORT=high`) for **every** lesson, as part of building it.

It runs **one pass PER LESSON**, each fed only that lesson **plus all EARLIER lessons** as context, and
writes notes for the current lesson only — so cross-references are **structurally backward at the
CHAPTER level** (the model literally never sees later lessons, so a forward reference — clarifying a card
against something the learner hasn't met yet — is impossible, not merely discouraged). Within a lesson,
cards may reference each other freely (it's one unit the learner studies together — the constraint is
per-chapter, NOT per-card). It writes `note` on any card it improves and `hint` only on a card that
collides with another card's English gloss (see the collision rule above); a card it returns no `hint`
for keeps whatever hint it already had. It leaves `reviewNote` untouched. It RE-READS each file
immediately before writing and merges in only `note` and `hint`, so an edit you make in the dashboard
while the pass is running is not overwritten, and it snapshots each file to a stamped
`<file>.pre-enhance-<YYYYMMDDHHmm>.bak` first, so every run is separately reversible.

The pass writes three kinds of note: backward cross-references (near-synonyms, register), usage/register
tips, and — highest-value — **false-friend disambiguations**: a card that reuses a form the learner
already knows but in a different role, e.g. どこ (doko) "where is it?" vs どこの (doko no) "which place's /
what make of" (それはどこのコーヒーカップですか), だれ (dare) "who" vs だれの (dare no) "whose", or a pronoun
vs a determiner (それ (sore) "that one" vs その (sono) "that ___"). These are the cards a learner silently
misreads, so a full sentence that hinges on one earns a note even though sentences usually don't.

For a one-off backfill across a whole book that's already been built, the same pass has a batch driver:

```sh
ANKI_BUILDER_TRANSLATE_EFFORT=high node scripts/enhance-card-notes.mjs --only <unit> <bookDir>
# e.g. … --only chapter-6 output/epubs/japanese-for-busy-people-book-1-kana
```

**Never run the bare `<bookDir>` form on a book with finished lessons** — it rewrites their notes.
(Each run does leave its own stamped `.bak`, so it is undoable, but undoing a book-wide sweep by hand
is not a pleasant afternoon.) You do NOT need this script for a new lesson; `prepare` already ran the
pass for it.

## Never restate the card

A note must ALWAYS add something the card doesn't already show — **never restate the card.** The SAME
rule applies to `hint`s: a hint must ADD a disambiguation cue (WHEN/WHERE/WHY it's used), never restate
the gloss. A note that just repeats the English gloss ("Where is the wine shop?"), a hint that echoes
it (`phrased as "wine from France"`), or a field that re-gives the reading already in Pronunciation
("First floor (read いっかい)") teaches nothing — on a recognition card a restating hint even hands over
the answer; most number/counter cards and self-evident sentences should have NO note or hint. The
extraction prompt is told not to emit these, and the enhance pass DELETES a note that only restates its
card. (A companion migration for older decks, `scripts/strip-restatement-notes.mjs`, clears notes and
hints that just echo the card; reversible via a `.bak`.)

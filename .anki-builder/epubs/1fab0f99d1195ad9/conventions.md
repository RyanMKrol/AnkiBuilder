# ja Book Conventions

## Placeholder Notation

**Chapters 1-12:**

### Pattern-Template Blanks

The 12 chapter files supplied here are entirely **front matter** for *Japanese for Busy People Book 1: Kana* (cover through the front-matter "Audio, Script and Answers Download" page). The actual numbered lessons (Lesson 1, Lesson 2, …) live in separate files (`c01`, `c02`, … referenced by the table of contents) that are not among the 12 files given, so no lesson-body Target Dialogue / Key Sentences / Exercises markup was directly observed. However, the Contents chapter (file 6, `toc`) previews every lesson's grammar patterns and gives a clear, book-wide picture of the pattern-template convention:

- A grammar pattern mixes **bolded English placeholder words** with literal Japanese particles/copula wrapped in `<span class="japanese" lang="ja">…</span>`. Examples straight from the TOC (file 6):
  - `<b>noun 1</b><span class="japanese" lang="ja">は</span> <b>noun 2</b><span class="japanese" lang="ja">です。</span>`
  - `<b>person</b><span class="japanese" lang="ja">は</span> <b>place/event</b><span class="japanese" lang="ja">に いきます。</span>`
  - `<b>verb [</b><span class="japanese" lang="ja">て</span><b>-form]</b><span class="japanese" lang="ja">ください。</span>`
  - `<span class="japanese" lang="ja">これ</span>/<span class="japanese" lang="ja">それ</span>/<span class="japanese" lang="ja">あれ</span>` (a plain enumerated choice, no bold placeholder needed since all three are literal words)
- These pattern lines sit in `<p class="toc_less_hang serif">` and are prefixed with a bullet `•`, each wrapped in an `<a href="…#cXX-nN">` anchor pointing into the (not-included) lesson file.
- Immediately below each pattern group, **real worked example sentences** (fully filled in, no placeholders) appear in `<p class="toc_less_hang1t">` (first example) and `<p class="toc_less_hang1">` (subsequent examples), each prefixed with a full-width bullet `・`. These are plain Japanese text, e.g. `・ スミスさんは あした ぎんこうに いきます。` — useful as a model for what a "filled pattern" looks like versus the templated version above it.
- Bracketed grammatical-form labels appear inside the bold placeholder itself, e.g. `<b>verb [dictionary form]</b>`, `<b>verb [ます-form stem]</b>`, `<b>verb [て-form]</b>`, `<b>Verb ない-form</b>` — the bracket is part of the English label, not a separate markup construct.

Because none of the 12 files contain actual drill/quiz pages, no in-drill blank notation (underscores, "[noun]" brackets used as a literal fill-in slot, etc.) was observed directly — only this TOC-preview style of pattern templating. The per-chapter extraction pass should expect drill-specific blank notation to look different once it reaches the actual lesson files.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Not observed anywhere in these 12 files. There are no vocabulary tables in this front-matter set (Word Power sections are only linked to from the TOC, not reproduced here), so no wave-dash-style single-entry prefix/suffix marking (e.g. `〜さん`, `お〜`) appears. This convention may still exist in the lesson files that are outside this batch; it simply cannot be confirmed or denied from what was read.

**Chapters 13-24:**

# ja Book Conventions


### Pattern-Template Blanks

The book uses a dedicated inline element for a fill-in-the-blank slot inside drills: `<span class="blank">` containing a run of literal full-width/half-width spaces (e.g. `<span class="blank">             </span>`), used both for a blank the student is meant to fill in prose (`これは<span class="blank">...</span>です。`) and for an entire missing utterance line in a dialogue exercise (`A : <span class="blank">             </span> (ホフマンさん、ドイツじん)`). Immediately after the blank, the book supplies the answer cue in parentheses, e.g. `(ホフマンさん、ドイツじん)` — this parenthetical is the substitution content the student is meant to produce, not a gloss.

In quizzes (ch. 16, Quiz 1) the same slot-marking need is instead rendered as literal underscores inside full-width parentheses directly in the Japanese sentence: `これは（　　　　　　）の　ペンですか。` — no `<span class="blank">`, just spaced parenthetical blanks in running text, with the answer word bank given separately in an `Abox0`-classed box above (`なん　だれ　いつ　どこ　なんじ　いくら`).

Listening-fill-in exercises (the last EXERCISES item in most lessons, "Listen to the audio and fill in the blanks…") reuse `<span class="blank">` inline inside a full Japanese sentence, e.g. `ジムは<span class="blank">   </span>から<span class="blank">   </span>までです。`

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Yes — this book marks single vocabulary/grammar entries as prefixes or suffixes directly in VOCABULARY table rows, using a wave dash `〜` attached to the morpheme, on its own row (usually a `class="sub"` or `class="sub2"` sub-entry row breaking down a compound headword). Examples actually found:
- `〜さん` — "Mr., Mrs., Ms., Miss" (ch. 14, L1)
- `〜です` — "be" (ch. 14, L1)
- `お〜` — "(honorific prefix)" as a breakdown of おくに (ch. 14, L1, NOTES)
- `〜じん` — "–ese, -ian (person from)" (ch. 14, L1, WORD POWER)
- `お〜` — "(polite prefix)" as a breakdown of おかし (ch. 15, L2)
- `〜じゃありません` — "is/are not" (ch. 15, L2)
- `〜ほん／ぼん／ぽん` — "(counter for long, slender objects)" (ch. 19, L5)
- `〜まい` — "(counter for flat objects)" (ch. 19, L5)
- `〜かい／がい` — "…floor" (ch. 19, L5)
- `〜ねん`, `〜ようび`, `〜がつ`, `〜にち` — date-counter suffixes (ch. 23, L7)
- `〜たち` — "(plural for people)" (ch. 22, L6, SPEAKING PRACTICE vocab)
- `〜ばん` — "number…(suffix for number)" (ch. 22, L6)
- `〜えん` — "…yen" (ch. 18, L4)
- `〜じ`, `〜ふん／ぷん` — o'clock / minutes (ch. 17, L3)
- `〜はん` — "…thirty, half past (hour)" (ch. 17, L3)

Pattern: the `〜` always attaches on the side it combines (trailing wave dash = suffix, leading wave dash = prefix), and these rows are consistently nested as sub-rows (`class="sub"`/`class="sub2"`) directly beneath the compound word they decompose, inside the same `voc-box` table used for ordinary vocabulary — not a separate grammar-only construct.

**Chapters 25-36:**

# ja Book Conventions

This is *Japanese for Busy People Book 1: Kana*. The 12 files span Lesson 8 through the start of Unit 7 (Lesson 14 plus two Quizzes and three Unit-divider pages).


### Pattern-Template Blanks
Two distinct blank styles appear, used for different purposes:

- **Fill-in-the-blank slots the student must write into**: `<span class="blank">` containing a run of literal space characters (e.g. `<span class="blank">           </span>`), always followed by a parenthesized cue word/phrase in Japanese giving the substitution content, e.g. `<span class="blank">           </span> (えいが)`. This appears throughout EXERCISES, in both plain sentence drills and dialogue drills (A:/B: turns). Sometimes the blank sits mid-sentence with no cue, purely for the student to complete a sentence they've composed themselves (e.g. Lesson 8 Ex. VIII: `スミス: <span class="blank">           </span> (グリーンさん、テニス)`).
- **Listening-comprehension blanks** (used only in "Listen to the audio and fill in the blank(s)" exercises): the same `<span class="blank">` markup embedded directly inside a Japanese sentence with no parenthetical cue at all, e.g. `エマさんは ぎんざで <span class="blank">         </span> を かいました。` — the answer must come purely from audio the extraction pass cannot access.
- **Underlined substitution slots** inside worked examples (`e.g.`): `<span class="underline colorU">` wraps the word/phrase in the example sentence that subsequent numbered items are meant to substitute, e.g. `すずきさんは <span class="underline colorU">テレビ</span>を みます。` This is not a blank to fill in — it marks which part of the *given* example the drilled alternatives (in parens after each numbered blank) replace.
- **Quiz-style word-bank fill-ins**: Quiz 2 and Quiz 3 use bare parenthesized blank space with no `class="blank"` wrapper at all, just literal em-space characters between parentheses directly in running text: `エマさんは ( ​ ​ ​ ​ ​ ​ ) にほんに きましたか。` These draw from a word bank shown above in a `<div class="Abox0 dynamic_box">` box (e.g. なん なに だれ いつ どこ どの どれ).

### Attachment-Point Markers (prefixes/suffixes on individual entries)
The wave dash `〜` is used consistently and appears in vocabulary tables as a **sub-row** directly under the full-form entry it decomposes, marked with `<td class="sub">`. Confirmed examples:
- `〜にん` — "…people" (Lesson 8, counter suffix), sub-row under なんにん
- `〜さま` — "Mr., Mrs., Ms., Miss" (Lesson 9), sub-row under すずきさま
- `〜や` — suffix for shop/restaurant (Lesson 9), sub-row under てんぷらや
- `〜ご` — "language" suffix (Lesson 9), sub-row under にほんご
- `ご〜` — honorific **prefix** (Lesson 9), sub-row under ごかぞく — confirms the dash can lead *or* trail depending on prefix vs. suffix
- `〜ぐらい` / `〜じかん` (Lesson 11), `〜って なんですか` (Lesson 12), `〜ごろ` (Lesson 13), `〜でございます` (Lesson 8 speaking practice)

So: whenever a vocabulary table row's Japanese cell is JUST a `〜`-marked fragment, it is always the immediately-preceding row's full entry decomposed into its bound morpheme, using `<td class="sub">` for the fragment row (no `w30`/`w35` width class, unlike normal rows). This is a reliable, book-wide signal independent of the WORD POWER/EXERCISES/NOTES context it appears in.

**Chapters 37-48:**

# ja Book Conventions


### Pattern-Template Blanks

Two distinct notations are used, and they never overlap:

- **Underscored blank runs** for elicited fill-in answers the student writes: `<span class="blank">                 </span>` — literally full-width space characters wrapped in `class="blank"`. Used inside EXERCISES for answers to be filled in (both handwritten-style blanks after a cue and Track/Listen "fill in the blank based on what you hear" items). Seen in every lesson's exercises, e.g. 37.xhtml exercise 3, 39.xhtml exercise 4, 46.xhtml exercise 8, 48.xhtml exercise 8.
- **Underlined substitution spans** `<span class="underline colorU">...</span>` mark the part of an example sentence/dialogue that the student is meant to swap out for an alternative given in parentheses immediately after. E.g. 37.xhtml: `<span class="underline colorU">かとうさん</span>は <span class="underline colorU">にほんしゅ</span>が すきです。` These are not blanks to fill in — they are worked examples showing which words to substitute; the actual student answer for substitution items is usually left as an empty numbered line (`<p class="num-hang spaceabove"><b>1.</b></p>`) or a `class="blank"` span followed by `(alternative words in Japanese in parentheses)`.
- Both notations are consistently paired: a numbered exercise item gives `(word/phrase)` in parentheses as the substitution content, immediately after a `class="blank"` span or an empty numbered slot.
- No bracketed-English-word style (`[noun]`) or bolded-gloss-word style placeholder was seen anywhere in these 12 chapters.
- Quiz 4 (44.xhtml) uses the same `class="blank"` notation for its fill-in items, plus a distinct **word bank** box (see Content Section Markers) supplying the pool of words to conjugate into the blanks.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Found in exactly one vocabulary table row across all 12 chapters: 39.xhtml, WORD POWER section, VOCABULARY table: `<span class="japanese" lang="ja">〜はどうですか</span>` glossed "how about…". The `〜` (wave dash) is used as a prefix placeholder marking that this entry attaches after a preceding noun/phrase. This is the only vocabulary-table row using `〜` as a standalone entry in these chapters — most bound-morpheme entries instead appear as a `td class="sub"` sub-row directly under the standalone/inflected form (e.g. 37.xhtml: `かく` main row, `かきます` as a `class="sub"` row underneath; 47.xhtml: `〜ふん／ぷん (かん)`, `〜か／にち (かん)`, `〜しゅうかん`, `〜かげつ (かん)`, `〜ねん (かん)` — period-counter suffixes, all marked with a leading `〜` directly in the Japanese-column vocabulary entry, no sub-row). 43.xhtml also has `〜の あと` (leading 〜, "after…") with `あと` given as a `class="sub"` row beneath it, and 17.xhtml has `〜の まえに` / `まえ` the same way. So the `〜` wave-dash prefix marker on a standalone vocabulary-table entry is a recurring, if not universal, pattern for particle-like/bound suffix vocabulary, seen in 17.xhtml, 39.xhtml, 43.xhtml and 47.xhtml (all with 〜 preceding the entry, i.e. suffix-attachment only — no example of a trailing 〜 for a prefix-attachment entry like お〜 was found in these 12 chapters).

**Chapters 49-57:**

### Pattern-Template Blanks
- **Grammar-pattern templates** (in the GRAMMAR section) use plain English placeholder words in bold/italic embedded in the pattern line, e.g. `person は verb [て-form] います。` — the slot label ("person", "noun", "verb [dictionary form]") is written directly inline, not a special glyph.
- **Drill/exercise fill-in blanks** use `<span class="blank">` containing literal whitespace (a run of full-width spaces), e.g. `<span class="blank">           </span>`. This appears both mid-sentence (`スミスさんは <span class="blank">...</span> に にほんごを...`) and as a whole blank line for a dialogue turn.
- **Substitution drills** mark the word(s) to be replaced with `<span class="underline colorU">...</span>` in the worked example (`e.g.`), then give blank lines or `<span class="blank">` spans for the student's own answers, with the substitution vocabulary supplied in trailing parentheses, e.g. `<b>1.</b> <span class="blank">...</span> (なかむらさん、いけばな)`.
- Numbered exercise items use `<b>1.</b>`, `<b>2.</b>` etc.; dialogue turns within an item use `A :` / `B :`, or the character's name (`スミス :`, `なかむら:`).

### Attachment-Point Markers (prefixes/suffixes on individual entries)
Confirmed in multiple places, always using the wave dash `〜`:
- **Glossary entries** (chapters 55–56) mark bound prefixes/suffixes directly: `お〜 (honorific prefix)`, `お〜 (polite prefix)`, `ご〜 (honorific prefix)`, `〜さん Mr., Mrs., Ms., Miss`, `〜さま` (more polite than さん), `〜じん` (person/nationality suffix), `〜ご` (language suffix), `〜や` (suffix for shop/restaurant), `〜たち` (plural suffix for people), `〜め` (ordinal-number suffix), `〜べき`-style counters (`〜かい/がい`, `〜にん`, `〜ほん/ぼん/ぽん`, `〜まい`), and time-period suffixes (`〜ふん/ぷん`, `〜じかん`, `〜にち`, `〜しゅうかん`, `〜かげつ`, `〜ねん`, `〜ど`). These appear as standalone glossary rows, not embedded in a larger sentence.
- **Appendix "Particles" table** (ch. 54) lists each particle (は, を, が, に, で, と, etc.) as its own row with example sentences — no wave-dash there since particles are unbound.
- **Appendix D "Verbs"** section explicitly notes some verb-noun collocations take を and some don't (e.g. べんきょうします vs コピーします), phrased in prose, not with a dash marker.
- No instance of a prefix/suffix marker was found mid-vocabulary-table inside a lesson chapter (49–53) using a wave dash directly on a bare morpheme in a table row — lesson-chapter vocabulary tables (see below) show full inflected/derived forms as complete words instead (e.g. `いもうとさん`, not `いもうと〜さん`), so the wave-dash convention is essentially confined to the Appendixes and the two Glossaries.

## Content Section Markers

**Chapters 1-12:**

- Japanese-language text is consistently wrapped in `<span class="japanese" lang="ja">…</span>`, everywhere it appears (TOC preview lines, grammar examples, abbreviation table, etc.). This is the single most reliable signal for "this span is Japanese content."
- Lesson entries in the TOC (file 6) use a nested-heading style: `<p class="toc_less"><a href="…"><span class="l_text"><span class="l_box">LESSON <b><span class="l_no">N</span></b></span> <b><span class="l_text0">Title</span></b></span></a></p>`. The very first lesson under a unit uses class `toc_less`; subsequent lessons in the same unit use `toc_less1`.
- Units are marked `<p class="toc_unit"><a href="…"><span class="blue">UNIT <b><span class="u_no">N</span> TITLE</b></span></a></p>`.
- "CAN-DO" goals use `<p class="toc_can"><span class="c_text">CAN-DO</span></p>` followed by `<p class="toc_can_hang">` rows, each prefixed with an inline square-bullet image (`…_squ.jpg`, class `inline height_0-5em`) then bolded English text.
- "WORD POWER" sections use `<p class="toc_word">WORD POWER</p>` followed by a `<div class="word_box">` containing `<p class="toc_word_hang"><span class="t_gray">•</span> <a href="…">Topic name</a></p>` rows — these are topic-label links into the lesson file, not the vocabulary itself.
- Quizzes and casual-style interludes are marked as their own TOC-level entries: `<p class="toc_quiz"><a href="…"><span class="blue big_b">●</span> <b>QUIZ N</b></a></p>` (same markup reused for `CASUAL STYLE 1` / `CASUAL STYLE 2`).
- Front-matter body sections (Preface, Introduction, Characteristics of Japanese Grammar) use `<h1 class="fm_head">` (or `fm_head1`) for the page title and plain `<p>`/`<p class="indent">`/`<p class="spaceabove">` for body prose, with `<b>` used for bolded sub-heads like **Aims**, **FREQUENTLY USED EXPRESSIONS**, **UNIT STRUCTURE**, etc. (file 9, Introduction).
- Numbered grammar-note lists use `<div class="custom_list" role="list">` with `<p class="list_ul" role="listitem"><span class="list_ornament">N. </span>text</p>` (file 10).
- A short-form example table pattern recurs for illustrating a grammar point inline: `<div class="marginL"><p class="left">e.g.</p><table>...</table></div>`, each row pairing a Japanese `<td>` (with a `<span class="underline">` around the specific grammatical element being illustrated) against an English gloss `<td>` (file 10).

**Chapters 13-24:**

Real teaching content is organized into a small, consistent set of `<h2>`-headed blocks per lesson, always in this order: **TARGET DIALOGUE** (`class="track_head"`, wrapping a `div class="track"` > `div class="track-pad"`), **VOCABULARY** (`div class="voc-box"` > `div class="voc-boxS"` > `table class="voca"`, two-column rows: Japanese term in `td class="w30"`/`w35`/`w40` etc., gloss in the remaining-width `td`), **NOTES** (`h2 class="note"`, an `<ol>` of numbered `<li class="number_list">` explanatory entries, each starting with the Japanese phrase being explained then serif-class prose), **KEY SENTENCES** (`div class="key-sentence-box"` > `div class="key-sentence-sub"`, containing two parallel `custom_list` blocks — Japanese numbered list then English numbered list, same ordinals), **GRAMMAR** (`h2 class="grammer"`, numbered `<p id="cNN-nX">` points each tagged with a `class="key-sentence-ref"` back-reference like "(KS1)"), and **WORD POWER** (`h2 class="word-power"`, a `custom_list` of labeled sub-lists `t01`, `t02`... each introduced by a roman-numeral image ornament `wnum-I.jpg` etc. and a bold English category title, e.g. "Countries and nationalities", "Numbers", "Time expressions"). Dialogue lines use `p class="spkr"` (speaker name, Japanese) immediately followed by `p class="dial"` (the line, Japanese), then the same spkr/dial pairing repeats in English translation later in the same `dialogue` div — English speaker labels use romanized names ("Smith:", "Nakamura:"). Audio-linked headings carry a trailing `<span class="audio-icon"><img .../></span>`.

**Chapters 25-36:**

Each lesson (`<div class="sans" id="cNN">`) follows a fixed heading sequence, each an `<h2>` with a distinctive class, in this order:
1. `<h2 class="track_head">` — **TARGET DIALOGUE**, wraps a `<div class="track"><div class="track-pad">` containing the dialogue itself (`<div class="dialogue">` with alternating `<p class="spkr">` / `<p class="dial">` pairs, Japanese first then the full English translation repeated in the same structure lower down) and a `<p class="sq-hang">`/`<p class="sq-hangT">`/`<p class="sq-hangb">` narrative-summary line pair (Japanese, then English) marked with a small square icon image.
2. `<h2 class="note">` — **NOTES**, an `<ol>` of `<li class="number_list">` items, each a short Japanese phrase followed by an English explanation paragraph, both wrapped in `<p class="number_list serif">`.
3. `<h2 class="head">` inside `<div class="key-sentence-box">` — **KEY SENTENCES**, two parallel `<div class="custom_list">` lists (Japanese numbered 1./2./3., then English numbered 1./2./3.) inside `<div class="key-sentence-sub">`.
4. `<h2 class="grammer">` — **GRAMMAR**, numbered explanation blocks `<p id="cNN-nX">` with a bolded pattern-template heading, a `<p class="key-sentence-ref">` cross-reference like `(KS1, 2)`, and explanatory prose. May embed a paradigm/pattern `<table class="tab1">` directly (e.g. Lesson 10's adjective-type tables) or an embedded reference-chart image (Lesson 11's tense-conjugation table, see below).
5. `<h2 class="word-power">` — **WORD POWER**, a `<div class="custom_list">` of `role="listitem"` blocks, each numbered with a roman-numeral icon (`wnum-I.jpg` etc.) and a bold category label (e.g. "Food and drink", "Verbs", "い-adjectives"). Individual items are either `<figure class="figure...caption">` (image + `<figcaption>` giving the Japanese label directly in text) or a `<div class="marginL1">` list of circled-number (①②③…) Japanese terms with no image.
6. `<h2 class="exer">` — **EXERCISES** (see below).
7. `<h2 class="speak-prac">` — **SPEAKING PRACTICE**, numbered `role="listitem"` blocks each with an audio icon, a short English scene-setting sentence, and a `<div class="dialogue1">` (same spkr/dial structure as TARGET DIALOGUE).
8. `<div class="active-comm">` — **Active Communication**, a banner image plus one or more free-conversation prompts (English instructions, no Japanese, nothing to extract as vocab).

`<div class="voc-box">`/`<h3 class="voc">VOCABULARY</h3>` boxes recur after almost every section (dialogue, notes, grammar, word power, each exercise, speaking practice) — vocabulary is scoped locally to the section immediately above it, not consolidated at the end of the lesson. A `<table class="voca">` row's two `<td>` cells are always [Japanese term, English gloss]; a `<td class="sub">` row (no width class) is a decomposed bound-morpheme sub-entry of the row above it (see prefix/suffix section).

Between lessons, two other content types appear:
- **Quiz** files (Quiz 2 = ch27, Quiz 3 = ch35): `<h1 class="quiz-head">Quiz N <span class="quiz-small">(Units X-Y)</span></h1>`, no TARGET DIALOGUE/NOTES/GRAMMAR/WORD POWER — just a `<div class="custom_list">` of numbered exercises identical in markup to lesson EXERCISES.
- **Unit divider** files (ch28, ch31, ch36): trivial — one `<h1>`-style banner image and a single `<p class="opener">` of cultural-background English prose, no Japanese content at all, nothing to extract.

**Chapters 37-48:**

- Each lesson (`<div class="sans" id="cNN">`) opens with `<h1>` as an `<img>` banner (the lesson title is baked into a raster image, with the real text duplicated in the `alt` attribute — extractable from `alt`, not visible as text otherwise).
- **TARGET DIALOGUE**: `<h2 class="track_head">` heading containing `<span class="target">`, followed by `<div class="track"><div class="track-pad">`. Dialogue lines use `<p class="spkr">` (speaker name) / `<p class="dial">` (line) pairs inside `<div class="dialogue">`. Stage directions appear as `<p class="dialM">(<i>...</i>)</p>` or inline `(<i>...</i>)` in a dial/spkr paragraph. A one-line dialogue summary/moral, prefixed by a small square icon image (`squ.jpg`) inside `<p class="sq-hang">`, closes the dialogue in Japanese, then its English translation repeats the same `sq-hang` treatment. English translations of the whole dialogue follow directly after, reusing the same `spkr`/`dial` classes inside the same `track-pad` div (not a separate section) — Japanese and English are not visually separated by a heading, only by span/class repetition.
- **VOCABULARY**: `<div class="voc-box"><h3 class="voc">VOCABULARY</h3><table class="voca">`. Each vocabulary table row is a `<tr>` with a Japanese-language `<td>` (`class="w30"`/`w35`/`w40"` etc., left column) and an English gloss `<td>` (right column, wider). A bound/derived sub-entry (a conjugated or compound form of the entry above it) is marked with `<td class="sub">` on the Japanese cell, indented, with no `w..` width class — this is how the book shows "base word → this table's target form" without a separate heading. VOCABULARY boxes recur throughout a lesson (after the dialogue, after GRAMMAR, inside WORD POWER, inside individual EXERCISES items, and at the end near SPEAKING PRACTICE) — vocabulary is scoped locally to the section it follows, not centralized.
- **NOTES**: `<h2 class="note">NOTES</h2>` followed by either an `<ol>` of `<li class="number_list">` items or a `<div class="custom_list" role="list">` of `<p class="list_ul">` items — both patterns are used interchangeably across chapters (e.g. 37/39/43 use `<ol>`; 42/43(second NOTES)/48 also use `<ol>`, while 43's first NOTES block and 39's use `custom_list`). Content is a specific dialogue line quoted in Japanese, followed by an explanatory paragraph in English/serif.
- **KEY SENTENCES**: `<div class="key-sentence-box"><h2 class="head">KEY SENTENCES</h2>`, containing a `<div class="key-sentence-sub">` with two parallel `<div class="custom_list" role="list">` blocks — first the numbered Japanese sentences, then the same numbers repeated in English. These are the canonical model sentences a GRAMMAR point is drawn from, and are cross-referenced from GRAMMAR via `<p class="key-sentence-ref sans">(KS1)</p>`-style tags.
- **GRAMMAR**: `<h2 class="grammer">GRAMMAR</h2>` (note the misspelling in the class name — consistent across all lessons), then a `<div class="serif">` with numbered `<p id="cNN-nX">` headers (bold, pattern template in mixed Japanese/English, e.g. "person は noun が すきです。"), each immediately followed by `<p class="key-sentence-ref sans">(KSn)</p>` linking back to KEY SENTENCES, then explanatory prose. Some points include an inline `e.g.` example in a `<div class="marginL...">` table or paragraph, and grammar tables (conjugation charts) are sometimes plain HTML `<table>` (e.g. 39.xhtml's ます/ませんか/ましょう table) and sometimes a raster image (see Image-Embedded Content) — both occur, so presence of a chart is not a reliable signal of HTML-vs-image; must check per instance.
- **WORD POWER**: `<h2 class="word-power">WORD POWER</h2>`, a `<div class="custom_list" role="list">` of numbered sub-groups, each with a roman-numeral ornament image (`wnum-I.jpg` etc.) and a bold category label ("Sports", "Verbs", "Hobbies", "Periods", etc.). Individual vocabulary items are usually `<figure class="figure figure_small_caption">` (or `figure_medium_caption`) wrapping an illustration `<img>` plus a `<figcaption class="figcaption dynamic_box">` giving a circled-number + Japanese word (e.g. `①すき(な)`). Purely tabular WORD POWER content (numbers/times/periods) instead uses a plain `<table class="tab1...">`.

**Chapters 49-57:**

Each numbered lesson (chapters 50–51 pattern) follows a fixed sequence of `<h2>`-headed blocks, all direct children of `<div class="sans" id="cNN">`:
1. **`<h1>`** with an `<img>` banner — lesson title is baked into the image `alt` text (e.g. `alt="LESSON 23: Explaining Actions..."`), not present as real text elsewhere.
2. **`<div class="track">`** — the **TARGET DIALOGUE**, headed `<h2 class="track_head"><span class="target">TARGET DIALOGUE</span>` plus an audio icon. Dialogue lines use `<p class="spkr">` (speaker name + colon) alternating with `<p class="dial">` (the line), first in Japanese (`<span class="japanese" lang="ja">`), then repeated in English translation. A one- or two-line English **summary** sentence sometimes follows, prefixed with a small square glyph image: `<p class="sq-hang"><span class="figure_inline"><img .../></span> <span class="japanese">...</span></p>`.
3. **`<div class="voc-box">`** — a **VOCABULARY** box, headed `<h3 class="voc"><span class="voc">VOCABULARY</span></h3>`, body `<div class="voc-boxS"><table class="voca">` with two-column rows (`class="w30"`/`"w70"` or similar): Japanese term, then English gloss. A sub-entry showing a term's base form uses `<td class="sub">`. Vocabulary boxes recur after almost every subsection (dialogue, notes, grammar, word power, each exercise) — vocabulary is scoped locally to the block it follows, not consolidated once per lesson.
4. **`<h2 class="note">NOTES</h2>`** — an `<ol>` of `<li class="number_list">`, each giving a quoted phrase then a prose grammar/usage note (sometimes multiple quoted lines before the note, when the note covers a contrast between two sentences).
5. **`<div class="key-sentence-box">`** — **KEY SENTENCES**, headed `<h2 class="head">KEY SENTENCES</h2>`, with two parallel `<div class="custom_list">` lists (Japanese numbered 1–4, then English numbered 1–4) using `<span class="list_ornament">`.
6. **`<h2 class="grammer">GRAMMAR</h2>`** — numbered grammar points (`<p id="cNN-nX"><b>N. pattern</b></p>`), each followed by `<p class="key-sentence-ref sans">(KS1, 2)</p>` cross-referencing the Key Sentences, then prose explanation, sometimes an example table (`<table>`, no distinguishing class beyond generic tables).
7. **`<h2 class="word-power">WORD POWER</h2>`** — a `<div class="custom_list">` of numbered sub-groups (`①`, `②`… via `wnum-*.jpg` roman-numeral icon images), each item a `<figure class="figure figure_small_caption">` with an illustration `<img>` and a `<figcaption class="figcaption dynamic_box">` giving the Japanese term (no English gloss inline — glosses are in the following VOCABULARY box).
8. **`<h2 class="speak-prac">SPEAKING PRACTICE</h2>`** — numbered mini-dialogues, structurally identical to the Target Dialogue's `<div class="dialogue1">` (note: `dialogue1` not `dialogue`), each with its own scene-setting sentence, audio icon, and often a following NOTES block and/or `<div class="active-comm">` **Active Communication** prompt (an image-headed banner + a free-response prose task, sometimes as an `<ol>` of numbered tasks).

## Exercise Section Markers

**Chapters 1-12:**

None of the 12 files given contain actual Exercise/Drill content — Exercises live in the per-lesson files (`c01.xhtml`, etc.), which are outside this batch. The Introduction (file 9) describes prose-only what Exercises will contain (five sub-types: vocabulary/conjugation repetition, sentence-pattern drills, substitution/dialogue drills, conversation practice, listening practice) but this is descriptive front matter, not the markup itself. The extraction pass should expect to derive actual exercise markup empirically once it opens a lesson file.

### Reference Material Inside Exercise Sections

Not applicable / not observed — no exercise sections exist in this 12-file batch.

**Chapters 13-24:**

The **EXERCISES** section (`h2 class="exer"`) is a `custom_list` of `div role="listitem"` blocks, each introduced by a roman-numeral ornament image (`enum-I.jpg`, `enum-II.jpg`, …) and, when the drill has a natural-language instruction, a `<span class="serif"><b><i>…instructional sentence…</i></b></span>` (e.g. "*State someone's nationality.*"). Some list items instead open with plain prose ("Make up sentences following the patterns of the examples…") with no italic instruction line — both forms occur, sometimes on the same page. Drills are subdivided with bold-lettered sub-parts `A.`/`B.`/`C.` (`class="UA-hang"`), each preceded by its own italic instruction. The worked example is always `class="eg-hang"` / `eg-hangA` / `eg-hangB` / `eg-spkr` prefixed with `<b>e.g.</b>`, followed by numbered blank items (`class="num-hang"`, `num-hangA`, `num-hangB`) containing `<span class="blank">` slots and parenthetical substitution cues. A trailing **SPEAKING PRACTICE** section (`h2 class="speak-prac"`) at the end of each lesson is structurally a set of `dialogue1`-class full dialogues (spkr/dial pairs, Japanese then English) — narrative practice conversations, not blank-fill drills — each followed by a scene-setting sentence in plain `<p>` before the dialogue.

Listening exercises are the final EXERCISES item, always titled "Listen to the audio and fill in the blanks/choose the correct answers", carrying a distinctive image `audio-0NN-0NN.jpg` icon (a paired/ranged filename, unlike the single-frame `audio-0NN.jpg` icon used elsewhere) and either `<span class="blank">` fill-ins or lettered-circle multiple choice options (`ⓐ`/`ⓑ`/`ⓒ`).

### Reference Material Inside Exercise Sections

- **Chapter 20 (L6, EXERCISES I):** a verb-conjugation paradigm table (present/past × affirmative/negative for いきます "go" and きます "come") printed as `table class="tab1"` with the instruction "*Practice conjugating verbs.* Repeat the verbs below and memorize their forms—present and past, affirmative and negative." This is reference material given the explicit "repeat and memorize" framing, not a drill, despite sitting as EXERCISES item I and using the same table markup as the GRAMMAR-section conjugation chart earlier in the same lesson.

**Chapters 25-36:**

`<h2 class="exer">EXERCISES</h2>` wraps a `<div class="custom_list">` of `role="listitem"` blocks, each numbered by a roman-numeral icon (`enum-I.jpg`, `enum-II.jpg`, …). Each item's `<p class="list0">` gives the instruction line, frequently including an italic bold task description like `<span class="serif"><b><i>State what someone will see.</i></b></span>`. Sub-parts within one exercise item are lettered A./B./(C./D.) via `<p class="UA-hang"><span class="sans"><b>A.</b></span>...`.

Recurring structural cues inside an exercise item:
- `<p class="eg-hang">` (or `eg-hangA`/`eg-hangB` for dialogue A/B turns) marked with `<b>e.g.</b>` — the worked example.
- `<p class="num-hang">` (or `num-hangA`/`num-hangB`) with a bold number — the student's blank items to complete, using the `<span class="blank">` + parenthetical-cue pattern described above.
- Picture-cue exercises embed `<div class="figure figure_small/medium">` images directly beside the numbered blanks with no caption text — the image itself is the only content driving that item (confirmed decorative/prompt-only, see Image-Embedded Content below).
- The very last exercise item in a lesson is consistently the audio-only "Listen to the audio and fill in the blank(s) based on the information you hear" item, using in-sentence `<span class="blank">` markers with no parenthetical cue (unrecoverable from text alone).

**Chapters 37-48:**

`<h2 class="exer">EXERCISES</h2>` opens a `<div class="custom_list" role="list">` where each `<div role="listitem">` is one numbered exercise, headed by a roman-numeral ornament image (`enum-I.jpg`, `enum-II.jpg`, …) and a task instruction in `<span class="serif"><b><i>Task description.</i></b></span>` (italic imperative, e.g. "*State what someone likes and is skilled at.*"), sometimes followed by plain (non-italic) instruction text ("Make up sentences following the pattern of the example…"). Distinguishing exercise items from content: exercise items are always inside the `class="exer"`-headed block, always carry the enum-* ornament image, and their worked example is tagged `<span class="serif"><b>e.g.</b></span>` (vs. content's KEY SENTENCES/dialogue which carry no "e.g." marker). Sub-parts within one exercise item are lettered `<span class="sans"><b>A.</b></span>`, `<b>B.</b>`, etc.; individual numbered items within a sub-part are `<p class="num-hang...">`. Fill-in-the-blank listening items are the last item in most lessons' EXERCISES, marked with an audio-icon image immediately before the enum ornament and instruction text "Listen to the audio and fill in the blanks based on the information you hear." — a reliable textual marker for the listening-cloze exercise type specifically (distinct from other blank-based exercises that are read/write substitution drills, not audio-cloze).

### Reference Material Inside Exercise Sections

- **37.xhtml**, EXERCISES item I: "*Practice conjugating な-adjectives.*" — "Repeat the adjectives below and memorize their forms—present and past, affirmative and negative," backed by a conjugation-chart image (`Page_146_Image_0001.jpg`). This is reference material (a paradigm to memorize), not a drill, despite sitting inside the EXERCISES `custom_list` alongside genuine drills IV ("*Practice conjugating verbs.*" — dictionary-form chart image) as items in the same numbered sequence.
- **38.xhtml** (Casual Style 1), not itself inside a lesson's EXERCISES block, but its two comparison tables (です／ます-style vs. casual style; adjective conjugation in casual style) are the same "memorize this paradigm" reference-table pattern, using plain HTML `<table>` rather than exercise numbering.
- **39.xhtml**, WORD POWER item IV: "Variations on ます-form" — an HTML table (not image) laying out V ます / V ませんか / V ましょう for four verbs — reference paradigm, sits in WORD POWER rather than EXERCISES here.
- **43.xhtml**, EXERCISES item I: "*Practice making て-forms.*" — "Change the following verbs to their て-forms" is itself an actual drill (student changes each verb), but WORD POWER item I ("て-form") on the same page is the accompanying reference chart image for that same conjugation, sitting outside EXERCISES.
- **44.xhtml** (Quiz 4), item II: a boxed word list `<div class="Abox0 dynamic_box">` containing `します　じょうずです　すきです` is a reference word-bank the student draws from to fill quiz blanks — distinct markup (`Abox0`) from both blanks and vocabulary tables; this is reference material supporting the quiz, not a drill itself.
- **46.xhtml**, EXERCISES item I: "*Practice conjugating verbs.*" — "Repeat the verbs below and memorize their dictionary forms and て-forms," backed by an HTML `<table class="tab1 FS-95">` (ます-form / dictionary form / て-form columns) — same "memorize the paradigm" instruction pattern as 37/43, this time as an HTML table rather than an image.
- **47.xhtml**, EXERCISES item I: same pattern again — "Repeat the verbs below and memorize their て-forms," HTML table.
- **48.xhtml**, EXERCISES item I: "*Practice making ない-forms.*" is an actual drill (change each verb), while WORD POWER item II (ない-form) on the same page carries the reference chart image for that paradigm, outside EXERCISES.

The recurring signal across all of these: an instruction reading "Repeat/memorize the [X] below and memorize their forms" (or the chart appearing under a WORD POWER numeral rather than paired with a fill-in task) marks reference material; an instruction reading "Make up sentences/dialogues following the pattern," "Change the following X to Y," "Ask and answer," "State/Describe/Ask/Invite/Give/Tell…" marks an actual drill.

**Chapters 49-57:**

`<h2 class="exer">EXERCISES</h2>` opens a `<div class="custom_list">` of `role="listitem"` blocks, each prefixed by a roman-numeral icon (`enum-I.jpg`, `enum-II.jpg`, …). Each item's instruction line is `<span class="serif"><b><i>task description</i></b></span>` followed by plain-text elaboration ("Make up sentences following the pattern of the example..."). Drill body markup:
- `<div class="marginL1">` wraps the actual drill content.
- Worked example: `<p class="eg-hang">` / `<p class="eg-hangA">`+`<p class="eg-hangB">` (dialogue) with `<b>e.g.</b>` label, using `<span class="underline colorU">` on the words to be substituted.
- Student items: `<p class="num-hang">`/`<p class="num-hangA">`/`<p class="num-hangB">` with `<b>N.</b>` numbering, blanks as `<span class="blank">`, substitution vocab in trailing parens.
- A "Listen to the audio and fill in the blanks" item always carries an `<span class="audio-icon">` with a filename like `audio-227-229.jpg` (a page-range audio cue), distinguishing dictation exercises from ordinary substitution drills.
- Quiz chapters (ch. 52) reuse this same `custom_list`/`role="listitem"` shape but under `<h1 class="quiz-head">Quiz N <span class="quiz-small">(Units X-Y)</span></h1>`, with icon files named `qnum-*.jpg`/`Q_*.jpg` instead of `enum-*.jpg`, and item types include a word-bank box (`<div class="Abox0 dynamic_box">`) for multi-blank particle-choice questions.

### Reference Material Inside Exercise Sections
- **Chapter 49 (Lesson 23), Exercise I**: a `て-form` conjugation table (`ます`-form / `ています`-form affirmative / negative, for 4 verbs) explicitly framed as "Repeat the verbs below and memorize their ています-forms" — reference material, not a drill, sitting as the first item inside `EXERCISES`.
- **Chapter 51 (Lesson 24), Exercise I**: the same conjugation-table pattern (live/be-employed/know verbs, ます/ています aff./neg.), again introduced with "Repeat the verbs below and memorize..." and including footnoted asides (`*ます-form is hardly ever used.`) — reference material embedded in the exercise list.
- Both of these are markup-identical to a genuine drill table (`<table class="FS-95">` or `<table class="tab1 FS-95">`) and are only distinguishable from a drill by the instruction's imperative ("repeat and memorize" vs. "make up sentences/dialogues following the pattern").

## Image-Embedded Content

**Chapters 1-12:**

- **File 2 (`chapters/2.xhtml`, "Hiragana")**: `alt="Hiragana"` — a single full-page **reference chart image** (`Page_268_Image_0001.jpg`) laying out the entire hiragana syllabary (main table, dakuten/handakuten table, and the compound-sound きゃ/しゃ/etc. combinations) as a picture with stroke-order numerals. Confirmed by opening the image: this is a pure kana reference chart, no glosses or extraction-relevant vocabulary.
- **File 3 (`chapters/3.xhtml`, "Katakana")**: `alt="Katakana"` — same structural pattern as file 2 (a single `Page_269_Image_0001.jpg` inside `<div class="figure_nomargin">`), almost certainly the katakana equivalent reference chart. Not opened directly, but the markup and alt text are identical in shape to the confirmed hiragana chart, so it should be treated the same way (reference chart, not extraction content).
- **File 11 (`chapters/11.xhtml`, "Frequently Used Expressions")**: **content-bearing images** — six images (`Page_xviii_Image_0001/0002/0003.jpg`, `Page_xix_Image_0001/0003/0004.jpg`), each with empty `alt=""`. Opening them confirms each is a comic-panel-style illustration containing multiple numbered expressions (①–⑮), where the Japanese phrase, its English gloss, and (for several entries) a usage note in parentheses are all drawn directly into the image alongside the illustration — e.g. "⑥ しつれいします。(Said when entering another person's room.)" and "⑧ A: おさきに しつれいします。 / B: おつかれさま(でした)。" with attributed dialogue letters (A/B/C). **This entire section's content is only reachable by opening the images** — the surrounding XHTML has no extractable text beyond the page heading and empty-alt `<img>` tags. The per-chapter extraction pass must open all six images for this section rather than relying on markup.
- **File 9 (`chapters/9.xhtml`, "Introduction")**: contains a small recurring **decorative/functional icon** — `Page_xiv_Image_0001.jpg` reused as a down-arrow between steps in a "how to use this book" table (`class="height_0-6em"`, empty alt) — this is UI/navigational furniture, not content. The same file also contains twelve **labeled character-portrait images** (`Page_xvi_Image_0001` through `0012`, all empty `alt=""`) introducing the book's recurring fictional cast; each sits inside a `<figure class="figure figure_small_caption">` with a `<figcaption>` giving the real descriptive text (name, nationality, role) in HTML, not in the image — so these are decorative/illustrative portraits whose actual informational content is already available as plain text in the caption, not something the extraction pass needs to open the image for.
- **File 6 (Contents)** and other front-matter files repeatedly use a tiny inline square-bullet icon (`…_squ.jpg`, `class="inline height_0-5em"`) before each CAN-DO line, and file 11's heading uses an **inline audio-icon image** (`class="audio-icon"` wrapping an `<img class="inline height_1-0em" src="…audio-001-015.jpg">`) next to "FREQUENTLY USED EXPRESSIONS" — both are recurring **inline functional icons** (bullet marker / "audio available" signal), not unique content, and can be recognized and skipped by their small `height_0-5em`/`height_1-0em` inline sizing and empty alt text.
- **File 4 (Title Page)** and **File 1 (Cover)**: single full-bleed cover/title images (`class="fill_height"` or similar), purely decorative book-jacket art, not content.

**Chapters 13-24:**

No chapter in this set (13–24, i.e. Unit openers + Lessons 1–7 + Quiz 1) was found to contain content-bearing images (images that are themselves the sole carrier of vocabulary/phrase text) or reference charts rendered purely as images with no parallel text. All images checked are one of:
- **Illustrative WORD POWER photos/drawings** (e.g. countries flags-style grid in ch.14 L1, home-appliance photos in ch.18 L4, destination photos in ch.20 L6) — every item pictured is also spelled out in adjacent Japanese text (numbered ①②③… labels in a `marginL1` list or `figcaption`) directly beside or below the image, so the image is a visual aid to vocabulary that already exists as extractable text, not the sole source.
- **Unit-opener banner images** (ch.13, 15, 17, 19 — one per Unit divider) — a single full-width JPEG carrying the unit title as embedded art (`alt="UNIT 2: SHOPPING"` etc.), decorative/title-only, with the actual unit-introduction prose given separately as a normal `<p class="opener">` paragraph in the same file.
- **Exercise illustration photos** (e.g. price-tag photos in ch.18 EXERCISES, item photos in ch.19) — support a drill the student answers about ("state each item's price") but carry no text of their own; the answer content comes from parenthetical cues in the surrounding markup, not from reading the image.
- **Numbered/lettered "wnum"/"enum"/"qnum" ornament icons** — small inline glyphs marking list ordinals (word-power roman numerals, exercise roman numerals, quiz roman numerals); pure UI furniture.

**Recurring decorative/inline-icon patterns to ignore:** `<img class="inline height_1-0em" .../>` audio-icon images beside headings (TARGET DIALOGUE, KEY SENTENCES, WORD POWER sub-lists, numbered SPEAKING PRACTICE items) — these mark that audio exists, carry no alt text worth extracting, and the same audio content is always fully transcribed as the surrounding Japanese `<p>` text. Similarly, the "Active Communication" banner image (`Page_008_img01`) recurs verbatim at the end of nearly every lesson as a section-label graphic, decorative only — the actual task text follows as a normal `<ol>`/`<p>`.

**Chapters 25-36:**

- **Content-bearing images** (genuine extraction targets not recoverable from surrounding HTML text):
  - Lesson 8 (25.xhtml), WORD POWER item III "Numbers of people" — `Page_077_Image_0001.jpg`. Verified by opening: a labeled table pairing person-count illustrations with their readings (ひとり, ふたり, さんにん(3にん), よにん(4にん), ごにん(5にん), なんにん) — no accompanying HTML text list, unlike other WORD POWER items in the same lesson.
  - Lesson 9 (26.xhtml), WORD POWER item IV "Adverbs" → "Frequency" — `Page_087_Image_0001.jpg`. Verified by opening: a frequency-scale chart pairing いつも/よく/ときどき/あまり…〜ません/ぜんぜん…〜ません with their English glosses (always/often/sometimes/not often/not at all) and a 100%–0% scale — no HTML text equivalent elsewhere in the chapter.
  - **General rule identified**: within WORD POWER, when an item's image is followed by a `<div class="marginL1">` list of `<p class="left">①/②/③…</p>` Japanese terms, the terms are already given as text and the image is just an illustration. When a WORD POWER item's image has **no** such following text list, treat it as content-bearing and open it — this reliably distinguishes the two extraction-relevant cases in this book.
- **Reference charts/tables as images**: see the "Reference Material Inside Exercise Sections" section above (verb/adjective conjugation tables in Lessons 9, 11, 12, 14, and the adjective-tense table in Lesson 11's GRAMMAR).
- **Labeled diagrams/photos**: not found as a distinct case in these 12 chapters beyond the WORD POWER figure/figcaption pattern (image + caption text, caption already carries the label — see next bullet).
- **Decorative/illustrative images** (verified by opening samples, safe to skip without individual inspection):
  - TARGET DIALOGUE / SPEAKING PRACTICE scene illustrations (e.g. `Page_074_Image_0002.jpg`) — line-art of the dialogue's characters/setting, no text, purely mood/scene-setting.
  - Exercise picture-cue illustrations (e.g. `Page_078_Image_0001.jpg`, labeled "e.g." showing a man eating steak) — these ARE functionally part of the drill (they supply the missing noun/verb for a blank item with no textual cue), but carry no extractable vocabulary text themselves; they visually specify what word the student should supply.
  - WORD POWER `<figure class="figure...caption">` items where a `<figcaption>` already gives the Japanese term as text (e.g. い-adjective/な-adjective/verb illustrations throughout Lessons 8–14) — the image is a generic drawing illustrating the word already present as text; opening these individually is not necessary since the label is already machine-readable.
  - Unit-divider banner images (ch28, ch31, ch36) and the "Active Communication" banner image reused unchanged across every lesson (`Page_008_Image_0001.jpg`) — pure decoration.
- **Inline functional icons**: `<span class="audio-icon"><img ... class="inline height_1-0em" .../></span>` appears next to TARGET DIALOGUE, KEY SENTENCES, WORD POWER item, and audio-based EXERCISES/SPEAKING PRACTICE headings — always a small audio-clip marker, never content. Similarly, numbered-list ornament icons (`wnum-I.jpg`, `enum-I.jpg`, `qnum-I.jpg`, `Q_I.jpg`) inside `<span class="list_ornament">` are just roman-numeral/letter graphics standing in for plain numbering — UI furniture, not content, consistent across all 12 chapters.

**Chapters 37-48:**

Every chapter's `<h1>` lesson-title banner is itself an image with the real title duplicated in `alt` — not a gap, since the title text is always recoverable from `alt`.

- **Conjugation/paradigm charts rendered as images** (reference charts, not unique content, but only extractable by opening the image since no parallel HTML table exists for these specific ones): 37.xhtml `Page_144_Image_0001.jpg` (dictionary-form chart, Regular 1/Regular 2/Irregular verbs) and `Page_145_Image_0001.jpg` (same, dictionary form word-power); 37.xhtml `Page_146_Image_0001.jpg` (な-adjective present/past/aff/neg chart) and `Page_148_Image_0001.jpg` (verb dictionary-form chart); 42/43.xhtml `Page_173_Image_0001.jpg` and `Page_174_Image_0001.jpg` (て-form charts); 48.xhtml `Page_210_Image_0001.jpg` and `Page_211_Image_0005.jpg` (ない-form charts, confirmed by opening: Regular 1/Regular 2/Irregular tables, ます-form vs. ない-form columns, English verb gloss in the left column). These charts carry real vocabulary/conjugation content (English gloss + two Japanese conjugated forms per row) that is not duplicated anywhere else in the chapter's text.
- **Labeled diagrams**: 47.xhtml `Page_201_Image_0009.jpg` ("Parts of the body") — a front/back body illustration with ten circled numbers, each number's Japanese label given as plain text immediately below the image in the HTML (①あたま, ②め, etc.) — so the image itself is unlabeled (just numbered call-outs) and the actual vocabulary text lives in the surrounding HTML, not the image; opening the image only confirms which body region each number points to, useful for disambiguating e.g. 6 vs. 7 (back) vs. 8 (lower back) if that distinction matters to extraction.
- **Exercise scene illustrations with embedded English text**: several EXERCISES/WORD POWER illustration images are not purely decorative — they contain hand-drawn speech-bubble text or captions that carry exercise content not present anywhere in the surrounding HTML. Confirmed by opening: 38.xhtml-adjacent 39.xhtml exercise II illustration `Page_154_Image_0001.jpg` is a 4-panel comic with the cue word "tomorrow" and full English dialogue lines ("Yes. But I'm not good at it." / "Thank you. I'd love to.") drawn directly into the speech bubbles — this is the actual exercise prompt content (what the student must reconstruct in Japanese) and is not duplicated as text anywhere in the chapter. This pattern (numbered illustrated panels carrying the prompt's English content, e.g. "tomorrow," a scenario sketch, or a short English line) recurs across the four-image illustration sets used throughout EXERCISES in 37, 38, 39, 42, 46, 47, 48 wherever an exercise instructs "make up sentences/dialogues based on the illustration/information provided" and no Japanese cue text is given in the surrounding HTML — these illustration sets should be treated as likely content-bearing and opened, not assumed decorative, whenever the accompanying exercise text has no other stated cue content.
- **Reference/illustrative images confirmed decorative** (no unique text, purely an artistic depiction of a word already given in Japanese text via `figcaption`): WORD POWER single-item illustrations, e.g. 37.xhtml `Page_144_Image_0002.jpg` (man eating cake, illustrating すき/な) and 39.xhtml `Page_153_Image_0001.jpg` (fireworks + onlookers, illustrating はなびたいかい) — both confirmed by opening: no text embedded, the Japanese word is already present as a `figcaption` right next to the image. This is the standard WORD POWER pattern (`figure_small_caption`/`figure_medium_caption` + numbered figcaption) and can be treated as decorative/redundant with the caption text across all twelve chapters unless a caption is missing.
- **Inline functional icons**: the audio-clip icon `<span class="audio-icon"><img class="inline height_1-0em" src=".../audio-NNN.jpg"/></span>` appears next to TARGET DIALOGUE, KEY SENTENCES, WORD POWER sub-headings, and listening-cloze EXERCISES items throughout every chapter — this is UI furniture (a play-button glyph) and never carries content; safe to ignore without opening. Likewise the small square icon (`squ.jpg`) prefixing the dialogue-summary line, and the roman-numeral ornament images (`wnum-I.jpg`, `enum-I.jpg`, etc.) used purely as list markers for WORD POWER/EXERCISES items — decorative numbering glyphs, not content.

**Chapters 49-57:**

**Content-bearing images:**
- None found in chapters 49–53, 55–56 that carry unique vocabulary/phrase content not also given as text (WORD POWER items pair an illustration with the Japanese term as real `<span class="japanese">` text in the figcaption, so the image itself is not the sole source of the term — it's a decorative pairing, see below).
- Lesson banner `<h1>` images (`Page_NNN_Image_0001.jpg`) carry the lesson title as picture text with no text-equivalent elsewhere on the page (the `alt` attribute *is* the only text form) — these function as content-bearing for the title only, and the extraction pass should read the `alt` text rather than open the image, since the alt text is present and accurate in every case observed.

**Reference charts/tables as images** — the significant case in this book, all in **Chapter 54 (Appendixes)**:
- `Page_244_Image_0001.jpg`: "Regular 1 verbs" conjugation chart (ます/dictionary/て/ない/た-forms + English meaning), ~30 verbs, alphabetical.
- `Page_245_Image_0001.jpg`: continuation of the Regular 1 verbs chart (remaining の–わ verbs), with a footnote about しります.
- `Page_245_Image_0002.jpg`: "Regular 2 verbs" conjugation chart, same column structure, ~25 verbs.
- `Page_245_Image_0003.jpg`: "Irregular verbs" conjugation chart (きます/します and their compounds, e.g. もってきます, じゅうでんします), same column structure.
- `Page_247_Image_0001.jpg`: Ko-so-a-do words table, "Basic" set (これ/それ/あれ/どれ etc., by thing/+noun/place/direction/people), with English glosses.
- `Page_247_Image_0002.jpg`: Ko-so-a-do words table, "Polite" set (not opened, but same pattern given the "Basic"/"Polite" prose labels immediately preceding each image).
- All of these are genuine reference-chart content only reachable by opening the image — the surrounding HTML has no `<table>` equivalent, just the image tag with empty `alt=""`.

**Decorative/illustrative image pattern:**
- WORD POWER illustration figures (`<figure class="figure figure_small_caption">` with `<img alt=""...>` + `<figcaption>` giving the Japanese term in real text) — the image is a picture of the referent (e.g. a drawing of someone doing calligraphy next to the word しょどう), and the term itself is always duplicated as real text in the figcaption, so these are safely skippable as images since the text is present elsewhere.
- Full-page "Active Communication" banner image (`Page_008_img01`, reused across lessons) — purely decorative section-header art, `alt="Active Communication"`, no unique content.
- Chapter 53's dialogue-illustration image and chapter 57's five full-page images (Kodansha/AJALT marketing pages: series overview, dictionary ads) — decorative/promotional, not textbook content at all.

**Inline functional icons:**
- `<span class="audio-icon"><img class="inline height_1-0em" src=".../audio-NNN.jpg"/></span>` — an audio-clip marker attached to section headings (TARGET DIALOGUE, KEY SENTENCES, WORD POWER groups, SPEAKING PRACTICE items, listening-dictation exercises). Always UI furniture, never content.
- `<span class="figure_inline"><img class="inline height_1-45em" src=".../wnum-I.jpg or enum-I.jpg or qnum-I.jpg"/></span>` — roman-numeral group markers for WORD POWER groups, EXERCISES items, and Quiz items respectively. Pure numbering furniture.
- `<span class="figure_inline"><img class="inline height_0-5em" src=".../squ.jpg"/></span>` — small square bullet glyph prefixing a one-line dialogue summary sentence (`sq-hang` paragraph class). Furniture, not content.

## Other Notes

**Chapters 1-12:**

- Chapters are titled via the standard `<title>` tag as `"<Section Name>, Japanese for Busy People Book 1: Kana"` — the section name before the comma is the reliable human-readable label for what a given file is (Cover, Hiragana, Katakana, Title Page, Copyright, Contents, Preface, Introduction, etc.).
- The TOC (file 6) is a genuinely useful pre-read for the extraction pass on *any* lesson file: for lesson N it gives the exact list of grammar-pattern headings (with anchors like `#c01-n1`) that should appear in that lesson, the CAN-DO goals, and the WORD POWER topic labels — all before the extraction pass even opens the lesson file itself.
- Numbers/counters embedded in Japanese example sentences are wrapped in `<span class="sans">` (e.g. `<span class="sans">３</span> じです`) — a numeral typeface distinct from the surrounding Japanese font, useful as a signal for "this is a numeral/counter token" if that matters to extraction.
- The book explicitly has two parallel editions — a "Kana Version" (this epub) and a "Romanized Version" — mentioned in the Introduction (file 9); irrelevant to markup but useful context if titles or vocabulary ever look unexpectedly kana-only.
- A `<span class="underline">` is used inside inline grammar examples (file 10) to highlight the specific morpheme/particle a numbered grammar note is illustrating (e.g. underlining です or に in an example sentence) — worth recognizing as "this is the point being taught" if similar markup recurs in lesson-body grammar notes.

**Chapters 13-24:**

- **Lesson/unit titling:** Units (odd-feeling chapter files 13, 15, 17, 19, 21 in this set, though this maps to files 13/15/17/19 here — Unit dividers) contain only a banner image plus one `<p class="opener">` cultural-background paragraph in English, no vocabulary/grammar/exercises at all — these are NOT lesson content and should not be expected to yield flashcard material. Numbered Lessons (14, 18, 20, 22, 23 = Lessons 1, 4, 6... etc.) follow the full TARGET DIALOGUE → VOCABULARY → NOTES → KEY SENTENCES → GRAMMAR → (VOCABULARY) → WORD POWER → EXERCISES → SPEAKING PRACTICE → NOTES → ACTIVE COMMUNICATION → VOCABULARY structure described above, consistently, across every lesson chapter checked (Lessons 1–7). Chapter 16 is a **Quiz** (`h1 class="quiz-head"`), structurally distinct — no VOCABULARY/GRAMMAR sections, just two numbered `custom_list` test items with word-bank fill-ins and free-response prompts; no VOCABULARY box accompanies it at all, so any new vocabulary implied by quiz content is not separately glossed there.
- **VOCABULARY boxes recur multiple times per lesson** — not just once after the dialogue. A second (or third, fourth) `voc-box` commonly appears after the GRAMMAR section, inside WORD POWER sub-items, and inside individual EXERCISES items, each scoped to just the new terms introduced in that immediately-preceding block. A single lesson can have 5+ separate `voc-box` tables.
- **English-language glosses for NOTES-referenced phrases**: where a VOCABULARY entry's meaning is fully explained in a NOTES entry rather than glossed inline, the vocabulary table row instead just says `(see NOTES 1, p. 10)` or similar — the gloss must be pulled from the NOTES prose, not the vocab table cell.
- **Cross-reference tags** `(see GRAMMAR 3, p. 4)`, `(see NOTES 2, above)` etc. appear routinely inside vocabulary glosses for particles — these point to the GRAMMAR/NOTES prose in the same file (or an earlier lesson) rather than restating the explanation.
- Numbers/dates/times are written out in hiragana in the WORD POWER teaching tables (ch. 15, 17, 23) with an explicit `NOTE:` disclaiming that the rest of the book uses numerals instead — i.e. hiragana spellings of numbers are a one-time pedagogical table, not the book's ongoing convention.

**Chapters 25-36:**

- Lesson numbering/titling: `<h1 class="width_100"><img alt="LESSON N: Title" .../></h1>` — the lesson number and English title are only present as `alt` text on a banner image, never as separate plain HTML text; the `<title>` tag in `<head>` duplicates this same string plus the series name.
- Quizzes are titled `<h1 class="quiz-head">Quiz N <span class="quiz-small">(Units X-Y)</span></h1>` — real text, not an image.
- Unit dividers are titled via an image `alt` attribute exactly like lessons (`alt="UNIT N TITLE"`), and contain no lesson content structure at all — just a cultural-background paragraph.
- Grammar point cross-references consistently use the format `<p class="key-sentence-ref sans">(KSN, M)</p>` immediately under each numbered grammar point's bold pattern-template line, tying it back to specific KEY SENTENCES items — useful for associating a grammar explanation with the exact target sentence(s) it explains.
- Vocabulary glosses that reference another section use a parenthetical pointer in the English cell itself, e.g. `(see NOTES 1, p. 97)` or `(see GRAMMAR 2, p. 85)` — these are prose pointers, not structural markup, but signal that the gloss is deliberately incomplete and explained at length elsewhere.
- The wave-dash wasn't only used for grammatical particles/suffixes — it's also used generically for "not X" placeholder patterns unrelated to the attachment-point convention, e.g. `あまり…〜ません` and `だれも…〜ません` meaning "(not) very"/"no one," appearing as single vocabulary entries rather than as `<td class="sub">` decompositions. These should not be confused with the true prefix/suffix sub-row pattern described above — the sub-row pattern is specifically identifiable by its `<td class="sub">` markup and its position directly under a parent entry, not by the presence of 〜 alone.

**Chapters 37-48:**

- Lesson numbering/titles: regular lessons use `<h1>` banner images titled "LESSON NN: [English gloss]: [English example sentence]" (e.g. "LESSON 15: Talking about Preferences: I Like Japanese Anime"), extractable from the `alt` attribute and from `<title>`.
- Interstitial, non-lesson chapters occur in this range and have a different structure than numbered lessons: **38.xhtml "Casual Style 1"** (a grammar-comparison essay with HTML comparison tables, no dialogue/vocabulary/exercises at all), **41.xhtml "Unit 8: Business Trips"** (a one-paragraph unit-opener with a full-page banner image and a single `<p class="opener">`, no other content), **44.xhtml "Quiz 4 (Units 7-8)"** (fill-in-the-blank quiz only, no dialogue/grammar/vocabulary sections, uses the word-bank `Abox0` box described above), **45.xhtml "Unit 9: At the Museum"** (unit opener, same minimal structure as 41.xhtml). A per-chapter extraction pass should expect these unit-opener and quiz/casual-style chapters to lack the TARGET DIALOGUE/VOCABULARY/GRAMMAR/WORD POWER/EXERCISES/SPEAKING PRACTICE skeleton that all numbered lessons share.
- **SPEAKING PRACTICE**: `<h2 class="speak-prac">SPEAKING PRACTICE</h2>`, structurally identical to TARGET DIALOGUE (numbered `<div class="dialogue1">` blocks with spkr/dial pairs plus English translation inline), appearing near the end of each numbered lesson, usually followed by a final NOTES block specific to that dialogue.
- **ACTIVE COMMUNICATION**: `<div class="active-comm">` with a small "Active Communication" banner image, closing each lesson with a free-practice prompt in English prose (not Japanese drill content) — a real-world task suggestion, not extractable vocabulary/grammar.
- Vocabulary glossed inline vs. in tables: most new vocabulary appears in the VOCABULARY tables described above, but a handful of grammar-function words (e.g. the particle 〜の, 〜が) are glossed inline inside GRAMMAR prose rather than in a table row, and are cross-referenced by page/lesson (e.g. "see GRAMMAR 3, p. 144").
- Anchor tags `<a id="indNNNa"/>` scattered through vocabulary and dialogue text are index/concordance markers (back-of-book index entries), not content and not translation boundaries — safe to ignore.

**Chapters 49-57:**

- **Chapter/section titling**: Lesson chapters are titled in the epub `<title>` as `Lesson N: <English gloss>, Japanese for Busy People Book 1: Kana`; the visible in-page title only exists as an image `alt`. Non-lesson chapters (Unit opener, Quiz, Casual Style, Appendixes, Glossary, Continued) use analogous but distinct `<title>` patterns.
- **Vocabulary boxes are scoped narrowly**, recurring many times per lesson (after the dialogue, after grammar points, after word power, after almost every exercise item, after speaking practice) rather than being consolidated once. A per-chapter extraction pass should expect to harvest vocabulary from every `voc-box`, not just the first.
- **English translation is always given in-line** immediately after the Japanese in dialogues and Key Sentences (no separate "translations" appendix needed) — but NOT for WORD POWER figcaptions or most Exercise instructions' embedded Japanese, which rely on the reader inferring meaning or looking it up in the trailing VOCABULARY box.
- **The Glossary chapters (55, 56)** are alphabetical indexes (Japanese-English and English-Japanese respectively) with `<p class="gls">` rows, sectioned by kana/alphabet-letter headers (`id="j_1"`..`"j_44"` / `id="A"`..`"Z"`) and a jump-nav bar at top and bottom. These are pure reference/lookup material for the whole book (not just these chapters' lessons) — every vocabulary item introduced anywhere in the book recurs here with its page number, and several rows point to page-image references (e.g. `#Page_040_img02`, `#Page_031_img01`) rather than a normal in-chapter anchor, meaning some numbers/counters in the book are themselves only findable via image on their original page, not this chapter's cache.
- **Casual Style supplement (ch. 53)** is a distinct genre from lesson chapters: no VOCABULARY/EXERCISES/GRAMMAR headings at all, just `<h3 class="sample">SAMPLE DIALOGUE N</h3>` blocks each followed by a two-column comparison `<table class="tab1 serif">` (ですます style vs. Casual style) with a prose grammar note in the right cell.
- **Quiz chapters (ch. 52)** cover multiple units retrospectively ("Quiz 5 (Units 9-10)") and mix particle fill-in, form-conversion, and free-response ("What do you say in this situation?") item types — no VOCABULARY boxes appear in the quiz itself.

## Coverage

**Chapters 1-12:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/1.xhtml: "Cover, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/2.xhtml: "Hiragana, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/3.xhtml: "Katakana, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/4.xhtml: "Title Page, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/5.xhtml: "Copyright, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/6.xhtml: "Contents, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/7.xhtml: "Link to Audio for Exercises, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/8.xhtml: "Preface to the Revised 4th Edition, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/9.xhtml: "Introduction, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/10.xhtml: "Characteristics of Japanese Grammar, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/11.xhtml: "Frequently Used Expressions, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/12.xhtml: "Audio, Script and Answers Download, Japanese for Busy People Book 1: Kana"

**Chapters 13-24:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/13.xhtml: "Unit 1: At the Office, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/14.xhtml: "Lesson 1: Meeting: Nice to Meet You, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/15.xhtml: "Lesson 2: Possession: Whose Pen Is This?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/16.xhtml: "Quiz 1, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/17.xhtml: "Lesson 3: Asking the Time: What Time Is It?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/18.xhtml: "Lesson 4: Shopping (1): How Much Is This?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/19.xhtml: "Lesson 5: Shopping (2): Two Bottles of That Wine, Please, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/20.xhtml: "Lesson 6: Going Places (1): Where Are You Going?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/21.xhtml: "Unit 3: Getting Around, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/22.xhtml: "Lesson 7: Going Places (2): I'm Going by Shinkansen, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/23.xhtml: "Lesson 7: Going Places (2): I'm Going by Shinkansen, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/24.xhtml: "Unit 4: Eating Out, Japanese for Busy People Book 1: Kana"

Note: chapters 22 and 23 share the same `<title>` text ("Lesson 7…") because Lesson 7's content spans both files (23 is the continuation of 22's EXERCISES/SPEAKING PRACTICE); both were read in full.

**Chapters 25-36:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/25.xhtml: "Lesson 8: Doing Things (1): I’m Going to Eat Tempura, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/26.xhtml: "Lesson 9: Doing Things (2): Do You Often Come Here?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/27.xhtml: "Quiz 2, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/28.xhtml: "Unit 5: Visiting a Japanese Home, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/29.xhtml: "Lesson 10: Describing Things: It’s Delicious, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/30.xhtml: "Lesson 11: Describing Impressions: It Was Beautiful, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/31.xhtml: "Unit 6: Weekend Trips, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/32.xhtml: "Lesson 12: Asking about Places: What Is at Nikko?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/33.xhtml: "Lesson 13: Asking for a Place: Where Is It?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/34.xhtml: "Lesson 14: Giving and Receiving: I Received It from My Friend, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/35.xhtml: "Quiz 3, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/36.xhtml: "Unit 7: Making Leisure Plans, Japanese for Busy People Book 1: Kana"

**Chapters 37-48:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/37.xhtml: "Lesson 15: Talking about Preferences: I Like Japanese Anime, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/38.xhtml: "Lesson 16: Making an Invitation: Shall We Go Together?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/39.xhtml: "Lesson 17: Stating a Wish: I Want to Buy a Souvenir, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/40.xhtml: "Casual Style 1, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/41.xhtml: "Unit 8: Business Trips, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/42.xhtml: "Lesson 18: Explaining Plans: I Will Go to Osaka and See Her, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/43.xhtml: "Lesson 19: Making a Request: Please Give Her My Regards, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/44.xhtml: "Quiz 4, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/45.xhtml: "Unit 9: At the Museum, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/46.xhtml: "Lesson 20: Going Places (3): How Do You Go There?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/47.xhtml: "Lesson 21: Asking Permission: May I Have It?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/48.xhtml: "Lesson 22: Forbidding Actions: Please Don't Take Photos, Japanese for Busy People Book 1: Kana"

All 12 chapter files were read in full via the Read tool (each file was short enough to return complete in one read, no truncation encountered). A representative sample of images sitting inside or near content/exercise headings was additionally opened and visually inspected (dictionary-form and ない-form conjugation charts, the labeled body-parts diagram, an exercise illustration panel, and two WORD POWER single-item illustrations) to verify the classifications above; not every one of the roughly 150 illustration images across all 12 chapters was individually opened, but enough were sampled across chapters and image types (reference charts, labeled diagrams, exercise-scene comics, single-item WORD POWER pictures) to establish reliable per-type patterns, which are described in the Image-Embedded Content section above.

**Chapters 49-57:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/49.xhtml: "Unit 10: At Work and After Work, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/50.xhtml: "Lesson 23: Explaining Actions: What Are You Doing Now?, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/51.xhtml: "Lesson 24: Work and Interests: I Work for an Apparel Maker, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/52.xhtml: "Quiz 5, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/53.xhtml: "Casual Style 2, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/54.xhtml: "Appendixes, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/55.xhtml: "Glossary, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/56.xhtml: "English-Japanese Glossary, Japanese for Busy People Book 1: Kana"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters/57.xhtml: "Continued, Japanese for Busy People Book 1: Kana"

## Reference Material Inside Exercise Sections

**Chapters 25-36:**

Every lesson's **Exercise I** is consistently "Practice conjugating verbs" or "Practice conjugating adjectives" — a paradigm table giving present/past × affirmative/negative forms for the vocabulary items already introduced, explicitly framed as "repeat...and memorize their forms," not a drill. This material alternates between being marked up as a real HTML `<table class="tab1">` and being a **single embedded image of the same table** — both forms occur in this book and should be treated identically:
- **HTML table form**: Lesson 8 (25.xhtml) Ex. I (verb table), Lesson 10 (29.xhtml) Ex. I and Ex. IV (い-adj. and な-adj. tables).
- **Image form** (verified by opening the image): Lesson 9 (26.xhtml) Ex. I (`Page_087_Image_0002.jpg`, verb table for でんわを します/おくります/あいます/ききます/おしえます), Lesson 11 (30.xhtml) Ex. I parts A and B (`Page_108_Image_0001/0002.jpg`, い-adj. and な-adj. tables), Lesson 12 (32.xhtml) Ex. I (`Page_117_Image_0013.jpg`), Lesson 14 (34.xhtml) Ex. I (`Page_134_Image_0001.jpg`).

Additionally, Lesson 11's (30.xhtml) **GRAMMAR** section (not an exercise) embeds a reference conjugation table as an image (`Page_106_Image_0001.jpg`, present/past aff./neg. forms for い-adjectives and な-adjectives) rather than as a normal HTML `<table>` — same reference-material character as the exercise-embedded ones, just located in GRAMMAR instead.

## ja Book Conventions

**Chapters 49-57:**

Confirmed: all remaining images in chapter 57 are publisher back-matter advertising, entirely decorative/promotional, no vocabulary content. I now have full coverage of all 9 chapters. Writing the final report.


### Overview
This is *Japanese for Busy People Book 1: Kana* (AJALT, Revised 4th Edition). The 9 chapter files span the tail end of the book: Unit 10 opener (49), Lessons 23–24 (50–51), Quiz 5 (52), a "Casual Style" supplement (53), the Appendixes (54), the Japanese-English Glossary (55), the English-Japanese Glossary (56), and publisher back-matter (57).

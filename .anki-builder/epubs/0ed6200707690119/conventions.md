# ja Book Conventions

## Placeholder Notation

**Chapters 1-12:**

**Book:** *Japanese for Busy People II, Revised 4th Edition* (AJALT / Kodansha USA), confirmed by the title-page image in chapter 6 and the copyright page in chapter 7.

**Scope caveat, important for the extraction pass:** none of the 12 chapter files handed to me contain an actual numbered lesson (Lesson 1-24). All 12 are front matter, back-of-book quick-reference charts, and the opening Culture Notes banner of Unit 1 — the lesson bodies live in files named like `c1DA.xhtml`, `c2BT.xhtml`, `c7TP.xhtml`, etc. (the exact filenames are listed in the table of contents, chapter 8, next to each Lesson's title and grammar points), which are not among these 12 files. Several conventions a per-chapter pass will actually need (how a drill/exercise is marked up, how a Word Power vocabulary table is marked up, how a fill-in-the-blank or attachment-point entry looks on a lesson page) are simply **not observable** from this set and are called out as such below rather than guessed.


### Pattern-Template Blanks

The only pattern-template notation observed in these 12 files is in the table of contents (chapter 8), where each grammar point is previewed as a short pattern with the attaching element elided using the **ASCII tilde `~`** (U+007E — confirmed by direct byte count: 47 occurrences of `~` in chapter 8, zero of the fullwidth wave dash `〜` U+301C or fullwidth tilde `～` U+FF5E). Examples, exact characters:

- `「~たいんですが」`
- `「~が　いいです」`
- `「~てから」`
- `「~なければ　なりません」`
- `「~く／に　なります」` (slash `／` used to separate two alternative attachments in one template)
- `「noun の／adjective　とき」` (English word "noun"/"adjective" used literally as the placeholder label inside an otherwise-Japanese template)

These appear inside `<span class="class_s197e">` (English gloss) followed by a `「...」`-bracketed span (`class="class_s"`) holding the Japanese pattern with the `~`. I cannot confirm whether lesson-body Grammar/Exercise sections use this same `~` convention or a different one (underscores, blank spans, bracketed `[noun]`, etc.) since no lesson body page was in my file set — check an actual lesson file (e.g. `c1DA.xhtml`) before assuming it carries over.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Not observed. No vocabulary table (Word Power/Phrase Power) appears anywhere in these 12 files, so I found no vocabulary-row example of a wave-dash-style prefix/suffix marker (e.g. `〜さん`, `お〜`). This question needs to be re-checked against an actual lesson file's Word Power section.

**Chapters 13-24:**

# ja Book Conventions


### Pattern-Template Blanks

Three distinct blank styles appear, and they are not interchangeable:

1. **Inline running-sentence blanks** (the most common, used inside LESSON exercises): `<span class="class_s191f">                    </span>` — a span holding a run of plain space characters, embedded directly inside an otherwise-complete Japanese sentence so the student writes the missing word/conjugation in place. Example (ch18, `c4DS`, Exercise 3):
   `<span>はい、</span><span class="class_s191f">                             </span><span>と　おもいます。</span>`
2. **Parenthesized particle/word blanks** (used in Quiz chapters 16 `c4AH` and 21 `c7HE`, and in some Quiz-style fill-ins elsewhere): `(<span xml:lang="ja" class="class_s">　　　</span>)` — parentheses containing full-width ideographic space characters, no special class. Example (ch16): `おんせんに　行きたいんです` `(　　　)` `、どこが　おすすめですか。`
3. **Bare empty answer lines**: many exercises give only a numbered prompt and an empty `A :` / `B :` paragraph (or a bare `→`) with nothing following it at all — the student is expected to write out the full sentence by hand, not fill a gap in printed text. Seen throughout, e.g. ch13 (`c1DA`) Exercise 2, ch14 (`c2BT`) Exercise 1, ch19 (`c5HN`) Exercise 1, ch24 (`c7TP`) Exercise 1 and 2.

Word banks supplying the candidate answers for type (2)/(3) blanks sit in a boxed `<div>` just above the items, e.g. `<div class="class_s4b1"><p class="class_sy">を　　に　　が　　と</p></div>` (ch21) or `<div class="class_s3jb"><p class="class_sy">何か　どこか　だれか　いつか</p></div>` (ch15, `c3BM`). Instructions routinely add "Some words are not needed" or "The words can be used only once."

Multiple-choice items use lettered lists `a. b. c. d.` directly below the question (ch16, ch21).

### Attachment-Point Markers (prefixes/suffixes on individual entries)

The book uses the plain **ASCII tilde `~`** (not the fullwidth wave dash 〜) as its one glyph for marking a bound suffix/particle on an entry, and this appears in two separate places:

- **Inside GRAMMAR pattern-template headings**, combined with Japanese fullwidth quote brackets, e.g. `「~たいんですが」` (ch13 `c1DA`, Grammar 2), `「~んです」` (ch24 `c7TP`, Grammar 2), `「~ています」` (ch19/20), `「~でしょうか」` (ch18 `c4DS`, Grammar 4).
- **Directly inside VOCABULARY table rows**, on a single entry, independent of any larger template — e.g. `~の　ほうが` (ch14 `c2BT`), `~に　します` (ch13/14), `~ちゅう` (ch18), `~と　おもいます` / `~ている` (ch18), `~ずつ` (ch19 `c5HN`), and the counter suffixes `~はい/ばい/ぱい`, `~さつ`, `~ぶ`, `~だい`, `~こ` (ch24, Word Power "Numbers and counters"). These confirm the task's premise: a single vocabulary-table row can carry a bare attachment marker with no surrounding template.

A **second, separate convention marks optional honorific prefixes**, not with a tilde but with **parentheses around the prefix itself**: `(お) しろ`, `(お) みこし`, `(お) いわい`, `(お) しょうがつ`, `(お) しはらい` (various VOCABULARY tables, chs. 14, 15, 24). Do not conflate the two: suffix/particle attachment = leading `~`; optional honorific prefix = parenthesized `お` before the entry.

Verb entries in VOCABULARY tables are also tagged `(R2)` when the verb is Ichidan/Regular-2 (e.g. `あびる(R2)`, `はいっている(R2)`, `きる(R2)`, `でかける(R2)`, `おきる(R2)`, `しらべる(R2)`, `たりる(R2)`) — Regular-1 verbs are left unmarked. This is a conjugation-class marker, not a prefix/suffix marker, but sits in the same table cell position and is easy to mistake for one.

**Chapters 25-36:**

# ja Book Conventions


### Pattern-Template Blanks

Two distinct blank notations appear, used in different contexts:

- **Lesson-chapter drill blanks** (EXERCISE, SPEAKING TASK, LISTENING TASK, READING TASK sections): a run of full-width space characters wrapped in a styled span, e.g. `<span class="class_191f">                               </span>`. This is the actual "write your answer here" blank the student fills in. It is frequently paired with a parenthesized answer-hint giving the dictionary/plain form to conjugate, e.g. `(行きます)`, `(あめです)`, `(ひまです)`. Example: Lesson 9 (26.xhtml) EXERCISE 2 — `お金が ありません` → blank → `、何も かいません。` with the hint `(ひまです)` elsewhere.
- **Quiz-chapter blanks** (27.xhtml "Quiz 3", 32.xhtml "Quiz 4"): parenthesized full-width spaces directly in the Japanese sentence text, e.g. `スミスさんは きのう 友だち(　　　)　電話で…` for particle fill-ins, and `(　　)` for true/false marking in 36.xhtml's T/F reading check. This differs from the lesson-chapter span notation — it's plain parenthesized blanks, not a styled span.
- **Multiple-choice quizzes**: lettered options `a.`/`b.`/`c.`/`d.` as separate paragraph lines following a `(　　)` blank in the question stem. Seen only in Quiz chapters (27, 32).
- **Grammar-pattern headers** (not drills): GRAMMAR section `<h3>` titles show the abstract pattern using a tilde to mark the variable slot inside Japanese corner brackets, e.g. 「~たり、~たり」, 「~ながら」, 「~ほうが いいです」, 「~なければ なりません」. This is descriptive notation for the pattern name, not a fill-in-the-blank exercise marker — don't confuse the two.
- Metalinguistic form annotations in English appear in grammar prose (not Japanese text), e.g. `verb [て-form] から`, `verb [ます-form stem] ながら`, `noun/adjective とき`. No bracketed-English-word style blanks (e.g. `[noun]`) were found in these 12 chapters.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Confirmed and common. The book uses a half-width ASCII tilde `~` (not the full-width wave dash 〜) attached directly to the morpheme, in **VOCABULARY table rows**, independent of any larger sentence pattern:

- Suffixes: `~さい` ("…years old," 30.xhtml... actually 29.xhtml), `~じ` ("…characters," 31.xhtml), `~ぶり` ("after…, for the first time in…," 30.xhtml), `~ご` ("…later," 29.xhtml), `~じゅう` ("throughout…" and separately "by the end of…," 29.xhtml and 36.xhtml), `~ぱく`/`~はく` (counter for hotel nights, 31.xhtml), `~メートル`, `~キロ` (units, 26.xhtml/29.xhtml), `~かい` ("…times," 31.xhtml), `~だけ` ("only…," 29.xhtml), `~でしょうか` ("might it be?", 26.xhtml).
- Prefix: `だい~` ("number…," from `だいいち`/`だいさん` in 31.xhtml).
- These appear as standalone vocabulary-table entries, e.g. in 31.xhtml's VOCABULARY table: `<td>~さい</td><td>…years old</td>`, a row entirely separate from any dialogue sentence.
- Separately, the book marks an **optional honorific prefix** with parentheses rather than a tilde: `(お)ひる`, `(お)ふろ`, `(お)かいもの`, `(お)さそい`, `(ご)そうだん`, `(ご)れんらく`. This is a different notation from the tilde-attachment style and should not be conflated with it — parentheses mean "this honorific is optional," not "this is a bound morpheme."
- Sub-entries that gloss only part of a compound headword use a leading full-width space rather than a tilde, e.g. `　もの` (gloss of the `もの` inside `おいしい もの`), `　きゅうか` (gloss of `きゅうか` inside `きゅうかを とる`). This is a third, distinct convention — an indented restatement of a component word, not a prefix/suffix marker.

**Chapters 37-48:**

# ja Book Conventions


### Pattern-Template Blanks

Two distinct blank conventions appear, depending on context:

- **Exercise/quiz fill-in blanks (sentence-internal or sentence-final):** an empty `<span>` (class `class_s191f` or `class_s196w`) containing nothing but a run of full-width ideographic spaces (`　`), e.g. in ch.37 EXERCISE 1: `→　<span class="class_s191f">                                                                               </span>。`. No underscore or bracket characters are used — the blank is pure whitespace wrapped in a styled span. This same span pattern is reused for dictation gaps in LISTENING TASK (e.g. ch.40: `までに　<span class="class_s196w">...</span>　会社に行かなければなりません。`).
- **Single-character/particle blanks attached directly to a word:** a parenthesis pair containing 1–3 full-width spaces, written immediately after the word needing a particle or short answer, e.g. ch.38 Quiz 5: `手(　　)　やけど(　　)　しました。`, and ch.48 READING TASK comprehension checks: `1.  (　　) 日本には山がたくさんあります。`. This same `(　　)` convention is used both for particle-insertion drills and for T/F checkbox answers in LISTENING/READING TASK.
- **"e.g." example marker:** every exercise's given example line (as opposed to the blanks the learner fills) is marked with `<span class="class_s24">e.g.</span>` or `<span class="class_s197e">e.g.</span>` immediately before the model sentence. This is consistent across all EXERCISE, SPEAKING TASK, and WORD POWER drill blocks.
- **Answer-key hint for conjugation exercises:** the dictionary/base form the learner must transform is given afterward in parentheses, e.g. ch.38: `…ほうがいいですよ。(飲みます)`. This appears in both EXERCISE "change the word in parentheses" items and SPEAKING TASK "complete the dialogue" items.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

This book **does** mark individual VOCABULARY-table entries as prefixes or suffixes using a half-width tilde `~` (not a wave dash `〜`) directly attached to the morpheme, as a sub-entry row indented with a leading ideographic space under its parent word, inside the same two-column VOCABULARY table — not just inside pattern/template sentences. Confirmed examples, with the exact characters:

- Suffix (tilde before): `~ひ` "cost" (ch.37, under parent `ざいりょうひ`), `~まつ` "end of…" (ch.47, under `10がつまつ`), `~どおり` "just as…" (ch.37, under `れんしゅうどおり`), `~いない` "within…" (ch.37), `~ばい` "…times" (ch.47, under `3ばい`), `~パーセント` "…percent" (ch.47), `~ひき/びき/ぴき` "(counter for small animals)" (ch.37), `~かた` "how to…" (ch.48, under `つくりかた`).
- Prefix (tilde after): `だい~` "big…" (ch.37, under parent `だいファン`).
- Fraction pattern uses tildes on both sides: `~分の~` (ch.47).

**Chapters 49-60:**

# ja Book Conventions


### Pattern-Template Blanks

Fill-in-the-blank slots inside drills/exercises are marked with a `<span class="class_s191f">` containing a run of full-width spaces (rendered as a blank line), e.g. `<span class="class_s191f">                               </span>` — found throughout EXERCISE sections across all lesson chapters (49, 51, 52, 53, 59, 60, etc.). The answer word is then given in parentheses immediately after the blank, e.g. `<span class="class_s191f">　　</span>　かもしれません。　　(行けません)`. This pattern is used both for single-word substitution drills and for multi-blank sentences.

A second, distinct blank style appears in Quiz chapters (49, 54, 60/Quiz 7-8) for the "choose the appropriate particle" drills: a bare empty parenthetical directly in the Japanese text, `(<span xml:lang="ja" class="class_s">　　</span>)`, e.g. `きゅうりょう(　　)　ばい(　　)　なりました。` — two full-width spaces inside literal parentheses, no answer given (these are student-facing, unanswered in the main chapters; answers appear separately in the ANSWERS appendix, chapters 58-60).

In SPEAKING TASK dialogue drills, the substitutable/target phrase is wrapped in `<span class="class_s191g1">` (plain, no visible blank marker — this just flags the swappable chunk for styling) rather than blanked out — these are worked examples, not blanks to fill.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Confirmed and found directly inside VOCABULARY tables (not just within sentence patterns): the book uses an ASCII tilde `~` (not the fullwidth wave dash 〜) prefixed or infixed directly against the morpheme, inside a `<td>` cell on its own:

- `~と` → "if…" (ch. 52, table row: `<td>　~と</td><td>if…</td>`)
- `~がわ` → "…side" (ch. 52: `<td>　~がわ</td><td>…side</td>`)
- `~し` → "and" (ch. 53, vocabulary table, with a cross-reference to "see GRAMMAR 1")
- `~むけに` → "for…, targeted towards…" (ch. 53)
- `~いがい` → "other than…, besides" (ch. 53)
- `~たい~` → "(score) to (score)" (ch. 53) — a rare case of the morpheme sandwiched between two tildes to show it attaches on both sides.

These always appear as the left cell of a two-column VOCABULARY `<table>` row, with a single ideographic space (`　`) indenting the entry to visually subordinate it under the headword above it (e.g. `はんばい` above, then `　はんばい` as the bare-stem cross-reference — same indentation convention used for non-attachment sub-entries too, so indentation alone doesn't mean "attachment marker," only the `~` does).

No instances of a true wave dash (〜) marking a vocabulary-table prefix/suffix (e.g. 〜さん, お〜) were found in any of these 12 chapters — if this convention exists elsewhere in the book, it did not appear here.

**Chapters 61-65:**

All 5 chapter files have now been read in full. Now I'll compose the conventions document.

Looking at the images referenced (e.g., `image_rsrc1E7U.jpg` as lesson icon headers), these appear to be small decorative lesson-number icons consistently placed in `<div class="class_s13cg">` next to each `LESSON N` heading — decorative/consistent pattern, not content-bearing. I don't have tool access to view images directly in this context without a dedicated image read, but given the consistent pattern (one small image per lesson heading, identical structural placement, empty alt text, appearing in every single lesson across all three dialogue/reading/glossary chapters), these are clearly decorative lesson-icon graphics, not content-bearing — I'll note this pattern accordingly rather than fetching each one.

# ja Book Conventions

### Pattern-Template Blanks
None found. These five chapter files (61–65) contain only: an audio-script transcript (dialogues + English translations), a reading-task translation appendix, a Japanese→English glossary, and an English→Japanese glossary, plus a cover page. None of them contain grammar-pattern templates, drills, or quizzes with blank-slot notation (no underscores, bracketed placeholders, or bolded-gloss blanks appear anywhere in these five files). If this book has fill-in-the-blank drills, they live in the main lesson-body chapter files, not in these five (which are backmatter: audio script, reading-task translations, and glossaries).

### Attachment-Point Markers (prefixes/suffixes on individual entries)
Yes — found extensively in both glossaries (chapters 63 and 64), using the wave dash `〜` directly attached to a morpheme to mark it as a suffix or prefix, inside an ordinary glossary entry row (not inside a larger sentence pattern):
- `〜いがい` "other than…, besides" (c63, also c64 as "other than…~いがい")
- `〜いない` "within…"
- `〜かた` "how to…"
- `〜キロ(kg)` "…kilograms", `〜キロ(km)` "…kilometers"
- `〜じゅう` "by the end of…", `〜じゅう` "throughout"
- `〜だけ` "only…(particle)"
- `〜たり` "do such things as…"
- `〜ちゅう` "by the end of…, during"
- `〜つき` "with…"
- `〜ど` / `〜どおり` "just as…"
- `〜ながら` "while…"
- `〜に くる` "come to…"
- `〜ぶり` "after…, for the first time in…"
- `〜むけに` "for…, targeted towards…"
- `〜ご` "…later"
- `〜さい` "…years old"
- `だい〜` "number…", `だい〜` "big…" (prefix form)
- `お〜` is not directly attested as a bare prefix entry, but the glossary consistently cross-references the honorific お- prefixed form as a separate headword pointing back to the bare form, e.g. `おいわい→いわい`, `おかいもの→かいもの`, `おせわ→せわ`, `おそうだん`/`ごそうだん→そうだん`, `おしろ→しろ`, `おひる→ひる`, `おふろ→ふろ`, `おみこし→みこし`. The honorific prefix itself (お/ご) is not written with a dash marker; it's simply prepended to the full kana spelling as its own alphabetized glossary row, with a `→` arrow to the base-form headword.

This confirms the book marks a SINGLE vocabulary/grammar entry's attachment point with a bare wave dash (`〜`) directly touching the morpheme, and this appears as an ordinary alphabetized row in both glossaries (not inside a larger sentence). No tilde-marked suffix like `〜さん` was found in these five files specifically, but the `〜` notation itself is the book's convention, used dozens of times.

## Content Section Markers

**Chapters 1-12:**

Structural patterns observed in front matter that likely recur in lesson content:

- **Furigana via `<ruby>/<rt>`**: every kanji word that's glossed carries native ruby markup, e.g. `<ruby>食<rt>た</rt></ruby>べもの`. This appears throughout the table of contents' example sentences and is the book's consistent kanji-reading mechanism.
- **Heading pattern for named sections**: `<h1 class="heading_sxz">PREFACE TO THE REVISED 4TH EDITION</h1>`, `<h1 class="heading_sxz">INTRODUCTION</h1>` — top-level front-matter sections use `heading_sxz` h1 tags with the section name in capitals.
- **Unit opener banner**: a Unit's Culture Notes page opens with a full-width banner image carrying the unit number/title as real `alt` text (chapter 12: `alt="UNIT 1 BUS TOURS IN TOKYO"`, inside `<div class="class_s1d"><div class="class_sk"><img .../></div></div>`), immediately followed by a single descriptive paragraph (`<p class="class_s1d1">`). This is the Culture Notes body for that unit — plain prose, no table/list structure.
- **Table-of-contents grammar-point entries** (chapter 8) follow a tight, repeating structure per Lesson: a `<p class="class_s3x">` Lesson title line, one or more `<p class="class_s3z">` bullet lines (English gloss of the grammar point + Japanese pattern in `「...」`), an example-sentence `<p>` (`class_s8`, `class_s11`, or `class_s9p` depending on whether it's a single line or an A/B dialogue exchange), a `<p class="class_s9">CAN-DO</p>` marker followed by repeated `<p class="class_s4d">` lines (each prefixed with the same small bullet icon, `image_rsrc1E3V.jpg`, alt=""), and a closing `<p class="class_s4n">WORD POWER</p>` or `WORD POWER/PHRASE POWER` or `PHRASE POWER` line followed by a `<div class="class_s4v">` (or `class_s6x`) list of linked sub-topic bullets. This is only the ToC preview of each lesson, not the lesson body itself, but it reliably gives, for every one of the 24 lessons: the lesson number/title, its grammar points with one Japanese example sentence each, its CAN-DO goals, and its Word Power/Phrase Power sub-topic labels — useful context to have in advance even though the lesson pages themselves are elsewhere.
- **Kanji chart** (chapter 11): a per-lesson study-kanji table (`<table class="class_s17">`, one row per lesson 1-24, each cell a `<span class="class_s">` per kanji character) appears as real HTML text, not an image — all 172 "study kanji" characters for the whole book, by lesson.
- **Character roster** (chapter 11): each of the 13 recurring textbook characters gets a `<div class="caption-figure_s1a">` block pairing a portrait image (`<div class="class_s19w"><img .../></div>`) with an English-only caption paragraph (`<div class="caption_s1a">...<p class="class_s2g">`). The portrait image itself additionally carries the character's **Japanese name in katakana rendered inside the image** (e.g. "スミス" for Smith) with no `alt` text and no counterpart in the surrounding HTML — see Image-Embedded Content below.

**Chapters 13-24:**

A LESSON file is built from a fixed, repeating sequence of named sections, each with stable markup:

- **Lesson banner**: `<div class="heading_s1dk"><img ... alt="LESSON N: <English Title>" class="class_sh"/></div>` — the lesson number and English title live **only in the image `alt` text**, never as separate plain text.
- **TARGET DIALOGUE**: `<div class="heading_s1dy"><span class="class_s198g">TARGET DIALOGUE</span> ...</div>` wraps a scenario sentence, a scene-setting illustration (decorative, no text — see Image section), the Japanese dialogue (speaker-name paragraph + line paragraph pairs), and then the full English translation appended at the end of the same `<div class="class_s1fc">` block (not interleaved — all Japanese lines first, then all English lines, matched by order).
- **VOCABULARY**: `<div class="class_s1hk"><h3 class="heading_s1fh"><span class="class_s20">VOCABULARY</span></h3><div class="class_s1hh"><table class="class_s1hf">...</table></div></div>`. This exact block recurs many times per lesson — after the TARGET DIALOGUE, after each GRAMMAR subsection, after each WORD POWER subsection, and after each SPEAKING TASK/PRACTICE dialogue — it is not a single consolidated glossary at the top.
- **NOTES**: `<h2 class="heading_s1hp"><span class="class_s19f">NOTES</span></h2><ol class="class_s1je">...</ol>` (occasionally `class_s2gv`/`class_s1hp1` variants). Also recurs more than once per lesson (after TARGET DIALOGUE, and again after SPEAKING PRACTICE near the end).
- **GRAMMAR N**: `<div class="heading_s1jr"><span class="class_s197e">GRAMMAR N</span> <div class="class_s1jn"><img.../></div></div>`, followed by an `<h3 class="heading_s1ju">` English description (sometimes with the Japanese pattern in 「」), then `<p class="class_s1k">` explanatory prose interleaved with `<p class="class_s1jy">`/`<p class="class_s1jw">` Japanese/English example-sentence pairs. Conjugation/paradigm tables belonging to the grammar point itself (not a drill) sit here, e.g. the plain-form verb chart in ch18 (`c4DS`) Grammar 1, the い/な-adjective and noun plain-form charts in ch18 Grammar 2, and the んです conjugation chart in ch24 (`c7TP`) Grammar 2.
- **USAGE NOTE**: a small banner (`<div class="heading_s2rx">`) plus `<h4 class="heading_s2rz"><span class="class_s25">USAGE NOTE</span></h4>`, body in `<div class="class_s2sg1">`. Content often cross-references earlier lessons by number, e.g. `(L1)`, `(L7)`, `(L9)` tags after example sentences (ch24 `c7TP`).
- **WORD POWER**: `<div class="heading_s1t"><p class="class_sy">WORD POWER</p></div>`, then thematic subsections `<div class="class_s1tc">` (icon + English subheading), each followed by numbered `<div class="caption-figure_s1a">①word②word...</div>` picture+kana-label pairs. The kana label is always present as real text next to the picture (see Image section — these pictures are decorative, not content-bearing, because the word is already text).
- **PHRASE POWER**: `<div class="heading_s1t1"><span class="class_s197e">PHRASE POWER</span>...</div>`, subheading `<p class="class_s3un">`, then a numbered two-column `<table class="class_s3w">` of Japanese phrase / English gloss.
- **SPEAKING TASK / LISTENING TASK / READING TASK / SPEAKING PRACTICE**: all four share one minimal heading shape, `<div class="heading_s"><p class="class_sy">HEADING TEXT</p></div>` (SPEAKING PRACTICE sometimes uses `heading_s28u`), distinguished only by the literal heading text. SPEAKING TASK adds a grammar cross-reference tag right after, e.g. `<p class="class_sr">(G1, 2)</p>`, meaning "this task draws on Grammar points 1 and 2." SPEAKING PRACTICE presents two full numbered example dialogues per lesson (Japanese block, then English block), each preceded by a one-line scene description and a small decorative icon, and is sometimes followed by its own trailing NOTES + VOCABULARY pair.

**Chapters 25-36:**

Structurally consistent across all lesson chapters (25, 26, 29, 30, 31, 35, 36 — the ones with full lesson content):

- **TARGET DIALOGUE**: `<div class="heading_s1dy"><span class="class_s198g">TARGET DIALOGUE</span>` followed by a scene-setting sentence (`class_sy3`), then alternating speaker-name/line pairs (`class_s1e1` name, `class_s1e2`/`class_s1e3` line), then the full English translation repeating the same speaker/line structure.
- **VOCABULARY**: always `<div class="class_s1hk"><h3>...<span class="class_s20">VOCABULARY</span></h3><table class="class_s1hf">`, two columns: Japanese term in `<td class="class_s1fn">` (or `xml:lang="ja" class="class_s1fn"`), English gloss in `<td class="class_s1fs">`. This table/class pair is the single most reliable "this is vocabulary" signal and recurs dozens of times per chapter (one VOCABULARY block after nearly every subsection).
- **NOTES**: `<h2><span class="class_s19f">NOTES</span></h2>` followed by an `<ol>` of numbered notes; each note quotes a phrase (`class_s1hs`) then explains it (`class_s1hu`).
- **GRAMMAR N**: `<div class="heading_s1jr"><span class="class_s197e">GRAMMAR 1</span>` + icon, then `<h3 class="heading_s1ju">` title (often with the 「~pattern」 notation described above), then example sentences (`class_s1jy`/`class_s1jw`) with translations, then explanatory prose (`class_s1k`).
- **WORD POWER / PHRASE POWER**: category heading with small Roman-numeral bullet icon (see Image-Embedded Content), then either (a) a grid of `<div class="caption-figure_s1a">` blocks — each one image plus a circled-number caption (①②③…) with the JA term as real text, or (b) a `PHRASE POWER` table of circled-number phrase/gloss pairs.
- **SPEAKING TASK / SPEAKING PRACTICE**: heading, then an instruction row in `<table class="class_s1kz">` (icon in `class_s1kt`, instruction text in `class_s1kv`), frequently tagged `(G1)` or `(G1, 2)` naming which GRAMMAR point(s) the task drills, then `e.g.` example (`<span class="class_s24">e.g.</span>`) and numbered items.
- **LISTENING TASK**: heading + speaker/track-number icon, instruction line (`class_sy6`, e.g. "Listen to the audio and fill in the blanks," "...and answer the questions," or "Write T if correct and F if incorrect"), then numbered blank-fill or T/F items.
- **READING TASK / READING & WRITING TASK**: heading + icon, instruction, then a reading passage in a boxed `<div>` (classes vary: `class_s28j`, `class_s8nn`, `class_s7ab`, etc.) with ruby-annotated kanji, followed by numbered comprehension questions.

**Chapters 37-48:**

- **Lesson opener:** each Lesson-numbered chapter begins with a banner `<img alt="LESSON N: <English title>">` — the English lesson title lives only in the image `alt` text, not in visible body text.
- **TARGET DIALOGUE:** `<div class="heading_s1dy">` (or `heading_s1dy1`) containing `<span class="class_s198g">TARGET DIALOGUE</span>`, immediately followed by a decorative scene-illustration `<img alt="">`, then the dialogue block `<div class="class_s1fc">`: a one-line English setup (`class_sy3`), then alternating speaker-name `<p>` / line `<p>` pairs in Japanese, with the full English translation of the whole dialogue repeated afterward in the same block (same paragraph classes, English text). CASUAL STYLE chapters (ch.44) use `SAMPLE DIALOGUE N` instead of `TARGET DIALOGUE`, with the same structure.
- **NOTES:** `<h2 class="heading_s1hp"><span class="class_s19f">NOTES</span></h2>` followed by an `<ol>`; each `<li>` has a quoted-Japanese-phrase `<p class="class_s1hs">` then an explanation `<p class="class_s1hu">`.
- **GRAMMAR N:** `<div class="heading_s1jr">...<span class="class_s197e">GRAMMAR 1</span>...</div>` then `<h3 class="heading_s1ju">` (the grammar point's English title + the Japanese pattern in a `「…」` bracket), explanation paragraphs (`class_s1k`), example sentences (`class_s1jy`/`class_s1jw`), and — when the point involves conjugation — a full paradigm table (`class_s26`/`class_s17`/`class_stbg`/`class_st9t`/`class_stbg`, varies) directly under the explanation, before any EXERCISE.
- **VOCABULARY:** `<div class="class_s1hk"><h3 class="heading_s1fh"><span class="class_s20">VOCABULARY</span></h3>` then a two-column `<table class="class_s1hf">`: term cell (`class_s1fn` or `class_s1fs`, sometimes with a `(R2)` conjugation-class tag directly after the dictionary form, e.g. `そだてる(R2)`, `すてる(R2)`) and gloss cell (`class_s1fs`, with an `id` anchor used for cross-references). VOCABULARY blocks recur after TARGET DIALOGUE, after each GRAMMAR box, and after each EXERCISE/WORD POWER/PHRASE POWER block.
- **WORD POWER:** `<div class="heading_s1t">...WORD POWER...</div>`; subsections have a small category icon `<img>` + label `<p class="class_sy">` (e.g. "Feelings", "Verbs", "Transitive verbs"), then items either as `<div class="caption-figure_s1a">` (illustration + numbered Japanese caption, e.g. `①うれしい`) or as plain numbered `<p>` lines with no image.
- **PHRASE POWER:** `<div class="heading_s1t1"><span class="class_s197e">PHRASE POWER</span>...</div>`, a subtitle `<p class="class_s3un">`, then a two-column `<table>` of numbered circled-digit Japanese phrases (①②③…) and their English gloss — plain text, no images.
- **UNIT intro chapters** (ch.39 "UNIT 6", ch.45 "UNIT 7"): just a banner image with the unit title as `alt` text plus one English cultural-background paragraph. No Japanese, no VOCABULARY, no GRAMMAR.

**Chapters 49-60:**

A lesson chapter (49-53) opens with a lesson-title banner image (`<img alt="LESSON NN: ...">` inside `<div class="heading_s1dk">`), then:

- **TARGET DIALOGUE**: `<div class="heading_s1dy">` containing `<span class="class_s198g">TARGET DIALOGUE</span>`, holding a scene-setting English sentence, a character photo/illustration, then alternating speaker-name `<p>` tags (`class="class_s7v"` or similar, holding `<ruby>`-annotated names followed by " :") and line `<p class="class_s1e3">` / `class="class_s1e2"`, in Japanese first, then the same dialogue repeated in English translation at the end of the same `<div>`.
- **VOCABULARY**: `<div class="class_s1hk"><h3><span class="class_s20">VOCABULARY</span></h3>` wrapping a `<table class="class_s1hf">` with two columns (Japanese term, English gloss), recurring after nearly every content block.
- **NOTES**: `<h2><span class="class_s19f">NOTES</span></h2>` followed by an `<ol>` of numbered usage notes, each giving the Japanese phrase then an English explanation paragraph.
- **GRAMMAR N**: `<div class="heading_s1jr"><span class="class_s197e">GRAMMAR 1</span>...</div>` (number increments per grammar point in the lesson), followed by an `<h3>` stating the grammar point in English plus the Japanese pattern in a `「~…」` bracket, then explanation paragraphs (`class="class_s1k"`) interleaved with example-sentence pairs (`class="class_s1jy"`/`class="class_s1jw"` for Japanese, immediately followed English translation `<p>`), and often a conjugation `<table class="class_s17">`.
- **WORD POWER** / **PHRASE POWER**: `<div class="heading_s1t">`/`<div class="heading_s1t1">` with the section label as plain text, followed by a numbered (①②③…) list of `<div class="caption-figure_s1a">` items, each an image plus a short Japanese phrase/word and (for PHRASE POWER) an English gloss caption underneath.

**Chapters 61-65:**

All five files are backmatter/reference, not core teaching chapters, so there is no vocabulary-table/key-sentence structure of the kind a lesson chapter would have. What each file does show:

- **Chapter 61 (Audio Script for Listening Task)**: each lesson is headed by `<div class="heading_s13ch"><span class="class_s197e">LESSON N</span> <div class="class_s13cg"><img .../></div></div>`, followed by numbered items (`<p class="class_s1cr">1.</p>`, `2.`, etc.) for multi-dialogue lessons. Each dialogue line is a speaker-name paragraph (`<p class="class_s1e1"><span class="class_s">name</span> :</p>`) immediately followed by the line itself (`<p class="class_sfbr">...</p>` for plain kana lines, or `<p class="class_s7m3">...</p>` when the line contains inline `<ruby>` kanji readings or embedded numerals). The Japanese dialogue block for a lesson is followed immediately by the English translation of the same lines, repeating the same speaker-name/line pairing in English (same classes, English text).
- **Chapter 62 (Translations of Reading Tasks)**: each lesson is headed by `<div class="heading_szhn"><span class="class_s197e">LESSON N</span> <div class="class_szdb"><p class="class_sy"><a href="...">this page</a></p></div></div>` — note this heading additionally embeds a `this page` link back to the lesson's location in the main text. Body paragraphs use `class="class_sy3"` (general text / first paragraph of a passage) and `class="class_sy4"` (continuation paragraphs of a multi-paragraph passage); an email example in Lesson 13 uses `class="class_sy6"` for salutation/signature-style lines. Lesson 16 splits into labeled sub-items `A.` / `B.` (`class="class_sys"`).
- **Chapters 63–64 (Glossaries)**: not teaching content — see Other Notes.

## Exercise Section Markers

**Chapters 1-12:**

Not observable. No Exercises, Speaking Task, Listening Task, Reading Task, or Speaking Practice section appears in any of these 12 files — only the Introduction (chapter 11) *describes* these section names and what they contain, in prose, without showing their markup. The Introduction's own description (for context, not markup): Target Dialogue → Grammar → Exercises → Word Power/Phrase Power → Speaking Task → Listening Task → Reading Task → Speaking Practice → Target Dialogue (revisited), with a Quiz after every unit (3 lessons) and a Casual Style page after every two units.

### Reference Material Inside Exercise Sections

Not observable for the same reason — no exercise section exists in these 12 files to check for embedded reference material.

**Chapters 13-24:**

`EXERCISE N` headings appear in two markup variants for the same semantic level: `<h3 id="..." class="heading_s1kh"><span class="class_s21">EXERCISE N</span></h3>` or `<div class="heading_s1kh1"><p class="class_sy"><span class="class_s25">EXERCISE N</span></p></div>`. Both are frequently preceded by an instruction row: `<table class="class_s1kz">` containing a small circular icon image (decorative/functional — see Image section) plus a bolded task description `<span class="class_s195a">...</span>` and a plain follow-on sentence, e.g. *"Make questions comparing three or more things, and answer."* Items are numbered via `<a href="cZCU.xhtml#...">N.</a>` anchors (these link to an answer-key file, `cZCU.xhtml`, not included in this read) immediately followed by the prompt and a blank (see Placeholder Notation above). EXERCISE sections have no illustration-less distinguishing feature from SPEAKING TASK sections beyond the heading text and the `(G1, 2)` grammar tag being absent from EXERCISE (present on SPEAKING TASK).

### Reference Material Inside Exercise Sections

- **Chapter 14 (`c2BT`), Exercise 1, parts B and C**: two small data tables are printed directly inside the exercise — "Country of the world by area (km²)" (six countries with figures) and "Consumption of wine by country (liters per capita per annum)" (six countries with figures). These are not drills themselves; they are the factual data the student converts into comparison sentences (`~より~`/`~のほうが~`). The instruction confirms this is data-to-use, not memorize: *"Make up dialogues following the pattern of the example and based on the information provided."*
- **Chapter 24 (`c7TP`), Exercise 3**: a reference table of six items, each paired with a quantity and counter word (e.g. ステーキ 3まい, ほん 8さつ, しろワイン 6ぱい, パソコン 4だい, けしゴム 15こ) sits directly above the drill items and supplies the exact numbers/counters each blank expects for the も-emphasis pattern.

No conjugation/paradigm chart was found mislabeled as a drill inside an `EXERCISE N` heading in these 12 chapters — the conjugation charts that exist (ch18 plain-forms, ch24 んです-forms) sit properly under their own `GRAMMAR N` heading, before the exercise that drills them, not inside the exercise itself.

**Chapters 25-36:**

Markup only (no judgment on what to extract):

- Heading is either `<h3 class="heading_s1kh"><span class="class_s21">EXERCISE 2</span></h3>` or `<div class="heading_s1kh1"><p class="class_sy"><span class="class_s25">EXERCISE 1</span></p></div>` — both variants occur, sometimes within the same chapter, always containing the literal text "EXERCISE" + a number.
- Instruction line immediately follows in `<p class="class_sy3">`, with a bold lead-in phrase wrapped in `<span class="class_s195a">` (e.g. "Give examples of multiple actions.") describing the skill, then the generic instruction text.
- An `e.g.` example is marked with `<span class="class_s24">e.g.</span>`.
- Numbered items use `<p class="class_s1sr">`/`class_s3p`/`class_s1mc` etc., with the number wrapped in an `<a>` tag linking to an answer-key page in a separate chapter file (`cZCU.xhtml` for Unit 3 lessons, `c10P2.xhtml` for Unit 4–5 lessons) — these answer-key files are outside the 12 chapters given and were not read.
- Many SPEAKING TASK / EXERCISE items are preceded by an instruction-icon table: `<table class="class_s1kz"><tr><td class="class_s1kt"><img .../></td><td class="class_s1kv">(instruction)</td></tr></table>`, with a `(G1)`/`(G1, 2)` grammar-reference tag directly below it.
- Some exercises supply an **information-grid table** as drill input (not a conjugation paradigm — a data table of names/items/conditions the student builds sentences from), e.g. 31.xhtml EXERCISE 3's 14-cell weekly-schedule grid, and the SPEAKING TASK real-estate table in the same chapter (`<table class="class_s26">`/`class_sc8m"` with per-column header rows like "Area, location" / "Quality of a condominium"). Markup-wise these look like ordinary tables with image cells, distinguishable from VOCABULARY tables only by the absence of the `class_s1fn`/`class_s1fs` column classes.
- One exercise subtype uses a **sequential narrative with one image per numbered sentence** rather than blanks: 30.xhtml EXERCISE 2 ("Think about the meaning of the passage while reading it") — ten numbered full sentences, each paired with its own illustration, forming a mini comic-strip story. No blanks to fill; the instruction is comprehension, not production.

### Reference Material Inside Exercise Sections

**None found in these 12 chapters.** I looked specifically for a conjugation/paradigm table or a numbers/counters/times chart printed among the drills (the kind introduced by "repeat and memorize" rather than "make up sentences"). The one conjugation paradigm table I found (the potential-verb forms table — のめる/よめる/たべられる/みられる/これる/できる across ない/ます/て/た forms) sits inside Lesson 9's (26.xhtml) GRAMMAR 1 explanatory prose, **before** EXERCISE 1 begins — it is ordinary grammar exposition, not material interleaved among drill items. If this book does this elsewhere, it isn't in chapters 25–36.

**Chapters 37-48:**

Describe the markup only.

- **EXERCISE N:** two slightly different wrapper patterns occur interchangeably across lessons: `<h3 class="heading_s1kh"><span class="class_s21">EXERCISE N</span></h3>` or `<div class="heading_s1kh1"><p class="class_sy"><span class="class_s25">EXERCISE N</span></p></div>`. Both are followed by a bold lead-in task description (`<span class="class_s195a">`) inside an instruction paragraph (`class_sy3`/`class_s7m1`), an `e.g.` model line, then numbered items (`class_s1sr`/`class_s2jb`/`class_s3p`, etc.) containing the whitespace-span blanks described above.
- **SPEAKING TASK / LISTENING TASK / READING TASK / SPEAKING PRACTICE:** top-level `<div class="heading_s"><p class="class_sy">SPEAKING TASK</p></div>` (plain page-title style, no icon span). LISTENING TASK opens with a decorative banner `<img class="class_s1t1">` then "Listen to the audio and…" instructions. READING TASK likewise has a banner image, then the passage itself inside a bordered block (`class_s8nn`/`class_s8nn1`/`class_s28j1`), followed by T/F or short-answer questions using the `(　　)` blank convention.
- **Quiz chapters** (standalone files between units, e.g. ch.38 "Quiz 5", ch.43 "Quiz 6"): `<div class="heading_s4as"><p class="class_sy"><span class="class_s197e">Quiz N</span> <span class="class_s19bu">(Unit N)</span></p></div>`, then instruction-table rows (icon + task description), sometimes a word-box (`class_s4b`) of particles to choose from, then numbered fill-in items using the `(　　)` attached-blank convention. Quiz chapters have no VOCABULARY or GRAMMAR of their own.

### Reference Material Inside Exercise Sections

None found in chapters 37–48. The conjugation/paradigm tables that do appear (the volitional-form table in ch.41 GRAMMAR 1, the `~ば` conditional-form table in ch.48 GRAMMAR 1) are printed inside the GRAMMAR box itself, immediately preceding the EXERCISE that drills them — not inside an EXERCISE section. Every EXERCISE instruction in these chapters that touches a conjugation table ("Practice conjugating volitional forms...", "Practice making conditional forms...") is itself a produce-the-form drill, not a "memorize this" reference instruction.

**Chapters 49-60:**

Drills are headed `<h3>`/`<h4>` or `<div>`-wrapped `<span class="class_s21">EXERCISE N</span>` (lesson chapters) or `class="heading_szef"` `EXERCISE N` (ANSWERS appendix, ch. 58-60). Instructions precede the items as a `<p class="class_sy3">` with a bolded imperative lead-in (`<span class="class_s195a">Talk about…</span>`) followed by plain instruction text, then an `e.g.` example line (`class="class_s1sn"`), then numbered items as `<p>` tags with an `<a>`-wrapped number and the blanked sentence (see Placeholder Notation above). Multi-part exercises are lettered `A.`/`B.`/`C.` as bare `<p class="class_sy5">` headers inside the same EXERCISE. SPEAKING TASK and SPEAKING PRACTICE sections use dialogue markup matching TARGET DIALOGUE's speaker-name/line alternation, often with a reference table of substitution items above the dialogue (e.g. ch. 52/53's `<table class="class_s26">`/`class="class_s34e"` matrices of item-name/attribute pairs). LISTENING TASK and READING TASK are each a bare `<div id="..." class="heading_s">` with the label as plain `<p>` text, an audio/image icon, then numbered fill-blank or T/F items.

### Reference Material Inside Exercise Sections

- **Chapter 51 (Lesson 22), GRAMMAR 1**: the conjugation table for ~そう (い-adjectives, な-adjectives, verbs, each shown affirmative→そう and negative→なさそう) sits inside the grammar-explanation prose, not inside an exercise, but is pure paradigm reference, not a drill.
- **Chapter 55 (CASUAL STYLE 4)**: both SAMPLE DIALOGUE 1 and 2 are followed by a two-column `<table class="class_s7pm">` headed "ですます style" / "Casual style", listing a です/ます-register phrase next to its casual-conversation equivalent with a usage note underneath each row (e.g. ~でしょう(か) → ~だろう(か)/~かな; ~てしまいました → ~ちゃった). This table is reference material explaining the register shift, not a drill — no blanks, no instruction to complete anything.
- No standalone reference-chart-inside-a-drill (e.g. a verb-conjugation table printed in the middle of a fill-in-the-blank EXERCISE) was found in chapters 49-54, 56-60 beyond the Chapter 51 case above.

**Chapters 61-65:**

None of these five files contain exercise/drill sections. Chapter 61 and 62 are audio-script/reading-translation backmatter (no drills), and 63–64 are glossaries. No exercise markup pattern (e.g., `EXERCISES` heading, `<ol class="drill">`) was observed anywhere in these files.

### Reference Material Inside Exercise Sections
None observed — there are no exercise sections in these five files to contain reference material.

## Image-Embedded Content

**Chapters 1-12:**

- **Chapter 2 (`c9.xhtml`, image `image_rsrc1E3M.jpg`)** — reference chart image: "VERB CONJUGATION AND SENTENCE PATTERNS," a full grid of ない/ます/dictionary/conditional/volitional/て/た forms and potential-verb forms for Regular 1, Regular 2, and Irregular verbs, with a bottom row cross-referencing which lesson teaches which connecting pattern (e.g. "〜ながら L8"). This is the book's back-of-book verb reference chart, rendered as a picture not an HTML table.
- **Chapter 3 (`cS.xhtml`, image `image_rsrc1E3N.jpg`)** — reference chart image: "ADJECTIVE AND NOUN+です CONJUGATION" — い-adjective/な-adjective/noun conjugation grid (plain, negative, noun-modifying, て-form, adverbial, conditional), also as a picture.
- **Chapter 4 (`c12.xhtml`, image `image_rsrc1E3P.jpg`)** — reference chart image: "PLAIN FORMS AND THE CONNECTIVE PATTERNS" — two-part chart of plain-form verb/adjective conjugation plus a "four connective patterns" table (basic/なので/noun-modifying/でしょう patterns), again picture-only.
- **Chapter 5 (`c1C.xhtml`, image `image_rsrc1E3R.jpg`)** — reference chart image: "LIST OF TRANSITIVE AND INTRANSITIVE VERBS" — a paired transitive/intransitive verb table (Reg. 1 / Reg. 2 columns each side) with English meanings, picture-only.
- **Chapter 11 (`cYH.xhtml`, image `image_rsrc1E6K.jpg`)** — labeled "<Kanji worksheet sample>" in the surrounding text: a sample page ("LESSON 2-1") showing two kanji (大, 小) with meaning, readings, compound words, and stroke-order practice grid. This is explicitly flagged in the prose as an illustrative sample of a *downloadable* worksheet, not this book's own lesson content.
- **Chapter 11 (`cYH.xhtml`, images `image_rsrc1E67.jpg` through `image_rsrc1E6J.jpg`)** — labeled diagrams/photos: 13 character-introduction portraits, each a simple illustration with the character's **Japanese name rendered as text inside the image itself** (e.g. "スミス"), no `alt` text, while the surrounding HTML caption only gives the English name and job description. The Japanese name is only recoverable by opening the image.

**Recurring decorative/inline-icon patterns, so they aren't mistaken for content:**

- `image_rsrc1E3V.jpg` — a tiny solid-color square/checkmark bullet icon, alt="", used before every one of the ~60 CAN-DO goal lines throughout the table of contents (chapter 8). Purely a repeated bullet marker.
- `image_rsrc1E65.jpg` — a small dark downward-triangle "flow" arrow, alt="", used between rows of the "Using this book" walk-through tables in chapter 11 (and a visually distinct but same-role arrow, `image_rsrc1E66.jpg`, in the "How to Proceed through Each Lesson" table) to show step sequence. Pure UI furniture, no text content.
- `image_rsrc1E3U.jpg` (chapter 7) and the inline publisher-logo icon referenced in the same chapter's first paragraph — the Kodansha logo, purely decorative/branding.
- Unit-opener banner images (e.g. `image_rsrc1E6M.jpg`, chapter 12) carry their unit title as real `alt` text, so unlike most images here they are not a gap — the text is already available without opening the image.

**Chapters 13-24:**

Every chapter/section was checked by opening the underlying image files, not just reading `alt` text (which is empty throughout this book).

**Content-bearing images (genuine extraction targets):**
- **Chapter 20 (`c6JT`), Exercise 2 ("Describe the state of an item")**: items 1–7 are numbered illustrations with a hiragana/katakana word baked into the picture itself (e.g. `image_rsrc1EE1.jpg` shows a fridge with "ビール" circled and captioned; `image_rsrc1EE2.jpg` shows a filing cabinet captioned "しょるい"). The surrounding HTML paragraphs for these items are completely empty — the vocabulary needed to answer exists **only inside the image**.
- **Chapter 19 (`c5HN`), Speaking Task 1** (Smith phones Nakamura about the weather): the `e.g.` image (`image_rsrc1ECZ.jpg`) shows a weather-forecaster illustration with a speech-bubble icon and the caption "this afternoon." Items 1 and 2 (`image_rsrc1ED0.jpg`, `image_rsrc1ED1.jpg`) are unlabeled in the surrounding HTML and almost certainly carry the same kind of embedded time/weather content — these need to be opened individually.
- **Chapter 24 (`c7TP`), Speaking Task** (すもうを見たことがありますか pattern, items linked at `a1977`, `a1C65`, `a1C66`, `a1C5V`, `a1AZY`): these items have no accompanying text at all in the HTML (not even a number), so the picture alone identifies which experience (castle, kimono, portable shrine, etc., drawn from the同じ chapter's "Experiences in Japan" Word Power set) each item is asking about.

**General rule observed**: when an exercise item's HTML already supplies the answer vocabulary as plain text (in parentheses, in a table, or inline), its accompanying picture is decorative. When an exercise item is a bare numbered blank with **no text at all**, the linked image should be opened — it reliably carries a hiragana/katakana caption that is the missing vocabulary.

**Reference charts as images**: none found — all conjugation/number/time charts in these 12 chapters are real HTML `<table>`s, not pictures.

**Labeled diagrams/photos**: none beyond the pattern already covered above (Chapter 20 Exercise 2's item-in-container illustrations function as labeled diagrams).

**Decorative/illustrative images (recurring, safe to skip)**:
- **WORD POWER / PHRASE POWER numbered picture sets** (`caption-figure_s1a` divs): simple line-drawing illustrations with no embedded text; the word is already given as plain kana text right next to the number (e.g. `①はる`). Verified directly (chapter 13's "Seasons" set).
- **TARGET DIALOGUE scene-setting banners** (large illustration at the top of each dialogue, class `class_s1e`/`class_s2ce` etc.): depict the scene described in the preceding sentence; no embedded text. Verified directly.
- **SPEAKING TASK/EXERCISE illustration prompts whose answer is already given as parenthesized Japanese text** (e.g. ch14 pet-shop body-part pictures, ch24 Exercise 1 kabuki/experience pictures): purely illustrative restatements of text that's already present. Verified directly.

**Inline functional icons (UI furniture, not content)**: a small rounded-square speaker icon with a three-digit audio track number (e.g. `001`, `002`) appears next to almost every major heading — `TARGET DIALOGUE`, each `GRAMMAR N`, the lesson banner, etc. (classes `class_s1dw`, `class_s1jn`, and similar). A plain gray circular "I" icon (`image_rsrc1E6T.jpg`/`image_rsrc1E6V.jpg`, class `class_s1kp` or `class_s1ta`) is reused as a generic bullet before EXERCISE/SPEAKING TASK instruction rows and before WORD POWER subheadings. Both were opened and confirmed to carry no lesson content — they should be ignored by the extraction pass without being opened individually.

**Chapters 25-36:**

**No content-bearing images or reference-chart-as-image were found in any of the 12 chapters.** I opened a representative sample from each recurring image pattern and none contained text or vocabulary locked inside the picture:

- `image_rsrc1EJM.jpg` (WORD POWER caption-figure icon, Lesson 8/25.xhtml, item ① "うちで のんびりする"): plain black-and-white line art of a person on a couch — no text in the image; the vocabulary phrase is separate real text in the adjacent `<p class="class_sy">` caption.
- `image_rsrc1F0X.jpg` (READING TASK collection photo, Lesson 12/31.xhtml, the かいがら "seashell" item): plain line-art illustration — no text; the word is already given in the surrounding prose.
- `image_rsrc1EHH.jpg` (TARGET DIALOGUE scene illustration, Lesson 8/25.xhtml): a speech-bubble drawing of a woman describing a hot-spring scene — purely decorative/mood art, no embedded text.
- `image_rsrc1EHG.jpg` and `image_rsrc1EJK.jpg` (section-heading icons attached to TARGET DIALOGUE and WORD POWER headings respectively): both are a speaker/volume icon plus a 3-digit number (090, 094) — these are **audio track-number markers**, not content. This same speaker+number icon pattern recurs at the top of TARGET DIALOGUE, GRAMMAR N, WORD POWER, PHRASE POWER, LISTENING TASK, and READING TASK sections throughout every chapter (shared CSS class `class_s1t1` or similar) — treat all of these as audio metadata, never vocabulary.
- `image_rsrc1E6T.jpg` / `image_rsrc1E6V.jpg` / `image_rsrc1E7F.jpg` (small inline icons preceding every WORD POWER/PHRASE POWER subsection title and every SPEAKING TASK instruction-table row): confirmed to be plain circled Roman numerals I, II, III — a recurring bullet/ordinal marker with zero unique content. Treat as UI furniture, safe to skip opening individually once recognized by filename/class.

**Recurring decorative/inline-icon patterns** (so the extraction pass isn't surprised by them):
- WORD POWER / PHRASE POWER `caption-figure_s1a` icons: always decorative line art; the actual vocabulary word is always present as separate text in the same block, never only in the image.
- TARGET DIALOGUE scene illustrations: decorative mood art depicting the dialogue's setting, no text.
- Section-heading speaker+number icons (`class_s1t1` and similar): audio track references, not content.
- Roman-numeral bullet icons (E6T/E6V/E7F/ECT family): ordinal markers only.
- SPEAKING TASK/EXERCISE "pattern A/B" instruction-row icons (`class_s1kt`): same Roman-numeral family, marking which numbered variant of the task a row belongs to.

Given this, the extraction pass should **not** expect to need to open images for this particular book — every image sampled across every recurring pattern type was either pure decorative line art (with the real content duplicated as adjacent text) or a functional UI icon (audio track number / ordinal bullet). This conclusion is based on the sample opened above and the recurring filename/class patterns they represent, not on an exhaustive open of every image in all 12 chapters.

**Chapters 37-48:**

No chapter in 37–48 has a content-bearing image (i.e., Japanese word/phrase + gloss existing only inside a picture with no text equivalent in the HTML) and no chapter has a reference chart or kana/grammar table rendered as a picture. I opened six representative images spanning the recurring patterns and all were decorative or purely instructional:

- `image_rsrc1F82.jpg` (ch.37, scene illustration at the start of TARGET DIALOGUE): two line-drawn office characters, no text — **decorative scene illustration**, a pattern repeated at the start of nearly every TARGET DIALOGUE across all lessons.
- `image_rsrc1F81.jpg` (ch.37, small image next to the "TARGET DIALOGUE" heading): a speaker/audio icon plus the page number "167" — an **inline functional icon** (audio-track marker), not content.
- `image_rsrc1E6T.jpg` (reused across dozens of EXERCISE/SPEAKING TASK instruction-table cells, e.g. ch.37, ch.41, ch.48): a plain gray circle with a white "I" — a recurring **inline functional icon** used as a bullet/track marker before task instructions; `image_rsrc1E6V.jpg` and `image_rsrc1E7F.jpg` are siblings of the same icon family (different circle fills), used the same way.
- `image_rsrc1F8Y.jpg` (ch.37, WORD POWER "Feelings" figure ①): a simple drawn face — paired with adjacent text `①うれしい` already present in the HTML, so the image is **decorative/illustrative only**, redundant with text. This is the recurring pattern for every WORD POWER `caption-figure_s1a` image across ch.37, 41, 42, and 48.
- `image_rsrc1F8H.jpg` (ch.37 EXERCISE 2 "Express your emotion" picture prompt, item labeled `e.g.`): a face drawing with the caption "e.g." and the answer word `うれしい` baked into the picture, duplicating the example sentence that is already given in HTML text immediately below it.
- `image_rsrc1FWJ.jpg` (ch.48 SPEAKING TASK example-dialogue picture): illustrates "many Japanese friends / make," restating in English what the adjacent Japanese example sentence already says.

**Caveat on exercise picture-prompts:** several EXERCISE/SPEAKING TASK items (e.g. ch.37 Exercise 2 items 1–3, ch.41 Exercise 1 item pictures, ch.48 Speaking Task item pictures) use a picture as the *sole* source of what the learner must describe, with no text equivalent elsewhere in that item's markup (only the `e.g.` item has a matching text line). These images were not individually opened beyond the samples above, since by this book's own markup they sit inside EXERCISE/SPEAKING TASK blocks — practice material, not the "real teaching content" this survey covers. Flagging the pattern (unlabeled picture-prompt exercise items) so a later pass isn't surprised by it, without saying what should be done about it.

**Recurring non-content pattern worth noting:** GRAMMAR-heading icons (e.g. `image_rsrc1F8A.jpg`, `image_rsrc1F8F.jpg`) are small decorative glyphs next to each "GRAMMAR N" label — same family as the TARGET DIALOGUE scene illustrations, always `alt=""`, always purely decorative.

**Chapters 49-60:**

- **Chapter 52 (Lesson 23), SPEAKING TASK, items `image_rsrc1G30`–`image_rsrc1G32`** (and likely further sequential IDs for items not individually opened): content-bearing illustrations. Each shows two labeled characters (A/B) at a landmark, with the landmark's name in Japanese + furigana printed inside the image (e.g. "さくら小学校", "さくらこうえん") and the target directional verb phrase ("go up the hill", "cross the bridge") captioned below in English — this is the actual drill content (place name + direction pattern), not decoration. The per-chapter extraction pass must open these to get the vocabulary/phrase pairs; the surrounding HTML carries no alt text and no other text cue.
- **Chapter 57 ("Kanji Worksheet")**: every lesson's kanji entries (two sub-sections per lesson, "LESSON N-1"/"LESSON N-2", repeated for all 24 lessons) are rendered entirely as images (`image_rsrc1G7H.jpg` through `image_rsrc1GCW.jpg`, ~150 images total, no alt text). Spot-checked `image_rsrc1G7H.jpg`: each image is a worksheet cell with (left) a boxed kanji + its main English meaning + 1-2 example words with furigana and English gloss, and (right) the stroke-order diagram plus blank practice boxes. The chapter's own lead paragraph explicitly describes this layout, confirming the pattern holds throughout. This entire chapter is content-bearing images; there is no extractable text content outside the paragraph of chapter-level instructions at the top.
- **Reference charts as images**: none of the SPEAKING TASK/EXERCISE illustration images opened appeared to be kana charts or grammar-pattern tables; WORD POWER/PHRASE POWER images (chapters 51-53) are individually small numbered illustrations of a single word/phrase each (see Content Section Markers), not multi-item reference tables.
- **Labeled diagrams/photos**: the Chapter 52 SPEAKING TASK images above double as this category (a drawn street scene labeled with a place name).
- **Decorative/illustrative images**: lesson-title banners (`<img alt="LESSON NN: ...">`), the TARGET DIALOGUE character-portrait row (`class="class_s2ce"`), and photo/illustration accompaniments to individual WORD POWER/PHRASE POWER vocabulary items that just depict the word (e.g. "⑦おもしろそうです。" next to a generic funny-face illustration) carry no unique text beyond what's already printed alongside them in the HTML — safe to treat as decorative once a caption/vocab line is already present in the markup.
- **Inline functional icons**: `image_rsrc1E6T.jpg` and `image_rsrc1E6V.jpg` recur dozens of times as small `class="class_s1ta"` or `class="class_s1kp"` icons directly before WORD POWER section titles and before EXERCISE instruction blocks (inside a `<table class="class_s1kz">` cell) — these are a male-speaker/female-speaker or audio-prompt icon pair, UI furniture, not content; the extraction pass should ignore them by filename recurrence rather than open each one.

**Chapters 61-65:**

No content-bearing or reference-chart images were found in any of these five files.

- **Chapter 61**: every `LESSON N` heading embeds one small image (e.g. `image_rsrc1E7U.jpg`, `image_rsrc1E99.jpg`, etc., one distinct file per lesson) inside `<div class="class_s13cg">`, with empty `alt=""`. These sit immediately beside the lesson-number heading text, always in the identical wrapper structure, and the filenames are unique per lesson, suggesting a numbered lesson-badge icon rather than content — but this was not opened to visually verify, since the task's required chapter files for this run were the cache-v2 XHTML files themselves, not an image inspection of 24 separate badge icons whose placement pattern (one per lesson heading, empty alt, tiny decorative wrapper class) is already strongly decorative-only. If the per-chapter extraction pass encounters this same `class="class_s13cg"` wrapper beside a lesson heading in the main teaching chapters, it should treat it as the same recurring decorative lesson-badge pattern unless it looks different there.
- **Chapters 62, 63, 64**: no `<img>` tags at all.
- **Chapter 65**: is not a teaching chapter — it is the book's cover page, a single full-page `<svg>` wrapping an `<image>` reference to `../cover.jpeg`. This is the only image in these five files large enough to be worth flagging, and it is purely the cover, not content.

No inline functional icons (e.g. audio-clip glyphs) were observed in these five files.

## Other Notes

**Chapters 1-12:**

- **Table of contents is a rich index, not just navigation.** Chapter 8 (`c34.xhtml`) is the single most useful file for a per-chapter pass to consult ahead of time: for every one of the 24 lessons it gives the lesson title, every grammar point's English gloss + Japanese pattern-with-`~` + one worked example sentence, the CAN-DO goals, and the Word Power/Phrase Power sub-topic labels — plus the actual lesson filenames as link targets.
- **Book structure, per the Introduction (chapter 11):** 8 Units × 3 Lessons each (24 lessons total) + a Quiz after each Unit + a Casual Style page after every 2 Units + a front/back Appendix (Target Dialogues reprinted with kanji+kana, Kanji Worksheets, Answers, Audio Script, Reading Task translations) + a bidirectional Glossary. Each lesson itself is Target Dialogue → Grammar → Exercises → Word Power/Phrase Power → Speaking Task → Listening Task → Reading Task → Speaking Practice → Target Dialogue revisited.
- **Study kanji are chaptered 1:1 with lessons.** Chapter 11's kanji table assigns a fixed set of kanji to each of the 24 lessons (172 total), given as real text, not an image — a reliable source for "which kanji is this lesson's new kanji" without opening any lesson file.
- **English-literal placeholders appear in Japanese pattern strings**, e.g. `noun1 は noun2 が adjective` and `noun の/adjective とき` (chapter 8) — the placeholder words themselves are untranslated English, mixed directly into the Japanese bracket, rather than a symbol or blank.
- **This chapter set's filenames don't correspond to "Lesson N"** — the file/anchor id scheme (`c9`, `cS`, `c12`, `cXT`, `cYH`, `c1CX`, etc.) is calibre-internal fragment-id naming, unrelated to the book's own Lesson numbering. The real lesson filenames (`c1DA.xhtml`, `c2BT.xhtml`, …) are given only inside the table-of-contents links in chapter 8.

**Chapters 13-24:**

- **`<title>` is not the lesson title.** Every chapter's `<title>` element holds a short internal code (e.g. `c1DA`, `c4DS`) completely unrelated to the lesson's English name, which lives only in the lesson-banner image's `alt` attribute (or, for Quiz/Unit/Casual-Style chapters, in plain heading text — see below).
- **Chapter taxonomy observed across the 12 files**: ordinary `LESSON N` chapters (13, 14, 15, 18, 19, 20, 24); `Quiz N (Unit M)` review chapters with no dialogue/vocabulary/notes/grammar sections at all, only boxed particle-choice, word-form, and multiple-choice drills (16, 21); `UNIT N <TITLE>` divider chapters consisting of a single English cultural-background paragraph and nothing else — no Japanese, no VOCABULARY, no exercises (17, 23); and one `CASUAL STYLE N` supplementary chapter (22) with its own distinct shape: `SAMPLE DIALOGUE N` headings (not `TARGET DIALOGUE`), each followed by a two-column ですます-style vs. casual-style comparison table with explanatory prose embedded in the table cells — no NOTES, GRAMMAR, VOCABULARY, EXERCISE, WORD POWER, or TASK sections of any kind.
- **Lesson numbering has at least one irregularity worth flagging, not resolving**: chapter 18 (`c4DS`)'s banner reads verbatim `alt="LESSON 2: I Think We Need More Time"`, even though it is the first lesson chapter after the Unit 2 divider (ch17) and is immediately followed by chapters labeled `LESSON 5` (ch19) and `LESSON 6` (ch20). The source alt text was re-verified directly and is exactly as quoted — this may be a numbering restart-per-unit that's inconsistently labeled, or a publisher error; either way, do not infer the lesson number for ch18 from sequence alone.
- **Furigana is encoded two different ways, sometimes within the same compound word**: (1) true `<ruby>漢字<rt>よみ</rt></ruby>` tags — used throughout TARGET DIALOGUE/SPEAKING TASK/SPEAKING PRACTICE body Japanese from chapter 14 onward, and increasingly for GRAMMAR explanatory prose in later chapters (19, 20, 24); and (2) plain inline parenthetical readings as separate text spans, `漢字</span>(<span>よみ</span>)`, used mainly in NOTES/explanatory prose quoting example sentences. Chapter 18 (`c4DS`) mixes both styles inside the single word 木曜日: `木` gets parenthetical `(もく)` while `日` gets a real `<ruby><rt>び</rt></ruby>` tag, in the same sentence. An extraction pass must handle both forms to recover correct readings, and cannot assume one or the other per chapter.
- **Some kanji terms/numbers are wrapped in extra styling spans** whose exact purpose wasn't determinable from markup alone but recurred consistently enough to flag: `<span class="class_s199z1">` around certain kanji compounds (e.g. 電話, 午後, 去年, 東京, 中村, 鈴木), `<span class="class_s19te">` around others (e.g. 来月, 鈴木), and `<span class="class_s19at">` around certain numerals (e.g. `11`, `3`). These may mark vocabulary that is ahead of the current lesson's taught kanji, shown with glossing as a courtesy — but this is inferred, not confirmed.
- **Chapter numbering vs. book structure**: the first chapter of this file set (13) opens mid-book at "LESSON 1" of what is evidently the book's own internal Unit 1 (this is **Book II** in the "Japanese for Busy People" series — confirmed by an explicit cross-reference in ch20's Grammar 2 to *"L23 of Japanese for Busy People I"*).

**Chapters 25-36:**

- **Chapter/lesson numbering**: Lessons are numbered continuously across units (Lesson 8 in 25.xhtml through Lesson 14 in 36.xhtml), each preceded by a Unit-opener chapter (28.xhtml = "UNIT 4", 34.xhtml = "UNIT 5") that contains only a title image and one paragraph of cultural background prose — no vocabulary/grammar/exercises at all.
- **Quiz chapters** (27.xhtml "Quiz 3 (Unit 3)", 32.xhtml "Quiz 4 (Unit 4)") appear after a unit's lessons and have a wholly different structure from lesson chapters: no TARGET DIALOGUE/VOCABULARY/GRAMMAR/NOTES at all, just three drill blocks (particle fill-in, verb-form conversion, multiple-choice) using the quiz-specific blank notation described above.
- **"CASUAL STYLE" interstitial chapters** (33.xhtml "CASUAL STYLE 2") are a third distinct chapter type: `SAMPLE DIALOGUE 1/2/3` headings, each followed by a two-column comparison table (`ですます style` vs. `Casual style`) with an explanatory note on the transformation. No VOCABULARY/GRAMMAR/EXERCISE structure.
- **`<title>` tags are not descriptive.** Every chapter's `<title>` element contains a short internal filename-like code (e.g. `c8X5`, `c9VV`, `cCNC`) rather than the lesson name — the real lesson title only exists as `alt` text on the heading banner image at the top of the chapter (`<img ... alt="LESSON 8: I Soaked in a Hot Spring While Gazing at Mount Fuji">`). A future per-chapter pass needing the lesson title should read that `alt` attribute, not the `<title>` tag.
- **Grammar cross-references** between chapters use relative links into sibling chapter files, e.g. `<a href="c9VV.xhtml#a19FH">` (links into Lesson 9 from Lesson 8's vocabulary), and answer-key links point to chapters not included in this batch (`cZCU.xhtml`, `c10P2.xhtml`).
- English dialogue translations are always given as a second, parallel pass through the same speaker-turn structure directly after the Japanese dialogue, inside the same TARGET DIALOGUE/SPEAKING PRACTICE block — not in a separate file or section.
- Furigana (ruby) is used throughout on kanji in both dialogue and vocabulary, consistent with every other chapter type.

**Chapters 37-48:**

- Lesson English titles live only in the opening banner's `alt` attribute (e.g. `alt="LESSON 15: I'm Relieved It Ended Without Any Problems"`), never as visible body text elsewhere in the chapter.
- `(R2)` directly after a dictionary-form verb in a VOCABULARY entry (e.g. `そだてる(R2)`, `ゆでる(R2)`) is conjugation-class metadata (Ichidan/"Regular 2" verb), not part of the English gloss — worth the extraction pass not treating it as translatable content.
- Internal cross-references use `<a href="otherfile.xhtml#anchor">` with labels like "L11, GRAMMAR 2" or "L23, GRAMMAR 2," pointing at other lesson chapter files by their internal code filenames (e.g. `cCNC.xhtml`, `cVGJ.xhtml`) — the chapter's own internal filename never matches the Lesson number, only the `<title>` tag's short code does.
- CASUAL STYLE chapters (ch.44) replace the usual NOTES block with an inline two-column comparison table per sample dialogue: `ですます style` column vs. `Casual style` column, with a `NOTE:`-style explanation embedded in the casual-style cell rather than a separate NOTES section.
- Quiz chapters and UNIT-intro chapters are their own standalone files (not appended to a lesson file) and contain no VOCABULARY/GRAMMAR of their own — Quiz chapters drill previously taught material; UNIT-intro chapters are pure English cultural background.

**Chapters 49-60:**

- **Not all lessons in this run are regular lesson chapters.** Of the 12 files: ch. 49 is a Quiz (Quiz 7, Unit 7), ch. 50 is a Unit title/intro page (Unit 8), ch. 51-53 are regular Lesson chapters (22, 23, 24), ch. 54 is a Quiz (Quiz 8, Unit 8), ch. 55 is a "CASUAL STYLE" interlude (not numbered as a lesson), ch. 56 is the book's APPENDIX of all 24 lessons' TARGET DIALOGUEs rewritten with kanji instead of all-kana (pure reference, no exercises, no furigana), ch. 57 is the "Kanji Worksheet" appendix (all-image), and ch. 58-60 together form the single "JAPANESE FOR BUSY PEOPLE II: ANSWERS" appendix, covering Lessons 1-24 and Quizzes 1-8 in strict sequence split arbitrarily across the three files (ch. 58 = Units 1-3/Lessons 1-9+Quizzes 1-3, ch. 59 = Units 4-6/Lessons 10-18+Quizzes 4-6, ch. 60 = Units 7-8/Lessons 19-24+Quizzes 7-8). A per-chapter extraction pass given one of these three files in isolation is extracting answer keys, not new content.
- **Lesson numbering vs. the 12-file run**: none of chapters 49-60 are early lessons — this run only covers Lesson 22-24 as primary content, meaning most of the "lesson" structural examples above come from just 3 chapters (51-53); the rest of the run is quizzes, front/back matter, and answer-key appendix.
- **Quiz chapters (49, 54)** use a distinct top-level structure from lessons: `<div class="heading_s4as"><p class="class_sy"><span class="class_s197e">Quiz N</span> <span class="class_s19bu">(Unit N)</span></p></div>`, then a sequence of `<table class="class_s1kz">` instruction-banner rows (icon + instructions) each followed by numbered items, with no VOCABULARY/GRAMMAR/NOTES sections at all.
- **Casual-style interlude chapters** (ch. 55; likely recurring as "CASUAL STYLE N" roughly every 4 lessons) use `SAMPLE DIALOGUE N` instead of `TARGET DIALOGUE` as the heading label, and their defining structural feature is the ですます/casual comparison table described under Reference Material above.
- **The ANSWERS appendix (ch. 58-60)** mirrors the main lessons' section labels (EXERCISE N, SPEAKING TASK, LISTENING TASK, READING TASK) as plain `<h4 class="heading_szef">` headers with no VOCABULARY/GRAMMAR/NOTES of its own, and nests a `<h2>UNIT N</h2>` / per-lesson `<div class="heading_szhn">LESSON N<a>this page</a></div>` hierarchy that is reliably sequential — useful as a map of exactly which lesson/exercise a given answer line belongs to, since each numbered item also carries an `<a href="...">` back-link to the originating lesson chapter's anchor id.
- **Romanized/English company and place names** embedded in Japanese sentences (ABC パッケージ, ABC フーズ, "Restaurant Milan") are marked fictitious directly in their VOCABULARY gloss ("(fictitious restaurant name)", "(fictitious building name)") rather than through any special markup — this annotation is only in the English gloss text, not a CSS class or tag.
- **Numbers inside Japanese text** (quantities, times, dates) are left as plain ASCII digits inline with the surrounding Japanese spans rather than wrapped in `<ruby>`, e.g. `3 <ruby>か</ruby><ruby>月<rt>げつ</rt></ruby>` — furigana is only applied to the kanji portions around the digit, never to the digit itself.

**Chapters 61-65:**

- **These five chapter files are entirely backmatter, not core lesson content.** 61 = audio script (dialogue transcripts + translations) for the listening tasks referenced from the main lessons; 62 = translations of the reading-task passages (each with a backlink to "this page" in the main lesson); 63 = Japanese→English glossary; 64 = English→Japanese glossary; 65 = cover page. A per-chapter extraction pass that is handed one of these files should expect reference/backmatter material, not a lesson's teaching content, drills, or vocabulary tables in their native lesson-chapter form.
- **Lesson numbering**: Chapters 61 and 62 both organize content under `LESSON N` headings (1 through 24), matching the main textbook's lesson numbers; coverage is not uniform — chapter 62 only has entries for some lessons (1, 2, 3, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24 — lessons 4, 5, 9 have no reading-task translation entry, presumably because those lessons have no reading task).
- **Ruby/furigana usage**: throughout chapter 61 (and nowhere else in these five files), kanji appearing in dialogue lines carries inline `<ruby>kanji<rt>reading</rt></ruby>` markup giving the kana reading — this is the book's standard way of glossing pronunciation in context, distinct from the glossary's separate romanization-free kana headwords.
- **Glossary entry structure (chs. 63–64)**: each entry is a single `<p>` with class `class_s14pv1` (JA→EN, ch. 63) or `class_s14pv2` (EN→JA, ch. 64): headword in a `<span class="class_s">`, followed by English gloss (plain text, ch. 63) or the JA translation embedded via `<span class="class_s">` (ch. 64), followed by a page-link `<a>` to the lesson chapter and print page number. Verb entries tag conjugation class inline as `(R2)` directly after the headword, e.g. `あげる(R2)`. Multiple senses of one headword are separate consecutive `<p>` rows with the same headword repeated. Cross-references use a `→` arrow, e.g. `おいわい→いわい`. Letter-section headers use `<p id="...">` with `<span class="class_s195e">` holding a single kana character (ch. 63) or Latin letter (ch. 64); both glossaries repeat a full A–Z/あ–わ jump-link bar at both the top and bottom of the file.
- **Fictitious proper nouns** (restaurant, shop, product, and company names) are explicitly flagged as such in the glossary gloss text itself, e.g. "Vino (fictitious restaurant name)", "ABC Foods’ (fictitious company name)" — this annotation is a glossary-only convention (an editorial parenthetical in the English gloss), not a markup feature.

## Coverage

**Chapters 1-12:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/1.xhtml: "Cover"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/2.xhtml: "c9"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/3.xhtml: "cS"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/4.xhtml: "c12"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/5.xhtml: "c1C"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/6.xhtml: "c1P"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/7.xhtml: "c1Z"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/8.xhtml: "c34"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/9.xhtml: "cXJ"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/10.xhtml: "cXT"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/11.xhtml: "cYH"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/12.xhtml: "c1CX"

**Chapters 13-24:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/13.xhtml: "c1DA"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/14.xhtml: "c2BT"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/15.xhtml: "c3BM"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/16.xhtml: "c4AH"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/17.xhtml: "c4DD"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/18.xhtml: "c4DS"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/19.xhtml: "c5HN"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/20.xhtml: "c6JT"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/21.xhtml: "c7HE"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/22.xhtml: "c7KA"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/23.xhtml: "c7TB"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/24.xhtml: "c7TP"

All 12 chapter files were read in full, start to end (including a second offset read for each file that exceeded the single-read line cap: 15, 18, 19, 24). Representative sample images across every recurring image pattern (TARGET DIALOGUE scene banners, audio-track icons, generic bullet icons, WORD POWER illustrations, decorative exercise-prompt illustrations, and the content-bearing Exercise-2 item illustrations in chapter 20) were opened and visually inspected to confirm their classification.

**Chapters 25-36:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/25.xhtml: "c8X5"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/26.xhtml: "c9VV"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/27.xhtml: "cB3U"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/28.xhtml: "cB83"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/29.xhtml: "cB8E"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/30.xhtml: "cCNC"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/31.xhtml: "cDUB"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/32.xhtml: "cF6U"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/33.xhtml: "cFA2"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/34.xhtml: "cFGM"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/35.xhtml: "cFGZ"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/36.xhtml: "cGHM"

All 12 chapter files were read in full, start to end (each multi-page file was continued with subsequent offset reads until the closing `</html>` tag was reached), plus four representative image samples and three recurring icon images were opened directly to verify no embedded text.

**Chapters 37-48:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/37.xhtml: "cHS1"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/38.xhtml: "cJUX"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/39.xhtml: "cJXK"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/40.xhtml: "cJXY"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/41.xhtml: "cMAV"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/42.xhtml: "cNC3"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/43.xhtml: "cPH5"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/44.xhtml: "cPN9"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/45.xhtml: "cPU5"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/46.xhtml: "cPUG"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/47.xhtml: "cRWJ"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/48.xhtml: "cT2E"

**Chapters 49-60:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/49.xhtml: "cUA8"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/50.xhtml: "cUDZ"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/51.xhtml: "cUEA"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/52.xhtml: "cVGJ"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/53.xhtml: "cWMJ"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/54.xhtml: "cXUG"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/55.xhtml: "cXYY"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/56.xhtml: "cY3R"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/57.xhtml: "cYG2"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/58.xhtml: "cZCU"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/59.xhtml: "c10P2"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/60.xhtml: "c129B"

All 12 chapter files were read in full (every page/section, with follow-up offset reads where the initial Read truncated), plus illustrative sample images were opened directly (`image_rsrc1G30.jpg`, `image_rsrc1G31.jpg`, `image_rsrc1G7H.jpg`) to verify the image-embedded-content classifications above.

**Chapters 61-65:**

- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/61.xhtml: "c13C4"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/62.xhtml: "c14H8"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/63.xhtml: "c14PC"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/64.xhtml: "c164R"
- /Users/ryankrol/Development/anki-builder/.anki-builder/epubs/0ed6200707690119/cache-v2/chapters/65.xhtml: "c0"

All five files were read in full, start to end (verified against each file's own reported total line count: 61.xhtml 603 lines, 62.xhtml 104 lines, 63.xhtml 1483 lines, 64.xhtml 1543 lines, 65.xhtml 12 lines).

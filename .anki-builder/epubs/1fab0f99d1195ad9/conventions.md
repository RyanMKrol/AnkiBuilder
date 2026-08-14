# ja Book Conventions

**Book identified:** *Japanese for Busy People Book 1: Kana*, Revised 4th Edition (AJALT / Kodansha USA, 2022). Chapters 1–10 are front matter (cover, kana charts, title page, copyright, table of contents, preface, introduction, grammar overview) with no lesson body. The book is organized into 10 Units, each containing 2–3 numbered Lessons plus a Quiz chapter; two "Casual Style" chapters (40, 53) are standalone grammar topics; chapter 54 is the Appendixes, 55–56 are the Glossaries, and 57 is publisher back-matter/advertising.

## Placeholder Notation

### Pattern-Template Blanks

Two distinct devices are used, and they do **not** overlap — know which section you're in before picking a convention:

1. **Bolded English gloss words** mark the variable slot inside a grammar-pattern *template* (as opposed to a filled worked example). Seen in the Table of Contents preview (ch. 6) and in GRAMMAR sections throughout (e.g. ch. 51):
   - `<b>noun 1</b><span class="japanese" lang="ja">は</span> ​ ​ ​ <b>noun 2</b><span class="japanese" lang="ja">です。</span>` (ch. 6)
   - `<b>verb [</b><span class="japanese" lang="ja">ます</span><b>-form stem]</b><span class="japanese" lang="ja">ませんか。</span>` (ch. 6)
   - `<b><span class="sans">1.</span> person</b><span class="japanese" lang="ja">は</span> ​ ​ ​ <b>verb [</b><span class="japanese" lang="ja">て</span><b>-form]</b> <span class="japanese" lang="ja">います。</span>` (ch. 51)
   - Filled example sentences never use bold — they're plain `<span class="japanese" lang="ja">...</span>`, confirming bold-English-gloss is reserved specifically for the unfilled template.
   - Appendix B (ch. 54) uses a third variant for its reference "sentence patterns" table: bare letters `N`/`V`/`A` (noun/verb/adjective) inline with particles, no bold — e.g. `N は N を V`. This is a static reference chart, not a fill-in slot.

2. **`<span class="blank">` filled with literal full-width spaces** is the standard exercise/drill fill-in slot, almost always paired with a parenthesized substitution cue giving the word(s) to insert. Confirmed in chs. 14, 15, 17, 18, 19, 22, 23, 24, 26, 29, 30, 32, 37, 38, 39, 42, 43, 46, 47, 48, 51:
   - `<p class="num-hang spaceabove"><b>1.</b> ​ ​ <span class="blank">             </span> (<span class="japanese" lang="ja">ホフマンさん、ドイツじん</span>)</p>` (ch. 14)
   - `<p class="num-hangB spaceabove">B : <span class="blank">             </span> (<span class="japanese" lang="ja">ぎんざで かいものを します、えいがを みます</span>)</p>` (ch. 42)

   Related sub-conventions inside EXERCISES:
   - `<span class="underline colorU">` wraps the word in a worked **`e.g.`** line to show which word gets swapped — this marks the model, not a blank itself: `<span class="japanese" lang="ja"><span class="underline colorU">スミスさん</span>は <span class="underline colorU">アメリカじん</span>です。</span>` (ch. 14, and recurring throughout).
   - Bare arrow `→` with nothing after it, for "transform this sentence" drills (ch. 42): `<b>1.</b> ​ ​ <span class="japanese" lang="ja">きます</span> →`
   - Plain answer stubs with **no blank marker at all** (`A :` / `B :` followed by nothing) for free-composition items (chs. 34, 35, 37).
   - **Quiz chapters** (20, 27, 35, 44, 52) sometimes use plain parenthesized full-width spaces `( ​ ​ ​ )` instead of `<span class="blank">`, e.g. ch. 20: `<span class="japanese" lang="ja">これは</span> ( ​ ​ ​ ​ ​ ​ ) <span class="japanese" lang="ja">の ペンですか。</span>`, drawing from a word bank shown above the item (`<div class="Abox0 dynamic_box">`).
   - Numbered cloze slots `(1.)` embedded directly in dialogue text also appear in quizzes (ch. 44, 52) paired with a word-bank box.

### Attachment-Point Markers (prefixes/suffixes on individual entries)

Confirmed real and important, but its usage **differs between lesson vocabulary tables and the back-of-book Glossary** — extraction passes should not assume it's absent just because a given lesson's `voca` table doesn't show it.

- **In lesson VOCABULARY tables** (`<table class="voca">`), the wave dash `〜` is attached directly to a bound morpheme and given its own row, almost always as an indented `<td class="sub">` or `<td class="sub2">` sub-entry beneath a parent headword (marking it as a component/derivation of that word), e.g.:
  - Suffixes: `〜さん` (Mr./Ms.), `〜です`, `〜じん` (-ese/-ian), `〜はん` (…thirty/half past), `〜えん` (…yen), `〜ほん`/`〜まい` (counters), `〜かい/がい` (…floor), `〜じ`/`〜ふん/ぷん` (o'clock/minutes) — chs. 14, 15, 17, 18, 19
  - `〜ばん` (number suffix), `〜ねん`/`〜ようび`/`〜がつ`/`〜にち` (date suffixes), `〜たち` (plural), `〜さま` (very polite Mr./Ms.), `〜や` (shop/restaurant suffix), `〜ご` (language) — chs. 22, 23, 26
  - `〜って なんですか`, `〜ごろ` (about, time) — chs. 32, 33
  - `〜の あと` (after), `〜ふん/ぷん(かん)`, `〜か/にち(かん)`, `〜しゅうかん`, `〜かげつ(かん)`, `〜ねん(かん)` (duration counters), `〜ばんせん` (platform…), `〜め` (ordinal suffix), `〜について` (about), `〜ど` (…degree), `〜まえ` (…ago) — chs. 42, 43, 46, 47, 48
  - Prefixes: `お〜` (honorific/polite prefix, ch. 14, 17), `ご〜` (honorific prefix, ch. 26)
  - A distinct **parenthetical-optional-prefix** convention also appears, not using `〜`: `(お)さけ` — the honorific お shown in plain parens directly prepended with no space (ch. 48).
  - **Caveat:** in ch. 51's Family vocabulary table, honorific variants are instead spelled out as two full parallel rows (こども / おこさん) rather than using an `お〜` sub-entry — so not every lesson table uses the wave-dash shorthand even where it would apply; check each table rather than assuming.

- **In the Glossary chapters (55, 56)**, the wave dash is used systematically and is the *primary* organizing convention for bound morphemes, e.g. the very first prefix entries under あ are `お〜 (honorific prefix)` and `お〜 (polite prefix)`, followed by suffix counters like `〜えん…yen`, `〜か(かん)…days`, `〜かげつ(かん)…months`, and cross-reference arrows like `あと→〜のあと after`.

- No wave-dash examples could be checked in chs. 1–10 (front matter only, no vocabulary tables present there).

## Content Section Markers

Consistent skeleton across every Lesson chapter (14, 15, 17–19, 22, 23, 26, 29, 30, 32–34, 37–39, 42, 43, 46–48, 50, 51):

- **Lesson title**: `<div class="figure_nomargin figure_heading"><h1 class="width_100"><img alt="LESSON N: Subtitle: English tagline" class="fill" src="..."/></h1></div>` — the title is rendered **as an image**; the full text is only recoverable from the `alt` attribute (no visible text node).
- **`TARGET DIALOGUE`**: `<div class="track"><h2 class="track_head"><span class="target"><b>TARGET DIALOGUE</b></span> <span class="audio-icon">...</span></h2>` → `<div class="track-pad"><div class="dialogue">` with alternating `<p class="spkr">Name :</p>` / `<p class="dial">line</p>`, Japanese block first, then the same structure repeated in English. A recap/summary line uses `<p class="sq-hang spaceabove"><span class="figure_inline">...squ.jpg.../span> ...`.
- **`VOCABULARY`**: `<div class="voc-box"><h3 class="voc"><span class="voc"><b>VOCABULARY</b></span></h3><div class="voc-boxS"><table class="voca">`, two `<td>` columns (Japanese / English gloss); recurs after dialogue, after GRAMMAR, after WORD POWER, and even nested inside EXERCISES for minor incidental vocab.
- **`NOTES`**: `<h2 class="note"><span class="note"><b>NOTES</b></span></h2><ol><li class="number_list">` — numbered usage/grammar notes, often quoting the exact dialogue phrase before explaining it.
- **`KEY SENTENCES`**: `<div class="key-sentence-box"><h2 class="head"><b>KEY SENTENCES</b></h2>`, two parallel numbered `<div class="custom_list" role="list">` blocks (Japanese, then English).
- **`GRAMMAR`**: `<h2 class="grammer"><span class="grammer"><b>GRAMMAR</b></span></h2>`, numbered points `<p id="cNN-nN">` each followed by `<p class="key-sentence-ref sans">(KS1, 2)</p>` cross-referencing Key Sentences — this cross-ref tag is a reliable signal you're in real grammar content.
- **`WORD POWER`**: `<h2 class="word-power"><b>WORD POWER</b></h2>` — thematic vocab sets via `<figure class="figure_small_caption">`/`figure_medium_caption` (illustration + numbered caption) or `<table class="tab1 FS-95">` grids, usually followed by its own nested `voc-box`.
- **`SPEAKING PRACTICE`**: `<h2 class="speak-prac"><b>SPEAKING PRACTICE</b></h2>` — additional real dialogues (`<div class="dialogue1">`), same structure as TARGET DIALOGUE, genuine content.
- **Active Communication**: `<div class="active-comm">` with a fixed banner image (`Page_008_Image_0001.jpg`, reused verbatim book-wide) followed by real task prompts — the banner is decorative, but the prompts beneath it are genuine.
- **Unit-opener chapters** (13, 16, 21, 24, 28, 31, 36, 41, 45, 49) are minimal: one full-page banner image (`alt="UNIT N TOPIC"`) + one `<p class="opener">` English-only cultural blurb — no Japanese content, no vocabulary at all.
- **Casual Style chapters** (40, 53): unique structure with `<table class="tab1 serif">` (or `tab1`) two-column ですます-style vs. casual-style comparison, each followed by explanatory prose, plus `<h3 class="sample">SAMPLE DIALOGUE N</h3>` sections. No EXERCISES section exists in these chapters at all.
- **Glossary chapters** (55, 56): flat alphabetical structure, `<p class="gls" id="X"><span class="bg0"><b>X</b></span></p>` letter headers, per-entry `<p class="gls">` lines (Japanese + English + page-number link) — no headings/exercises, just paired vocab (subject to the wave-dash note above).
- **Appendix "Target Dialogues"** (tail of ch. 54): repeats every lesson's dialogue text under `<b>LESSON N</b>` headers, kana/kanji only, no vocab boxes.

## Exercise Section Markers (skip these)

- **`<h2 class="exer"><b>EXERCISES</b></h2>`** cleanly opens the drill block in every lesson chapter.
- **Whole-chapter Quizzes** (chapters 20, 27, 35, 44, 52) use `<h1 class="quiz-head"><b>Quiz N</b> <span class="quiz-small">(Units X-Y)</span></h1>` instead, and contain **no** TARGET DIALOGUE/KEY SENTENCES/GRAMMAR/WORD POWER at all — skip these chapters wholesale.
- Drill items sit in `<div role="listitem">` inside `<div class="custom_list notop nobot" role="list">`, opened by a small roman-numeral badge icon (`enum-I.jpg`…`enum-XII.jpg`; quizzes use `qnum-*.jpg`; WORD POWER subsections use the visually-identical `wnum-*.jpg`) and an italic bold instruction: `<span class="serif"><b><i>State where someone will go.</i></b></span>`.
- Worked examples use classes `eg-hang`/`eg-hangA`/`eg-hangB`/`eg-spkr` with `<b>e.g.</b>`; actual student items use `num-hang`/`num-hangA`/`num-hangB`/`num-hang0` — this class-name split is the most reliable text-only signal of "drill" vs. "content."
- `<span class="underline colorU">` inside an `eg-hang` line marks the word that varies per item (see Placeholder Notation above).
- Audio-based cloze items are explicitly introduced by the sentence "Listen to the audio and fill in the blanks based on the information you hear." (or "...and choose the correct answers," with circled-letter options ⓐⓑⓒ) plus an `audio-icon` image.
- **Caveat**: a `voc-box` VOCABULARY table sometimes appears *nested inside* an EXERCISES `listitem` (usually for a proper noun or minor item needed only for that one drill). These small nested vocab boxes are arguably worth keeping even though they're physically inside an exercise container — use judgment rather than blanket-skipping every nested `voc-box`.
- Verb/adjective conjugation tables are sometimes rendered as **images** inside EXERCISES (see Image-Embedded Content) — treat these as exercise material to skip, even though they're data-rich, since the underlying vocabulary was already glossed earlier in the lesson.

## Image-Embedded Content

Whenever a chapter has images near a content heading, open them — several carry real teaching content with empty `alt` text.

**Content-bearing (the image IS the vocab/phrase content) or reference charts as images — extraction passes should open these explicitly:**
- Ch. 2: hiragana syllabary chart (`Page_268_Image_0001.jpg`) — the entire chapter's content.
- Ch. 3: katakana syllabary chart (`Page_269_Image_0001.jpg`) — same, for katakana.
- Ch. 14: `Page_004_Image_0001.jpg` — world map with numbered circles ❶–⑭ tying to countries/nationalities vocab list; `Page_011_Image_0001.jpg` — illustrated business card with Japanese+English labels for business vocabulary (めいし, かいしゃの なまえ, etc.).
- Ch. 19: `Page_040_Image_0002.jpg` — full numbers/counters reference table (まい/ほん/つ series) baked entirely into the image; no text elsewhere duplicates it.
- Ch. 26: `Page_076_Image_0001.jpg` — 12-panel numbered food/drink illustration (①–⑫) tied to a text vocab list; `Page_086_Image_0006.jpg` — labeled family-tree diagram with numbered relations; `Page_087_Image_0001.jpg` — frequency-adverb reference chart (いつも/よく/ときどき/あまり…〜ません/ぜんぜん…〜ません plotted on a percentage scale).
- Ch. 32: `Page_116_Image_0001.jpg` — labeled 5-story building cross-section (うけつけ, ゆうびんきょく, かいぎしつ, ちゅうしゃじょう); `Page_116_Image_0002.jpg` — labeled hotel-room items diagram.
- Ch. 37: `Page_145_Image_0001.jpg` — verb-conjugation-type grouping mnemonic (Regular 1 / Regular 2 / Irregular verb lists rendered as an illustrated card-box).
- Ch. 42: `Page_178_Image_0001.jpg` — schedule table (Day/City/Activity) used as data source for a drill (still worth surfacing even though it's exercise-adjacent).
- Ch. 47: `Page_201_Image_0009.jpg` — labeled body-parts diagram, numbered ①–⑩, anchoring the あたま/め/は/のど/etc. vocab list.
- Ch. 51: `Page_234_Image_0001.jpg` — quiz image pairing three portraits with real ○/×-marked language-name vocab (フランスご/ドイツご, etc.); the vocab pairing exists only in the image, even though it's inside an EXERCISES block.
- Ch. 54 (Appendix D/F): `Page_244_Image_0001.jpg`, `Page_245_Image_0001-3.jpg` — full Regular-1/Regular-2/Irregular verb conjugation reference tables as images; `Page_247_Image_0001-2.jpg` — これ/それ/あれ/どれ demonstrative-pronoun reference grids (Basic and Polite forms) as images.

**Reference charts/tables rendered as images inside EXERCISES** (data-rich but still exercise material — treat per the "skip exercises" rule, though the underlying data may be worth preserving separately): ch. 32 `Page_117_Image_0013.jpg` (あります/います conjugation table); ch. 26 `Page_087_Image_0002.jpg` and ch. 30 `Page_108_Image_0001-2.jpg` (verb/adjective conjugation drill tables); ch. 34 `Page_134_Image_0002.jpg` / `Page_135_Image_0001.jpg` (gift-giving drill data); ch. 38 `Page_154_Image_0001.jpg` (invitation-drill prompt).

**Labeled diagram/photo, borderline (real Japanese text baked into the image itself, not just a caption):** ch. 9, character-roster portraits (`Page_xvi_Image_0001.jpg` through `_0012.jpg`) — each cartoon portrait has the character's name rendered in katakana as part of the image pixels (e.g. スミス), with the figcaption below giving only an English prose description — the katakana reading exists nowhere else in the markup.

**Decorative/illustrative — skip, no unique text:**
- Most single-icon-per-caption WORD POWER illustrations across nearly every lesson chapter — the caption text beside the icon already carries the vocabulary word as plain HTML text, so the image adds a visual mnemonic only, not new content (chs. 18, 22, 23, 26, 29, 30, 43, 48, etc.).
- Dialogue-scene illustrations accompanying TARGET DIALOGUE (large scene art, `alt=""`, no baked-in text).
- Unit-opener and lesson-title banner images — their text is fully duplicated in the `alt` attribute and is purely typographic/decorative.
- Chapter 57's four full-page images — publisher advertising for other books in the series; skip wholesale.

**Inline functional icons — UI furniture, not content, skip without opening:**
- `squ.jpg` — small solid teal square/dot bullet marking dialogue-summary/recap lines.
- `audio-*.jpg` (e.g. `audio-016.jpg`) inside `<span class="audio-icon">` — speaker/audio-track marker next to TARGET DIALOGUE, KEY SENTENCES, WORD POWER, and audio-cloze exercise headings throughout the book.
- `enum-*.jpg` / `wnum-*.jpg` / `qnum-*.jpg` — small filled-circle roman-numeral badges numbering EXERCISES / WORD POWER subsections / Quiz items respectively.
- `Page_008_Image_0001.jpg` — the recurring "Active Communication" section banner.
- `logo.jpg` — inline "free audio available" logo in the copyright page (ch. 6/copyright area).

## Other Notes

- **Chapter `<title>` pattern**: `"Lesson N: Subtitle, Japanese for Busy People Book 1: Kana"` / `"Unit N: Topic, ..."` / `"Quiz N (Units X-Y), ..."` / `"Casual Style N, ..."` — a reliable per-chapter content-type signal independent of body markup. Front-matter chapters (1–10) use descriptive titles like `"Preface to the Revised 4th Edition, ..."` or `"Characteristics of Japanese Grammar, ..."`. Chapter 57's title is the generic "Continued" (meaningless, publisher back matter).
- **Unit/Lesson numbering**: 10 Units total, each with 2–3 Lessons and typically closing with a Quiz chapter (e.g. Unit 1 = Lessons 1–2 → Quiz 1). This maps chapter-file numbers to lesson numbers non-trivially (e.g. chapter file 51 = Lesson 24) — don't assume chapter-file number equals lesson number.
- **Vocabulary is almost always explicitly glossed**, not left to context-inference: every new term gets a row in a `voc-box` table the first time it appears (dialogue, key sentence, grammar point, or word-power set). Very little is purely contextual, per the book's own Introduction (ch. 9): "Newly introduced vocabulary is given with English translations in the shaded sections at the bottom of the pages."
- **Index anchors** `<a id="indNNNa"/>` are scattered throughout as invisible back-of-book-index targets — not content, safe to strip/ignore.
- **Page-break markers** `<span epub:type="pagebreak" id="page_NNN" .../>` appear inline, sometimes mid-sentence or mid-heading — pagination metadata only, not content.
- **Data-quality flag**: chapter 47's KEY SENTENCES section has visibly corrupted/garbled Japanese text (missing characters, e.g. `この の ゃしんを っても いですか` where a complete sentence is expected) — likely an extraction/encoding artifact specific to that block; flag for manual review if used as source text.
- **Recurring section order** within a lesson: TARGET DIALOGUE → VOCABULARY → NOTES → KEY SENTENCES → GRAMMAR → VOCABULARY → WORD POWER (+ nested VOCABULARY) → EXERCISES (+ occasional nested VOCABULARY) → SPEAKING PRACTICE (+ NOTES) → Active Communication (+ VOCABULARY).

## Coverage

All 57 chapter files were read in full, start to end, via parallel research passes (each chapter confirmed fully read with offset continuation where a single file exceeded one read call — notably chs. 6, 14, 15, 17–19, 22, 23, 54, 55, 56):

- Chapters 1–10 ✅ (front matter)
- Chapters 11–20 ✅
- Chapters 21–30 ✅
- Chapters 31–40 ✅
- Chapters 41–50 ✅
- Chapters 51–57 ✅

No chapter was left partially read.

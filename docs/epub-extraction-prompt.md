# Overview

Read the file at this exact path yourself using your Read tool — it is the raw XHTML source of ONE chapter from a {{TARGET_LANGUAGE}}-language textbook for English speakers:

{{CHAPTER_FILE_PATH}}

Use the file's structure (headings, CSS classes, tag nesting) as signal for what kind of content each part is. Go through the ENTIRE file top to bottom — do not skip any part of it. If the file is long enough that your Read tool would otherwise truncate it (e.g. a default line-count limit), issue additional reads with an offset to cover the rest of the same file — never treat a partial read as if you'd read the whole thing. This matters doubly for a multi-file lesson: the file may be several spine files concatenated (separated by `<!-- anki-builder: spine chapter N -->` comments), and a truncated read silently drops the later files' content entirely.

A **Book-Wide Conventions** section sits at the END of this prompt. It describes how THIS book marks things up, and it is there to help you FIND things. It never decides what you extract: the rules below do. Read the rules first.

## Why

The data you extract here will become flashcards in an Anki deck used to learn this language. Prioritize content that actually helps someone learn to speak and recognize the language — real vocabulary, real sentences — over exhaustively cataloguing every explanatory detail in the chapter.

## Handling Uncertainty

If you're genuinely unsure whether something should be included, include it anyway and set `"uncertain": true` with a brief reason in `"reviewNote"` (the internal review field — see below), rather than silently deciding either way.

## Output Format

Respond with ONLY a single JSON object (no markdown fences, no prose before or after), with two keys: `items`, the flashcards, and `coverage`, an account of what you read.

```
{"items": [ ...one object per flashcard, see below... ],
 "coverage": {
   "imagesOpened": ["<every image file you actually opened and looked at, by path>"],
   "imagesSkippedAsDecorative": ["<every image you decided was decorative WITHOUT opening it>"],
   "concerns": ["<anything that stopped you covering this chapter fully, one short line each>"]
 }}
```

**`coverage` is checked, so it must be true.** Every image this chapter references is known from its markup, and your two image lists are diffed against that set: an image in neither list is reported as unaccounted for. An image you opened goes in `imagesOpened` whatever you concluded about it; one you dismissed on position or filename alone goes in `imagesSkippedAsDecorative`. Do not list an image as opened that you did not open.

**`concerns` is where an incomplete read becomes visible.** A chapter you could not fully read must not produce the same output as a chapter with little in it: say so instead. A file too long to read in full, a chart you could not make out, a section whose content is clearly in an image you could not resolve, a conflict between these rules and the book conventions at the end of this prompt — one line each. An empty `concerns` list is a claim that nothing got in your way.

One object per flashcard, inside `items`:

**Important: preserve textbook order.** Emit items in exactly the order they appear in the chapter, top to bottom — do not reorder them, do not group them by type (e.g. all vocabulary together, then all key sentences), and do not sort them any other way. The sequence in the output must match the sequence in the source file.

```
{"id": "<short slug>", "english": "<English side>", "target": "<{{TARGET_LANGUAGE}} text, verbatim from the file — EXCEPT placeholder markers (〜, ～, ~), which must be resolved or stripped per Handling Placeholders below>", "ttsText": "<optional — what TTS speaks instead of target when the written target would be misread; see Spoken form below>", "category": "<exactly one value from the category list below>", "scene": "<optional, omit if none>", "hint": "<optional, omit if none>", "note": "<optional, omit if none>", "reviewNote": "<optional, omit if none>", "uncertain": <true, only if genuinely unsure this item should be included — omit otherwise>, "aiSuggested": <true, only if this is a critical-gap suggestion you added yourself, not something literally in the file — omit otherwise>}
```

## What a card looks like

{{CARD_FACES}}

**Four note fields — keep them strictly separate.** There is no single blended `notes` field; every note you write goes into exactly one of:

- **`scene`** — a short situation cue shown on the FRONT of BOTH card directions: the question just asked, who is speaking, or what is already under discussion. Use it whenever the sentence is ambiguous or unanswerable without its context: an elliptical reply ("answering whose bag this is", "the wine is already under discussion, so it is not named"), a set phrase tied to a moment ("said when entering another person's room", "answering the phone"), or one word of an ambiguous pair ("counting, not the particle"). Because it renders on both fronts, a scene must NEVER contain or paraphrase the answer in either direction: it sets the stage and stops there. Keep scenes in English, short (a few words).
- **`hint`** — a short English-side disambiguator shown ONLY on the Production (English→{{TARGET_LANGUAGE}}) front; on the Recognition front it would hand over the answer, so there it shows on the back. Its job is telling apart two cards whose ENGLISH prompt collides ("the object you read" vs the counter; "warm but casual" vs the formal thank-you) by describing the target word's meaning, register, or form. **A `hint` must ADD context the card doesn't already show — NEVER restate the English gloss or the reading.** A hint like `phrased as "wine from France"` on the card glossed "This is a wine from France." adds nothing, so **omit it.** If the cue you want to write describes the SITUATION rather than the word itself, it belongs in `scene`, not `hint`. Do NOT move meaning-integral parentheticals like "(person)" or "(honorific prefix)" — those stay in `english`.
- **`note`** — BACK-of-card context shown AFTER the learner answers: when/how to use it, register (casual vs polite), how it differs from a related card, the relationship between two words (e.g. "お (o) + かし (kashi) = おかし (okashi); the everyday form of かし (kashi)"). Write it as study context, not meta-commentary. **A `note` must ADD something the card doesn't already show — NEVER restate the card.** If the note just repeats the English gloss ("Where is the wine shop?" on the card `ワインショップはどこですか / Where is the wine shop?`) or re-gives the reading already in the pronunciation ("First floor (read いっかい)"), it teaches nothing — **omit `note` entirely.** Most number/counter cards (`Nine (flat objects) / きゅうまい`), plain nouns, and self-evident sentences need NO note; only write one when there's a genuine, non-obvious point. **Whenever a `scene`, `hint` or `note` quotes {{TARGET_LANGUAGE}} text in a non-Roman script (kana/kanji, Cyrillic, Hebrew, …), ALWAYS follow it immediately with BOTH its romanization AND an English gloss, in parentheses** — `はじめまして (hajimemashite, "nice to meet you")`, not bare `はじめまして` and not `はじめまして (hajimemashite)`. The learner may not yet read the script, and on a `scene` or a `hint` the quoted text sits on a FRONT they must parse before they can answer, where romaji alone gives them the sound and still leaves them stuck on the meaning. A purely grammatical string with no English meaning (`〜ます (masu)`) takes romanization only. So does any gloss that would give away the card's own answer: a `scene` shows on the Recognition FRONT where the answer IS the English, so gloss a quoted question by its shape ("a yes/no question about the shop") rather than translating it literally. **And when a note compares this card to another one, describe that other word the way THIS book glosses it, not the way you happen to know it.** A word almost always means more than the chapter has taught, and reaching for the fuller meaning produces a note that is true in general and wrong for this learner — こちら (kochira) means "this way" in ordinary Japanese, but if the book has introduced it as "this one (polite for 'this person')", that is the only sense the learner has.
- **`reviewNote`** — INTERNAL rationale for the human review gate ONLY; the learner NEVER sees it and it is never embedded in the deck. Use it for anything about whether the card should EXIST: why it's `uncertain`, why you added it as an `aiSuggested` gap, or source provenance/decisions ("not literally in this chapter", "translation inferred by combining にほん + じん", "placeholder filled with 'コーヒー' as a natural example — source shows only '〜を おねがいします'"). No romanization needed (internal).

An item may set any combination. Rule of thumb: sets the SITUATION the sentence lives in (safe to show before answering in either direction) → `scene`; tells two colliding ENGLISH prompts apart by describing the word itself → `hint`; helps the learner USE the card once known → `note`; explains a decision YOU made about the card → `reviewNote`.

**Write the `english` side in natural sentence case.** Capitalize the first word (and proper nouns) as you would writing normal English — even for a bare vocabulary word or fragment. `"Department store"`, `"Coffee"`, `"How much?"`, `"By means of (particle)"`, `"That's right"` — never lowercased clips like `"department store"`, `"how much"`, or `"by means of (particle)"`. Punctuate full sentences and questions normally (`.` / `?`). This is only about the English gloss reading like real English; leave the `target` verbatim. **Capitalization is for English meaning text ONLY — never a romanization.** A romanized reading (romaji, pinyin, etc.) always stays lowercase; on the rare card whose `english` value is itself a reading rather than a meaning (e.g. a kana character card glossed `"ka"`), leave it lowercase — do not capitalize it.

**Spoken form (`ttsText`) — keep the digits in `target`, spell them out in `ttsText`.** `ttsText` is the text TTS speaks instead of the target whenever the written target would be misread (numerals AND kanji-bearing targets); it is never rendered on any card face, so it is TTS input and nothing else. Textbooks often print numbers as digits (prices, floors, counts — e.g. `2,000えん`, `５かい`, `２ほん`). Keep the `target` exactly as the book writes it (digits are the natural card display), but WHENEVER a `target` contains any numeral (ASCII `0-9` or fullwidth `０-９`), ALSO emit a `"ttsText"` field: the entire target rewritten with every number spelled out in {{TARGET_LANGUAGE}}'s own script and number words, and nothing else changed. For Japanese that means kana with the correct counter readings — `2,000えん` → `"にせんえん"`, `５かい` → `"ごかい"`, `２ほん` → `"にほん"`, `この Tシャツは 2,000えんです。` → `"この Tシャツは にせんえんです。"`. This matters because the downstream romanizer and the text-to-speech engine both mishandle bare digits (they read `2,000` as an English "two thousand" or leave it as literal `2 , 000`); the spelled-out `ttsText` is what actually drives the pronunciation guide and the audio, while `target` stays the clean display form. Omit `ttsText` entirely when the written `target` reads unambiguously on its own.

**Category list — `category` MUST be exactly one of these values, verbatim:** {{CATEGORY_LIST}}. If nothing else fits, use `"Other"`.

## Handling Placeholders

Textbooks commonly write a grammar pattern or attachment point using a placeholder-like character — e.g. 〜さん, お〜, 〜を おねがいします. These are typographical conventions, not part of the spoken word, and can appear as any of several near-identical characters depending on how the source was digitized: 〜 (wave dash), ～ (fullwidth tilde), or a plain ~. Treat all of these as the same placeholder marker. **An ellipsis is one too**: `…`, `⋯` and a run of `...` mark a slot exactly as a wave dash does, and are just as unspeakable in a `target`.

**Never leave a placeholder character in the final `target`.** Decide per item, using your best judgment:

- **The item IS the grammatical particle/suffix/prefix itself** — its English gloss describes the particle's own function or meaning (e.g. "Mr., Mrs., Ms., Miss" for さん, "(honorific prefix)" for お). Strip the placeholder and keep only the actual morpheme in `target` (e.g. `さん`, not `〜さん`; `お`, not `お〜`). Do NOT invent a concrete example to fill it — that would misrepresent a general-purpose particle as one specific case. Instead, record in **`note`** whether it's a prefix or suffix and what it attaches to (e.g. "Suffix — attaches after a person's name"), since that's real learner-facing information the stripped placeholder would otherwise lose. (If you also want to note the source spelling, that provenance goes in `reviewNote`, e.g. "written 〜さん in the source".)
- **The item is a phrase-level usage pattern meant to be spoken as a complete unit** — its English gloss describes an action or request rather than a particle's own meaning (e.g. "please (get me…)"). Replace the placeholder with a natural, contextually-appropriate word or phrase, chosen using your best judgment — prefer reusing a word already introduced elsewhere in this chapter when a sensible one exists. Record exactly what you filled in and why in **`reviewNote`** (e.g. "Placeholder filled with 'コーヒー' (coffee) as a natural example — not literally present in the source text at this point") — that's a decision you made, not something the learner needs.

- **The pattern has TWO slots, spread across the phrase** — a discontinuous pattern like `X…〜Y`, `〜から〜まで`, `だれも…〜ません`, `いつも…〜ます`. Both slots belong to one construction, so resolve BOTH into a single natural utterance rather than filling one and leaving the other: `だれも…〜ません` becomes `だれもいません` ("There is no one."), `〜から〜まで` becomes something like `くじからごじまで` ("from 9:00 to 5:00"). Half-resolving is the failure to avoid — a `target` with one slot filled and one placeholder left is not something a person can say, and the TTS voice reads the leftover marker aloud. Record the source spelling in **`reviewNote`** (e.g. "source prints だれも…〜ません; both slots resolved into one sentence"), and fix the gloss to match the sentence you built: a schematic row's bare label ("No one") stops being right once the card is a sentence ("There is no one.").

When genuinely unsure which of these applies, prefer resolving it into a phrase over leaving a placeholder — an unresolved placeholder character is never a valid `target`.

## Example Output

Showing a plain item, a card-note item, an uncertain item (reviewNote), an AI-suggested item
(reviewNote), and both kinds of placeholder resolution — note how learner context goes to `note`
and inclusion/provenance rationale to `reviewNote`:

```json
[
  { "id": "sumimasen", "english": "Excuse me.", "target": "すみません。", "category": "Greetings" },
  {
    "id": "shitsurei-enter",
    "english": "Excuse me.",
    "target": "しつれいします。",
    "category": "Greetings",
    "scene": "said when entering another person's room",
    "note": "The same phrase しつれいします (shitsurei shimasu) also means a formal 'good-bye' — context tells which is meant."
  },
  {
    "id": "yoroshiku",
    "english": "I look forward to working with you.",
    "target": "よろしく おねがいします。",
    "category": "Greetings",
    "note": "Usually combined with はじめまして when being introduced"
  },
  {
    "id": "nihonjin",
    "english": "Japanese (person)",
    "target": "にほんじん",
    "category": "Nationalities & Countries",
    "reviewNote": "Translation inferred by combining にほん + じん; not separately glossed in the source",
    "uncertain": true
  },
  {
    "id": "arigatou-suggestion",
    "english": "Thank you",
    "target": "ありがとう",
    "category": "Greetings",
    "reviewNote": "Basic thanks — not present in this chapter's text, but a genuine gap for a learner at this level",
    "aiSuggested": true
  },
  {
    "id": "san-suffix",
    "english": "Mr., Mrs., Ms., Miss",
    "target": "さん",
    "category": "Family & People",
    "note": "Suffix — attaches after a person's name",
    "reviewNote": "Written 〜さん in the source"
  },
  {
    "id": "onegaishimasu-pattern",
    "english": "Please (get me a coffee)",
    "target": "コーヒーを おねがいします",
    "category": "Grammar & Function Words",
    "reviewNote": "Placeholder filled with 'コーヒー' (coffee) as a natural example — the source shows only '〜を おねがいします'"
  }
]
```

...and the whole response wraps those items in the envelope:

```json
{
  "items": [ ... the items above ... ],
  "coverage": {
    "imagesOpened": ["images/Page_076_Image_0001.jpg", "images/Page_077_Image_0002.jpg"],
    "imagesSkippedAsDecorative": ["images/banner.jpg"],
    "concerns": [
      "The kana chart on the second page is an image I could not read clearly; its rows may be under-extracted."
    ]
  }
}
```

## Step 1: Extract

Evaluate BOTH the English and the {{TARGET_LANGUAGE}} text; do not favor one language when deciding what counts as content.

### Images

Pay attention to this chapter's images and do not rule them out as sources of content just because the surrounding HTML has no extractable text for them (an `<img>` tag's `alt` attribute is often empty or missing even when the picture itself carries real teaching content). For every image that sits inside or right next to a content section in this chapter, resolve its file path relative to the chapter file and open it yourself with your Read tool to see what's actually in it, rather than assuming it's decorative. When Book-Wide Conventions above names this chapter or a similar one as having image-embedded content, treat that as a strong signal to check here specifically. Look out for:

- **Content-bearing images** — the image itself IS the vocabulary/phrase/translation content (e.g. a phrase presented as an illustrated panel with the target-language text, its English gloss, and a usage note drawn into the picture). Extract these exactly as you would extracted text, following the same rules below.
- **Reference charts/tables as images** — a kana chart, conjugation table, or grammar-pattern table rendered as a picture rather than an HTML table. Extract genuine vocabulary/pattern entries from these the same way you would from an equivalent text table.
- **Labeled diagrams/photos** — a diagram, map, or photo with a label that is itself real vocabulary (e.g. a floor plan with room names, a photo captioned with a food's name).
- **Decorative/illustrative images** — art that accompanies a section but carries no unique text of its own. Skip these — no card needed.
- **Inline functional icons** — small in-line markers like an audio-clip icon next to a heading. These are UI furniture, not content — skip them without needing to open the file.

If you open an image and it turns out to be decorative, that's a fine outcome — the point is to actually look rather than to assume from absent alt text.

### What to extract

- Every vocabulary word or short phrase presented as an individual term with its translation — including particles and other short function words, wherever they're listed as vocabulary (not buried in a grammar explanation paragraph).
- Every curated model/example sentence presented as one of the chapter's core spoken examples (often labeled "Key Sentences" or similar, often numbered, often the sentences the rest of the chapter refers back to).

**Every headword in a VOCABULARY block becomes an item.** A chapter usually has several such blocks, scattered between the exercises rather than gathered in one place — walk each one to its end and account for every entry in it. The only headwords you may leave out are the proper nouns covered under "What to skip entirely" below (a surname or a fictitious business used only to populate a drill). If you extract nothing for a headword, that is a miss, not an editorial choice.

**A vocabulary block's indented sub-rows are headwords too.** Textbooks often break a compound entry into its parts on indented rows beneath it (e.g. under おかし: `お〜 (honorific prefix)`, `かし (sweets)`; under もういちど: `もう (more)`, `いちど (one time)`). Those morpheme/word breakdowns are real, individually-glossed vocabulary — extract each one as its own item (applying the placeholder rules to any 〜), alongside the compound, with a `note` tying the parts to the whole. Skipping them because they look like annotations of the parent row is a miss.

**A ／-separated pair of readings teaches TWO readings — never silently keep just the first.** Number and counter charts routinely print alternate readings with a slash: `0 ゼロ／れい`, `4 よん／し`, `7 なな／しち`, `9 きゅう／く`, `3:30 さんじさんじゅっぷん／さんじはん`. Both sides are taught content, and dropping the second silently loses a reading the book explicitly teaches (the learner then never meets れい, し, しち, く at all). Emit the FIRST/primary reading as the item's `target`, and record the alternate in the same item's `note` — e.g. `note: "Also read れい (rei) — both readings are in everyday use."` When the book treats the alternate as a full headword of its own (its own row or gloss, not just a slashed variant), give it its own item instead.

**An item printed on THIS chapter's chart belongs to THIS chapter.** A reference chart (numbers, counters, time words) sometimes ends on an entry that feels like the next lesson's topic — e.g. a 1-100 chart whose last row is 100. If the chart in front of you prints it, extract it here; do not defer it to the chapter where the topic is "properly" covered, because nothing downstream can recover a row you skipped.

**The EXERCISES section is a source of cards, not a no-go area.** It carries two different kinds of
content and you have to tell them apart:

- **Reference material printed among the drills** — above all a conjugation or paradigm table, laying
  one word out across its forms (present/past, affirmative/negative, plain/polite). The instruction
  gives it away: _"repeat the verbs below and memorize their forms"_ is reference; _"make up sentences
  following the pattern of the example"_ is a drill. Extract reference material in full.
- **The drills themselves** — extract the complete, self-contained model sentences (the `e.g.` lines),
  and skip anything that is not a card on its own: bare substitution alternatives like
  `1. (タクシーで) 2. (でんしゃで)`, lines with an unresolved blank, and empty answer slots.

**Use your judgement about how much of it is worth having, because nothing downstream will trim it for
you.** A later pass does de-duplicate practice cards, but it is forbidden from touching anything you
extract — what you emit is the lesson. So apply the restraint yourself: **at most about two examples of
any one sentence pattern**, chosen for variety of vocabulary and context rather than the first two you
meet. For a large paradigm table the same idea applies in the other direction — the complete set of
forms for a few representative words teaches the pattern; one form for every word does not.

**Two limits on that restraint, both learned by getting it wrong.** First, it NEVER applies to a cell
the source marks as irregular or exceptional: sampling is for cells a learner can derive, and an
irregular cell is by definition the one they cannot, so keep every one of them however small the
sample. (A real miss: a ます→dictionary-form chart whose third group was headed **Irregular** was
sampled like the regular ones, and くる and する — the only two irregular verbs in the language, and
the whole reason the chart has a third group — reached the review as the two cells nobody had carded.)
Second, when the table is a DERIVATION (form A becomes form B) rather than a set of forms per word,
the unit to sample is the distinct derivation, not the word: いきます→いく and ききます→きく are the same
row, but かいます→かう, のみます→のむ and かえります→かえる are three others, and a learner shown only the
first cannot produce the rest. Cover each row shape once, then stop.

**When you are genuinely torn, extract it.** A surplus card costs the reviewer one click to exclude. A
missing one is invisible: nothing downstream can flag content that was never emitted, and it will only
surface if a human happens to notice the gap months later.

**A form the chapter names as an EXCEPTION is high priority, never optional.** Grammar and Key-Sentence notes routinely teach a rule and then name the one form that breaks it — "the particle で is attached to the noun indicating the means of transportation… _but_ to say 'by foot,' use あるいて". That exception is the single most confusable item in the lesson, so it must become its own card, even when it appears only inside explanatory prose you would otherwise skip and only as a bare word elsewhere (a substitution-drill alternative, a table cell). Watch for the words _but_, _except_, _instead_, _irregular_ and _does not take_ in a grammar note: whatever follows them is a card.

**Where a chart or table supplies its own English, USE IT — do not paraphrase it down.** A conversion
table that labels a row "tell, teach" is telling you the verb covers both senses; carding it as
"teach" silently narrows what the learner is taught, and nothing downstream can restore the half you
dropped. The same goes for "see, watch", "return, go home" and any other multi-sense gloss the book
prints: keep both halves, in the book's order.

**A numbered picture-caption list is a vocabulary block** (this book calls them WORD POWER). A thematic set presented as an illustration per item with a numbered caption — ①②③ or ❶❷❸ beside a word — is real, taught vocabulary, and the numbering makes it look like a drill when it is not. Extract **every** label in the list, not the ones you recognize: a partial list is the silent miss this rule exists to stop. Where the caption gives the word but the chapter's vocabulary box does not gloss it, supply the English yourself, set `"uncertain": true`, and name the list in `reviewNote` (e.g. "WORD POWER food illustration ⑦; gloss supplied, not in the voc-box"). Where the labels sit inside the image rather than the markup, open the image and read them.

**Ruby annotations: `<rt>` is the publisher's own reading, and it belongs in `ttsText`.** Japanese textbooks mark readings with ruby markup — `<ruby>漢字<rt>かんじ</rt></ruby>` (sometimes with `<rp>` fallback parens around it). The base text is what the learner sees, so it is the `target`; the `<rt>` content is an authoritative reading from the publisher, which is exactly what `ttsText` is for. So: base text into `target`, `<rt>` content into `ttsText`, and **never** merge the two into one string. `漢字かんじ` as a target is wrong in a way nothing downstream can undo. Where a sentence has several ruby annotations, `ttsText` is the whole sentence with each base replaced by its reading. Where the base is already phonetic and the ruby only repeats it, omit `ttsText`. Drop `<rp>` parens entirely — they are print fallback, not content.

### What to skip entirely

- Grammar explanation prose — paragraphs explaining a grammar rule, particle usage, or conjugation pattern in depth. (This does not include a short particle vocabulary entry — see above.)
- The mechanical scaffolding of a practice drill — its numbered substitution alternatives, its blanks, its empty answer slots. The drill's own complete example sentences and any reference table beside them ARE extractable; see "The EXERCISES section is a source of cards" above.
  **But a WORD that appears ONLY in the scaffolding is still vocabulary, and skipping it loses it from the book entirely.** Scaffolding is skipped because it is mechanical, not because its content is worthless: a cue the drill uses and the chapter never glosses anywhere else is a word the learner is expected to know and the deck will never teach. Before dropping a cue, ask whether its word appears anywhere else in the chapter — a vocabulary box, an example sentence, a chart. If it does not, extract it, supply the English yourself, set `"uncertain": true`, and name the drill in `reviewNote`. This applies just as much when the cue is printed INSIDE an image: テニス and さけ were dropped from one lesson on exactly this reasoning, appeared in no vocabulary box, and turned out to be carded nowhere in the entire book — while テニス was quoted inside another card's own note, describing a skill the deck could not teach.
- **The dialogue, as a script.** A modeled conversation between named speakers is for listening and rehearsal practice, so do NOT walk it line by line turning its turns into cards: not its reactions, not its recap sentences, not the lines that merely seem useful. **One exception, and only one:** when the dialogue holds the chapter's ONLY sentence demonstrating a function word that Step 2 requires an example for, extract that single line, and give it a `reviewNote` naming the form it illustrates (e.g. `"the only sentence in the chapter using よ"`). That is the whole exception. It is not a licence to mine the dialogue for good sentences: if the form is demonstrated anywhere else in the chapter, use that instead, and if two dialogue lines demonstrate it, take one. The reason the ban bends here rather than Step 2 giving way is that a function word with no sentence showing it at work is a card a learner can recite and cannot use.
- Supplementary/culture notes as standalone cards — fold a learner-facing clarification into the `note` field of the item it clarifies instead.
- Proper nouns naming a specific person (e.g. a surname like "Harris") or a specific organization/business (e.g. "ABC Foods," "Nozomi Department Store," real or fictitious) as standalone vocabulary. Country and city names ARE genuine vocabulary and should be extracted. A name inside a key sentence you're otherwise keeping should stay in that sentence — this only blocks a standalone "here's a name" card.

### Assigning category

Every item needs a `category` from the fixed list above — pick the one that best matches the item's topic (not its grammatical role). A vocabulary word and a full sentence about the same topic get the same category (e.g. a food-related sentence and the word "rice" both get `"Food"`). Use `"Grammar & Function Words"` for particles/conjunctions/question markers, and `"Other"` only when nothing else genuinely fits — before reaching for it, check `"Descriptions & Qualities"` (adjectives and descriptive words: big, cheap, delicious, quiet) and `"Everyday Objects"` (ordinary things that belong to no narrower topic: pen, key, umbrella, bag), which between them cover most of what used to land in `"Other"`.

**A worked example takes the category of the FORM it demonstrates, not of the words it is built from.** A sentence written to show the particle `よ` at work is `"Grammar & Function Words"`, even though it is about coffee: the card exists to teach the particle, and a learner meeting it in the Food pile learns the wrong lesson about why it is there. This applies to every Step-2 example sentence and to any in-chapter sentence you extract specifically because it is the one demonstration of a function word. Only when the sentence is in the chapter as ordinary content, and merely happens to contain the form, does it take its own topic.

## Step 2: Add Critical Gap Suggestions

If, after Step 1, you believe there's a genuinely important word or sentence a learner at this chapter's level would need that the chapter's own text simply does not contain, you may add it — but it MUST be marked `"aiSuggested": true` with a one-line reason in `"reviewNote"`.

**EVERY grammar / function word deserves a worked example — not just particles.** This applies to every item you extracted in Step 1 whose category is `"Grammar & Function Words"` and whose gloss describes the form's own FUNCTION rather than a meaning the learner can picture. That covers particles (が, は, を, も, と, で, から, まで, か), but equally copulas and polite forms (です, でございます, じゃありません), suffixes and prefixes (〜さん, お〜, 〜ばん), conjunctions and fillers (じゃ, では), and question words (どの, だれの). For each one, make sure the corpus contains at least one full **example sentence that actually uses that form in context**.

Work through it in this order:

1. **Look for a sentence you have ALREADY extracted in Step 1.** A Key Sentence, a grammar example or a drill's worked example that contains the form satisfies the requirement, and you must NOT duplicate it. A dialogue line satisfies it only once you have extracted that line under the dialogue exception in "What to skip entirely" above — an unextracted line is not in the corpus and demonstrates nothing to the learner. Check the SPEAKING PRACTICE / dialogue sections specifically when nothing else demonstrates the form: they are the usual home of the one sentence that shows a polite or set form at work, and they are easy to skim past because they read as narrative rather than as a vocabulary list.
2. **If the chapter introduces the form but demonstrates it nowhere, write the example yourself**, marked `"aiSuggested": true`: a natural, level-appropriate sentence reusing vocabulary already introduced in this chapter (or an earlier one) where possible, with a one-line `reviewNote` naming the form it illustrates (provenance for the reviewer, not learner context).
3. **Where the form generalizes, two examples beat one.** One sentence shows the form; a second, built on different vocabulary, shows that it is a slot rather than a fixed phrase. Prefer the chapter's own sentence plus one of your own.

A learner should never meet a function word as a bare gloss with nothing showing it at work: "(polite form of です)" is unusable on its own, because the learner can recite the card and still not know what a sentence containing it looks like. (This is the one case where you DO add an example for a function word — distinct from the Step-1 rule above about not fabricating a filler to resolve a `〜` placeholder ON the form's own vocabulary entry: here you add a SEPARATE example-sentence item and leave that entry as the bare morpheme.)

## Step 3: De-duplicate

Across everything gathered in Steps 1 and 2, de-duplicate across the whole chapter — if the same word or sentence would otherwise appear twice, keep it once. Do not treat two genuinely different words as duplicates just because they're related (e.g. a country name and its nationality-form counterpart, like "Japan" and "Japanese (person)," are two separate real words, NOT duplicates of each other).

**Related pairs need a `note` that explains the relationship, not just the two words side by side.** When you keep two items that are closely related — a bare root and its honorific-prefixed everyday form (e.g. かし/おかし), an affirmative/negative counterpart (e.g. です/じゃありません), singular/plural, casual/polite register, or similar — a learner (and a reviewer) seeing both in a flat list has no way to tell "genuinely different words that happen to look similar" apart from "a stray near-duplicate that should be merged" unless the `note` says so explicitly. This relationship is genuinely useful study context, so it belongs in **`note`** (not `reviewNote`). For each item in the pair, name which one it is (the base/root form vs. the derived/everyday form, the affirmative vs. the negative, etc.), name the other item by its English gloss so it's easy to find, and state the concrete rule connecting them (e.g. "お (o) + かし (kashi) = おかし (okashi)" — with romanization in parentheses per the note rule above). Do this even when only one of the pair strictly needs the explanation — put a short cross-reference `note` on both sides so either card, seen alone, still makes sense.

**An ANSWER line from a dialogue or drill needs a `scene`, and an `english` that matches how much the `target` says.** Chapters are full of question/answer exchanges, and an answer extracted as its own card is studied alone, shuffled, long after the question. Two rules follow. (1) The `english` must be able to produce the whole `target`: if the target states its topic, so must the English — `パーティーはごじです` is "The party is at 5:00.", NOT "It's at 5:00.", because nothing in that shorter gloss would make a learner write パーティーは. Dropping the topic in English is right only when the target drops it too (`にちようびです` → "It's on Sunday."). Read the English on its own and ask whether it could yield exactly that target; if not, it is missing something. (2) An answer that IS elliptical on both sides needs a `scene` naming the question it replies to — "answering where the computer is", "answering when the presentation is" — stating the question and never leaking the answer. Otherwise the card has no discoverable right answer.

**A textbook parenthetical goes to `english` or to `scene`, and one question decides which: does the target drop the same thing?** Source material is full of parentheses, and they are doing two completely different jobs. (1) A parenthetical that **restores a subject, object or topic the target ALSO drops** is part of the meaning and stays in `english`: `にちようびです` is glossed "(The party) is on Sunday." — the Japanese is elliptical in exactly that way, and without the parenthetical the gloss reads "It's on Sunday." and could never yield that target. (2) A parenthetical that **describes the situation** — who is speaking, what was just asked, when the phrase is used — is context and moves to `scene`: "Excuse me. (said when entering a room)" becomes `english` "Excuse me." plus `scene` "said when entering a room". Never both, and never leave a stage direction sitting in `english` where a learner will try to translate it. This is separate from the meaning-integral labels like "(person)" or "(honorific prefix)", which are neither and simply stay put.

**A note that asserts a DECOMPOSITION must be true, and you are the only thing checking it.** When a `note` says "X + Y", "the て-form of X", "distinct from X", or "the same word as X", it is teaching a fact about the language, and a wrong one is worse than no note — the learner has no way to know. Two rules. (a) Name only forms you actually saw in this chapter or in the earlier-lesson digest; do not infer a root you have not met. (b) Do not generalise a pattern from its instances: なんじ and なんにん are not instances of なんの — they are なん plus a counter, and なんの is a different construction. If you are not certain the relationship holds, say what the card does rather than where it came from. (`npm run preflight`'s `note-claims` check lists every note of this shape for a human to verify, along with any form it names that the deck teaches no card for — it can produce the list, but only a person can decide whether the claim is true.)

**A `note` when a card reuses a form the learner already knows but with a different meaning or function (a "false friend within what they know").** A learner who has met a word will read it the way they first learned it, so a card that reuses that surface form in a new role trips them up unless the `note` calls it out. Name the familiar form, its familiar meaning, and how THIS use differs. The classic case is a question word taking の: どこ (doko) alone asks a location ("where is it?"), but どこの (doko no) asks origin or make — "which place's / what brand of" (as in それはどこのコーヒーカップですか, "where is that coffee cup from?"); likewise だれ (dare) "who" → だれの (dare no) "whose", なに (nani) "what" → なんの (nan no) "what kind of". Other cases: a pronoun vs a determiner (それ (sore) "that one" → その (sono) "that ___" before a noun), the same kana serving as a different particle, or a counter reused for a different kind of thing. Only within this chapter can you see part of the pair; the whole-book teachability pass (below) adds these across chapters, backward-only.

## Book-Wide Conventions

The notes below were written by a separate whole-book pass that read every chapter of THIS book once. They describe the book's MARKUP: how it marks a placeholder, what a content section looks like, what a drill section looks like, which chapters carry teaching content inside images.

**Precedence — read this before you read the notes.** The conventions are authoritative about MARKUP and about WHERE things are. They are never authoritative about WHAT TO EXTRACT. Where anything below disagrees with the rules earlier in this prompt about what counts as content, what to extract in full, or what to skip, **the rules above win, every time.** If the notes call a section "exercise material" and the rules above say that shape (say, a conjugation or paradigm table printed among the drills) is reference material to extract in full, extract it in full and note the disagreement in that item's `reviewNote`.

This ordering is not a formality. The notes are cached: they were written once, months before this run, by a pass that could not see the rules you have just read. A rule edited last week loses to a note written in July unless it is stated, so it is stated here.

{{BOOK_CONVENTIONS}}

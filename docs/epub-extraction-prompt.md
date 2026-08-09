# Overview

Read the file at this exact path yourself using your Read tool — it is the raw XHTML source of ONE chapter from a {{TARGET_LANGUAGE}}-language textbook for English speakers:

{{CHAPTER_FILE_PATH}}

Use the file's structure (headings, CSS classes, tag nesting) as signal for what kind of content each part is. Go through the ENTIRE file top to bottom — do not skip any part of it. If the file is long enough that your Read tool would otherwise truncate it (e.g. a default line-count limit), issue additional reads with an offset to cover the rest of the same file — never treat a partial read as if you'd read the whole thing. This matters doubly for a multi-file lesson: the file may be several spine files concatenated (separated by `<!-- anki-builder: spine chapter N -->` comments), and a truncated read silently drops the later files' content entirely.

## Book-Wide Conventions

{{BOOK_CONVENTIONS}}

Use this as grounding for how THIS book specifically formats placeholders, content, and exercises — apply it alongside (not instead of) the general guidance below.

## Why

The data you extract here will become flashcards in an Anki deck used to learn this language. Prioritize content that actually helps someone learn to speak and recognize the language — real vocabulary, real sentences — over exhaustively cataloguing every explanatory detail in the chapter.

## Handling Uncertainty

If you're genuinely unsure whether something should be included, include it anyway and set `"uncertain": true` with a brief reason in `"reviewNote"` (the internal review field — see below), rather than silently deciding either way.

## Output Format

Respond with ONLY a single JSON array (no markdown fences, no prose before or after). One object per flashcard:

**Important: preserve textbook order.** Emit items in exactly the order they appear in the chapter, top to bottom — do not reorder them, do not group them by type (e.g. all vocabulary together, then all key sentences), and do not sort them any other way. The sequence in the output must match the sequence in the source file.

```
{"id": "<short slug>", "english": "<English side>", "target": "<{{TARGET_LANGUAGE}} text, verbatim from the file — EXCEPT placeholder markers (〜, ～, ~), which must be resolved or stripped per Handling Placeholders below>", "reading": "<optional spoken form — include ONLY when target contains a numeral; see Numbers below>", "category": "<exactly one value from the category list below>", "scene": "<optional, omit if none>", "hint": "<optional, omit if none>", "note": "<optional, omit if none>", "reviewNote": "<optional, omit if none>", "uncertain": <true, only if genuinely unsure this item should be included — omit otherwise>, "aiSuggested": <true, only if this is a critical-gap suggestion you added yourself, not something literally in the file — omit otherwise>}
```

**Three note fields — keep them strictly separate.** There is no single blended `notes` field; every note you write goes into exactly one of:

- **`scene`** — a short situation cue shown on the FRONT of BOTH card directions: the question just asked, who is speaking, or what is already under discussion. Use it whenever the sentence is ambiguous or unanswerable without its context: an elliptical reply ("answering whose bag this is", "the wine is already under discussion, so it is not named"), a set phrase tied to a moment ("said when entering another person's room", "answering the phone"), or one word of an ambiguous pair ("counting, not the particle"). Because it renders on both fronts, a scene must NEVER contain or paraphrase the answer in either direction: it sets the stage and stops there. Keep scenes in English, short (a few words).
- **`hint`** — a short English-side disambiguator shown ONLY on the Production (English→{{TARGET_LANGUAGE}}) front; on the Recognition front it would hand over the answer, so there it shows on the back. Its job is telling apart two cards whose ENGLISH prompt collides ("the object you read" vs the counter; "warm but casual" vs the formal thank-you) by describing the target word's meaning, register, or form. **A `hint` must ADD context the card doesn't already show — NEVER restate the English gloss or the reading.** A hint like `phrased as "wine from France"` on the card glossed "This is a wine from France." adds nothing, so **omit it.** If the cue you want to write describes the SITUATION rather than the word itself, it belongs in `scene`, not `hint`. Do NOT move meaning-integral parentheticals like "(person)" or "(honorific prefix)" — those stay in `english`.
- **`note`** — BACK-of-card context shown AFTER the learner answers: when/how to use it, register (casual vs polite), how it differs from a related card, the relationship between two words (e.g. "お (o) + かし (kashi) = おかし (okashi); the everyday form of かし (kashi)"). Write it as study context, not meta-commentary. **A `note` must ADD something the card doesn't already show — NEVER restate the card.** If the note just repeats the English gloss ("Where is the wine shop?" on the card `ワインショップはどこですか / Where is the wine shop?`) or re-gives the reading already in the pronunciation ("First floor (read いっかい)"), it teaches nothing — **omit `note` entirely.** Most number/counter cards (`Nine (flat objects) / きゅうまい`), plain nouns, and self-evident sentences need NO note; only write one when there's a genuine, non-obvious point. **Whenever a `note` (or `hint`) quotes {{TARGET_LANGUAGE}} text in a non-Roman script (kana/kanji, Cyrillic, Hebrew, …), ALWAYS follow it immediately with its romanization in parentheses** — `はじめまして (hajimemashite)`, not bare `はじめまして`, since the learner may not yet read the script. **And when a note compares this card to another one, describe that other word the way THIS book glosses it, not the way you happen to know it.** A word almost always means more than the chapter has taught, and reaching for the fuller meaning produces a note that is true in general and wrong for this learner — こちら (kochira) means "this way" in ordinary Japanese, but if the book has introduced it as "this one (polite for 'this person')", that is the only sense the learner has.
- **`reviewNote`** — INTERNAL rationale for the human review gate ONLY; the learner NEVER sees it and it is never embedded in the deck. Use it for anything about whether the card should EXIST: why it's `uncertain`, why you added it as an `aiSuggested` gap, or source provenance/decisions ("not literally in this chapter", "translation inferred by combining にほん + じん", "placeholder filled with 'コーヒー' as a natural example — source shows only '〜を おねがいします'"). No romanization needed (internal).

An item may set any combination. Rule of thumb: sets the SITUATION the sentence lives in (safe to show before answering in either direction) → `scene`; tells two colliding ENGLISH prompts apart by describing the word itself → `hint`; helps the learner USE the card once known → `note`; explains a decision YOU made about the card → `reviewNote`.

**Write the `english` side in natural sentence case.** Capitalize the first word (and proper nouns) as you would writing normal English — even for a bare vocabulary word or fragment. `"Department store"`, `"Coffee"`, `"How much?"`, `"By means of (particle)"`, `"That's right"` — never lowercased clips like `"department store"`, `"how much"`, or `"by means of (particle)"`. Punctuate full sentences and questions normally (`.` / `?`). This is only about the English gloss reading like real English; leave the `target` verbatim. **Capitalization is for English meaning text ONLY — never a romanization.** A romanized reading (romaji, pinyin, etc.) always stays lowercase; on the rare card whose `english` value is itself a reading rather than a meaning (e.g. a kana character card glossed `"ka"`), leave it lowercase — do not capitalize it.

**Numbers — keep the digits in `target`, add a spelled-out `reading`.** Textbooks often print numbers as digits (prices, floors, counts — e.g. `2,000えん`, `５かい`, `２ほん`). Keep the `target` exactly as the book writes it (digits are the natural card display), but WHENEVER a `target` contains any numeral (ASCII `0-9` or fullwidth `０-９`), ALSO emit a `"reading"` field: the entire target rewritten with every number spelled out in {{TARGET_LANGUAGE}}'s own script and number words, and nothing else changed. For Japanese that means kana with the correct counter readings — `2,000えん` → `"にせんえん"`, `５かい` → `"ごかい"`, `２ほん` → `"にほん"`, `この Tシャツは 2,000えんです。` → `"この Tシャツは にせんえんです。"`. This matters because the downstream romanizer and the text-to-speech engine both mishandle bare digits (they read `2,000` as an English "two thousand" or leave it as literal `2 , 000`); the spelled-out `reading` is what actually drives the pronunciation guide and the audio, while `target` stays the clean display form. Omit `reading` entirely for any target with no numeral in it.

**Category list — `category` MUST be exactly one of these values, verbatim:** {{CATEGORY_LIST}}. If nothing else fits, use `"Other"`.

## Handling Placeholders

Textbooks commonly write a grammar pattern or attachment point using a placeholder-like character — e.g. 〜さん, お〜, 〜を おねがいします. These are typographical conventions, not part of the spoken word, and can appear as any of several near-identical characters depending on how the source was digitized: 〜 (wave dash), ～ (fullwidth tilde), or a plain ~. Treat all of these as the same placeholder marker.

**Never leave a placeholder character in the final `target`.** Decide per item, using your best judgment:

- **The item IS the grammatical particle/suffix/prefix itself** — its English gloss describes the particle's own function or meaning (e.g. "Mr., Mrs., Ms., Miss" for さん, "(honorific prefix)" for お). Strip the placeholder and keep only the actual morpheme in `target` (e.g. `さん`, not `〜さん`; `お`, not `お〜`). Do NOT invent a concrete example to fill it — that would misrepresent a general-purpose particle as one specific case. Instead, record in **`note`** whether it's a prefix or suffix and what it attaches to (e.g. "Suffix — attaches after a person's name"), since that's real learner-facing information the stripped placeholder would otherwise lose. (If you also want to note the source spelling, that provenance goes in `reviewNote`, e.g. "written 〜さん in the source".)
- **The item is a phrase-level usage pattern meant to be spoken as a complete unit** — its English gloss describes an action or request rather than a particle's own meaning (e.g. "please (get me…)"). Replace the placeholder with a natural, contextually-appropriate word or phrase, chosen using your best judgment — prefer reusing a word already introduced elsewhere in this chapter when a sensible one exists. Record exactly what you filled in and why in **`reviewNote`** (e.g. "Placeholder filled with 'コーヒー' (coffee) as a natural example — not literally present in the source text at this point") — that's a decision you made, not something the learner needs.

When genuinely unsure which of the two applies, prefer resolving it into a phrase over leaving a placeholder — an unresolved placeholder character is never a valid `target`.

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

**When you are genuinely torn, extract it.** A surplus card costs the reviewer one click to exclude. A
missing one is invisible: nothing downstream can flag content that was never emitted, and it will only
surface if a human happens to notice the gap months later.

**A form the chapter names as an EXCEPTION is high priority, never optional.** Grammar and Key-Sentence notes routinely teach a rule and then name the one form that breaks it — "the particle で is attached to the noun indicating the means of transportation… _but_ to say 'by foot,' use あるいて". That exception is the single most confusable item in the lesson, so it must become its own card, even when it appears only inside explanatory prose you would otherwise skip and only as a bare word elsewhere (a substitution-drill alternative, a table cell). Watch for the words _but_, _except_, _instead_, _irregular_ and _does not take_ in a grammar note: whatever follows them is a card.

### What to skip entirely

- Grammar explanation prose — paragraphs explaining a grammar rule, particle usage, or conjugation pattern in depth. (This does not include a short particle vocabulary entry — see above.)
- The mechanical scaffolding of a practice drill — its numbered substitution alternatives, its blanks, its empty answer slots. The drill's own complete example sentences and any reference table beside them ARE extractable; see "The EXERCISES section is a source of cards" above.
- Dialogue/conversation scripts in full — a modeled conversation between named speakers is for listening/rehearsal practice, not a flashcard source. Do not extract dialogue lines, reactions, or recap sentences, even ones that seem useful — treat the whole dialogue as off-limits for this test.
- Supplementary/culture notes as standalone cards — fold a learner-facing clarification into the `note` field of the item it clarifies instead.
- Proper nouns naming a specific person (e.g. a surname like "Harris") or a specific organization/business (e.g. "ABC Foods," "Nozomi Department Store," real or fictitious) as standalone vocabulary. Country and city names ARE genuine vocabulary and should be extracted. A name inside a key sentence you're otherwise keeping should stay in that sentence — this only blocks a standalone "here's a name" card.

### Assigning category

Every item needs a `category` from the fixed list above — pick the one that best matches the item's topic (not its grammatical role). A vocabulary word and a full sentence about the same topic get the same category (e.g. a food-related sentence and the word "rice" both get `"Food"`). Use `"Grammar & Function Words"` for particles/conjunctions/question markers, and `"Other"` only when nothing else genuinely fits.

## Step 2: Add Critical Gap Suggestions

If, after Step 1, you believe there's a genuinely important word or sentence a learner at this chapter's level would need that the chapter's own text simply does not contain, you may add it — but it MUST be marked `"aiSuggested": true` with a one-line reason in `"reviewNote"`.

**EVERY grammar / function word deserves a worked example — not just particles.** This applies to every item you extracted in Step 1 whose category is `"Grammar & Function Words"` and whose gloss describes the form's own FUNCTION rather than a meaning the learner can picture. That covers particles (が, は, を, も, と, で, から, まで, か), but equally copulas and polite forms (です, でございます, じゃありません), suffixes and prefixes (〜さん, お〜, 〜ばん), conjunctions and fillers (じゃ, では), and question words (どの, だれの). For each one, make sure the corpus contains at least one full **example sentence that actually uses that form in context**.

Work through it in this order:

1. **Look for a sentence the chapter already supplies.** A Key Sentence, a grammar example, a drill's worked example, or a line of a dialogue that contains the form all satisfy the requirement, and you must NOT duplicate it. Check the SPEAKING PRACTICE / dialogue sections specifically: they are the usual home of the one sentence that demonstrates a polite or set form, and they are easy to skim past because they read as narrative rather than as a vocabulary list.
2. **If the chapter introduces the form but demonstrates it nowhere, write the example yourself**, marked `"aiSuggested": true`: a natural, level-appropriate sentence reusing vocabulary already introduced in this chapter (or an earlier one) where possible, with a one-line `reviewNote` naming the form it illustrates (provenance for the reviewer, not learner context).
3. **Where the form generalizes, two examples beat one.** One sentence shows the form; a second, built on different vocabulary, shows that it is a slot rather than a fixed phrase. Prefer the chapter's own sentence plus one of your own.

A learner should never meet a function word as a bare gloss with nothing showing it at work: "(polite form of です)" is unusable on its own, because the learner can recite the card and still not know what a sentence containing it looks like. (This is the one case where you DO add an example for a function word — distinct from the Step-1 rule above about not fabricating a filler to resolve a `〜` placeholder ON the form's own vocabulary entry: here you add a SEPARATE example-sentence item and leave that entry as the bare morpheme.)

## Step 3: De-duplicate

Across everything gathered in Steps 1 and 2, de-duplicate across the whole chapter — if the same word or sentence would otherwise appear twice, keep it once. Do not treat two genuinely different words as duplicates just because they're related (e.g. a country name and its nationality-form counterpart, like "Japan" and "Japanese (person)," are two separate real words, NOT duplicates of each other).

**Related pairs need a `note` that explains the relationship, not just the two words side by side.** When you keep two items that are closely related — a bare root and its honorific-prefixed everyday form (e.g. かし/おかし), an affirmative/negative counterpart (e.g. です/じゃありません), singular/plural, casual/polite register, or similar — a learner (and a reviewer) seeing both in a flat list has no way to tell "genuinely different words that happen to look similar" apart from "a stray near-duplicate that should be merged" unless the `note` says so explicitly. This relationship is genuinely useful study context, so it belongs in **`note`** (not `reviewNote`). For each item in the pair, name which one it is (the base/root form vs. the derived/everyday form, the affirmative vs. the negative, etc.), name the other item by its English gloss so it's easy to find, and state the concrete rule connecting them (e.g. "お (o) + かし (kashi) = おかし (okashi)" — with romanization in parentheses per the note rule above). Do this even when only one of the pair strictly needs the explanation — put a short cross-reference `note` on both sides so either card, seen alone, still makes sense.

**An ANSWER line from a dialogue or drill needs a `scene`, and an `english` that matches how much the `target` says.** Chapters are full of question/answer exchanges, and an answer extracted as its own card is studied alone, shuffled, long after the question. Two rules follow. (1) The `english` must be able to produce the whole `target`: if the target states its topic, so must the English — `パーティーはごじです` is "The party is at 5:00.", NOT "It's at 5:00.", because nothing in that shorter gloss would make a learner write パーティーは. Dropping the topic in English is right only when the target drops it too (`にちようびです` → "It's on Sunday."). Read the English on its own and ask whether it could yield exactly that target; if not, it is missing something. (2) An answer that IS elliptical on both sides needs a `scene` naming the question it replies to — "answering where the computer is", "answering when the presentation is" — stating the question and never leaking the answer. Otherwise the card has no discoverable right answer.

**A `note` when a card reuses a form the learner already knows but with a different meaning or function (a "false friend within what they know").** A learner who has met a word will read it the way they first learned it, so a card that reuses that surface form in a new role trips them up unless the `note` calls it out. Name the familiar form, its familiar meaning, and how THIS use differs. The classic case is a question word taking の: どこ (doko) alone asks a location ("where is it?"), but どこの (doko no) asks origin or make — "which place's / what brand of" (as in それはどこのコーヒーカップですか, "where is that coffee cup from?"); likewise だれ (dare) "who" → だれの (dare no) "whose", なに (nani) "what" → なんの (nan no) "what kind of". Other cases: a pronoun vs a determiner (それ (sore) "that one" → その (sono) "that ___" before a noun), the same kana serving as a different particle, or a counter reused for a different kind of thing. Only within this chapter can you see part of the pair; the whole-book teachability pass (below) adds these across chapters, backward-only.

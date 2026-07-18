# Overview

Read the file at this exact path yourself using your Read tool — it is the raw XHTML source of ONE chapter from a {{TARGET_LANGUAGE}}-language textbook for English speakers:

{{CHAPTER_FILE_PATH}}

Use the file's structure (headings, CSS classes, tag nesting) as signal for what kind of content each part is. Go through the ENTIRE file top to bottom — do not skip any part of it.

## Book-Wide Conventions

{{BOOK_CONVENTIONS}}

Use this as grounding for how THIS book specifically formats placeholders, content, and exercises — apply it alongside (not instead of) the general guidance below.

## Why

The data you extract here will become flashcards in an Anki deck used to learn this language. Prioritize content that actually helps someone learn to speak and recognize the language — real vocabulary, real sentences — over exhaustively cataloguing every explanatory detail in the chapter.

## Handling Uncertainty

If you're genuinely unsure whether something should be included, include it anyway and set `"uncertain": true` with a brief reason in `"notes"`, rather than silently deciding either way.

## Output Format

Respond with ONLY a single JSON array (no markdown fences, no prose before or after). One object per flashcard:

**Important: preserve textbook order.** Emit items in exactly the order they appear in the chapter, top to bottom — do not reorder them, do not group them by type (e.g. all vocabulary together, then all key sentences), and do not sort them any other way. The sequence in the output must match the sequence in the source file.

```
{"id": "<short slug>", "english": "<English side>", "target": "<{{TARGET_LANGUAGE}} text, verbatim from the file — EXCEPT placeholder markers (〜, ～, ~), which must be resolved or stripped per Handling Placeholders below>", "category": "<exactly one value from the category list below>", "notes": "<optional short context, omit if none>", "uncertain": <true, only if genuinely unsure this item should be included — omit otherwise>, "aiSuggested": <true, only if this is a critical-gap suggestion you added yourself, not something literally in the file — omit otherwise>}
```

**Write the `english` side in natural sentence case.** Capitalize the first word (and proper nouns) as you would writing normal English — even for a bare vocabulary word or fragment. `"Department store"`, `"Coffee"`, `"How much?"`, `"By means of (particle)"`, `"That's right"` — never lowercased clips like `"department store"`, `"how much"`, or `"by means of (particle)"`. Punctuate full sentences and questions normally (`.` / `?`). This is only about the English gloss reading like real English; leave the `target` verbatim. **Capitalization is for English meaning text ONLY — never a romanization.** A romanized reading (romaji, pinyin, etc.) always stays lowercase; on the rare card whose `english` value is itself a reading rather than a meaning (e.g. a kana character card glossed `"ka"`), leave it lowercase — do not capitalize it.

**Category list — `category` MUST be exactly one of these values, verbatim:** {{CATEGORY_LIST}}. If nothing else fits, use `"Other"`.

## Handling Placeholders

Textbooks commonly write a grammar pattern or attachment point using a placeholder-like character — e.g. 〜さん, お〜, 〜を おねがいします. These are typographical conventions, not part of the spoken word, and can appear as any of several near-identical characters depending on how the source was digitized: 〜 (wave dash), ～ (fullwidth tilde), or a plain ~. Treat all of these as the same placeholder marker.

**Never leave a placeholder character in the final `target`.** Decide per item, using your best judgment:

- **The item IS the grammatical particle/suffix/prefix itself** — its English gloss describes the particle's own function or meaning (e.g. "Mr., Mrs., Ms., Miss" for さん, "(honorific prefix)" for お). Strip the placeholder and keep only the actual morpheme in `target` (e.g. `さん`, not `〜さん`; `お`, not `お〜`). Do NOT invent a concrete example to fill it — that would misrepresent a general-purpose particle as one specific case. Instead, record in `notes` whether it's a prefix or suffix and what it attaches to (e.g. "Suffix — attaches after a person's name"), since that's real information the stripped placeholder would otherwise lose.
- **The item is a phrase-level usage pattern meant to be spoken as a complete unit** — its English gloss describes an action or request rather than a particle's own meaning (e.g. "please (get me…)"). Replace the placeholder with a natural, contextually-appropriate word or phrase, chosen using your best judgment — prefer reusing a word already introduced elsewhere in this chapter when a sensible one exists. Record exactly what you filled in and why in `notes` (e.g. "Placeholder filled with 'コーヒー' (coffee) as a natural example — not literally present in the source text at this point").

When genuinely unsure which of the two applies, prefer resolving it into a phrase over leaving a placeholder — an unresolved placeholder character is never a valid `target`.

## Example Output

Showing a plain item, an item with a note, an uncertain item, an AI-suggested item, and both kinds
of placeholder resolution:

```json
[
  { "id": "sumimasen", "english": "Excuse me.", "target": "すみません。", "category": "Greetings" },
  {
    "id": "yoroshiku",
    "english": "I look forward to working with you.",
    "target": "よろしく おねがいします。",
    "category": "Greetings",
    "notes": "Usually combined with はじめまして when being introduced"
  },
  {
    "id": "nihonjin",
    "english": "Japanese (person)",
    "target": "にほんじん",
    "category": "Nationalities & Countries",
    "notes": "Translation inferred by combining にほん + じん; not separately glossed in the source",
    "uncertain": true
  },
  {
    "id": "arigatou-suggestion",
    "english": "thank you",
    "target": "ありがとう",
    "category": "Greetings",
    "notes": "Basic thanks — not present in this chapter's text, but a genuine gap for a learner at this level",
    "aiSuggested": true
  },
  {
    "id": "san-suffix",
    "english": "Mr., Mrs., Ms., Miss",
    "target": "さん",
    "category": "Family & People",
    "notes": "Suffix — attaches after a person's name (written 〜さん in the source)"
  },
  {
    "id": "onegaishimasu-pattern",
    "english": "please (get me a coffee)",
    "target": "コーヒーを おねがいします",
    "category": "Grammar & Function Words",
    "notes": "Placeholder filled with 'コーヒー' (coffee) as a natural example — the source shows only '〜を おねがいします'"
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

### What to skip entirely

- Grammar explanation prose — paragraphs explaining a grammar rule, particle usage, or conjugation pattern in depth. (This does not include a short particle vocabulary entry — see above.)
- Practice/drill exercises in full — anything instructing the learner to produce their own sentences by substituting into a pattern. These are for manual practice; do not extract them, including their "e.g." example lines.
- Dialogue/conversation scripts in full — a modeled conversation between named speakers is for listening/rehearsal practice, not a flashcard source. Do not extract dialogue lines, reactions, or recap sentences, even ones that seem useful — treat the whole dialogue as off-limits for this test.
- Supplementary/culture notes as standalone cards — fold a clarification into the "notes" field of the item it clarifies instead.
- Proper nouns naming a specific person (e.g. a surname like "Harris") or a specific organization/business (e.g. "ABC Foods," "Nozomi Department Store," real or fictitious) as standalone vocabulary. Country and city names ARE genuine vocabulary and should be extracted. A name inside a key sentence you're otherwise keeping should stay in that sentence — this only blocks a standalone "here's a name" card.

### Assigning category

Every item needs a `category` from the fixed list above — pick the one that best matches the item's topic (not its grammatical role). A vocabulary word and a full sentence about the same topic get the same category (e.g. a food-related sentence and the word "rice" both get `"Food"`). Use `"Grammar & Function Words"` for particles/conjunctions/question markers, and `"Other"` only when nothing else genuinely fits.

## Step 2: Add Critical Gap Suggestions

If, after Step 1, you believe there's a genuinely important word or sentence a learner at this chapter's level would need that the chapter's own text simply does not contain, you may add it — but it MUST be marked `"aiSuggested": true` with a one-line reason in `"notes"`.

**Every particle / function word deserves a worked example.** For each grammatical particle or function word you extracted as a vocabulary item in Step 1 (anything in `"Grammar & Function Words"` whose gloss describes its own function — e.g. が, は, を, も, と, で, から, まで, か), make sure the corpus contains at least one full **example sentence that actually uses that particle in context**. If the chapter already supplies one (a Key Sentence or example that uses it), that satisfies the requirement — do not duplicate it. If the chapter introduces the particle but gives NO sentence demonstrating it, add one yourself, marked `"aiSuggested": true`: a natural, level-appropriate sentence that reuses vocabulary already introduced in this chapter where possible, with a one-line `notes` naming the particle it illustrates. A learner should never meet a particle as a bare gloss with nothing showing it at work. (This is the one case where you DO add an example for a particle — distinct from the Step-1 rule above about not fabricating a filler to resolve a `〜` placeholder ON the particle's own vocabulary entry: here you're adding a SEPARATE example-sentence item, leaving the particle's own entry as the bare morpheme.)

## Step 3: De-duplicate

Across everything gathered in Steps 1 and 2, de-duplicate across the whole chapter — if the same word or sentence would otherwise appear twice, keep it once. Do not treat two genuinely different words as duplicates just because they're related (e.g. a country name and its nationality-form counterpart, like "Japan" and "Japanese (person)," are two separate real words, NOT duplicates of each other).

**Related pairs need notes that explain the relationship, not just the two words side by side.** When you keep two items that are closely related — a bare root and its honorific-prefixed everyday form (e.g. かし/おかし), an affirmative/negative counterpart (e.g. です/じゃありません), singular/plural, casual/polite register, or similar — a reviewer seeing both in a flat list has no way to tell "genuinely different words that happen to look similar" apart from "a stray near-duplicate that should be merged" unless the notes say so explicitly. For each item in the pair, name which one it is (the base/root form vs. the derived/everyday form, the affirmative vs. the negative, etc.), name the other item by its English gloss so it's easy to find, and state the concrete rule connecting them (e.g. "お + かし = おかし"). Do this even when only one of the pair strictly needs the explanation — put a short cross-reference note on both sides so either card, seen alone, still makes sense.

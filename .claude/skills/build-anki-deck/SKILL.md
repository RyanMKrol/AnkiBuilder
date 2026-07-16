---
name: build-anki-deck
description: Build an Anki deck from a real-life lesson, template, or custom EPUB
---

# Build an Anki Deck

This skill guides you through building a complete Anki flashcard deck for vocabulary practice.

## Getting Started

### Prerequisites

- A run directory where artifacts will be stored
- Optional: `.env` file with `ELEVENLABS_API_KEY` (see [Setup](#setup))
- Optional: an EPUB file if building from a book

### Setup

If you want to generate audio (ElevenLabs TTS), you need an API key:

1. Get an API key at https://elevenlabs.io
2. Create a `.env` file in your working directory by copying `.env.example`:
   ```sh
   cp .env.example .env
   ```
3. Add your key to `.env`:
   ```
   ELEVENLABS_API_KEY=sk_...your_key...
   ```

The CLI loads `.env` automatically — no need to export by hand. The file is gitignored and stays on your machine.

## Workflow

### Step 1: What do you want to build a deck for?

Use the `AskUserQuestion` tool to ask which source to build from, with these three options:

1. **A real-life lesson** — a list of English words/phrases you learned in an actual class, to
   organize into a course.
2. **A bundled template** (ready-made vocabulary, e.g. `travel-essentials`, `numbers`). Templates
   are language-agnostic — the target language is a build-time choice, so the *same* template can
   become a deck in any language.
3. **Your own EPUB**: path to an .epub file on your machine

Once they answer, disambiguate with follow-up questions specific to that source:

- **Template:** ask which bundled template before assembling — see the sub-question below.
- **EPUB:** first offer any **previously-worked-on books** to pick from (see below); only if they
  want a new book ask for the file path. Either way, ask which target language to prepare
  translations for.
- **Lesson:** walk through the sub-questions below before assembling anything.

- **Which book? (new or already-worked-on)** Before asking for a file path, list the EPUBs already
  worked on under this output root by calling `listBooks(outputRoot)` (`src/cli/outputPaths.js`) —
  each is `{ slug, title, epubHash, targetLanguage, epubPath }` — and offer each (labelled by
  `title`, falling back to `slug`) as an `AskUserQuestion` option, plus an explicit "a new EPUB
  (I'll give a path)" choice. Every `--epub` build keeps a copy of the source file inside the book's
  output folder (`output/epubs/<book-slug>/book.epub`), so a book that shows up here can be built
  from **without re-locating the original file**. If they pick an existing book, use the
  `--book <book-slug>` form in Step 2 (no path needed); if they choose the new-EPUB option (or there
  are no books yet), ask for the `.epub` path and use the `--epub <path>` form. If `listBooks`
  returns nothing, skip straight to asking for a path.

- **Which template?** List the available templates by calling `listTemplates()`
  (`src/corpus/templates.js`) and offer each as an `AskUserQuestion` option — describe it by its
  *vocabulary* (the English terms and categories it covers), read from `templates/<name>.json`.
  Templates no longer carry a target language, so **don't** describe them by language — every
  template works for any language. If only one option exists, `AskUserQuestion` still needs a second
  option, so pair it with a "None of these fit" choice. If they pick that (or "Other"), see
  **Creating a new reusable template** below.
- **Which target language?** Because templates are language-agnostic, once a template is chosen you
  must ask which language to build the deck in (e.g. Spanish, `es`, Japanese, `ja`). This value is
  the `--lang` you pass to `assemble` in Step 2 — `assemble --template` now *requires* it and errors
  without it. Use an ISO 639-1 code where you can (`es`, `ja`, `fr`) so the audio stage's default
  voice lookup and ElevenLabs `language_code` resolve; a full name still works but is a weaker hint.

#### Creating a new reusable template

Template *creation* is orthogonal to deck *building*: a template is just reusable English vocabulary
+ categories, with no language baked in. When the user wants a new **reusable** template added to the
bundle (not a one-off word list — that's the **Lesson** or **EPUB** path instead), treat it as its
own small flow that completes *before* you return to the deck build:

1. **Confirm it's really a reusable template**, not a one-off deck. If they just want e.g. a numbers
   deck once, redirect to the **Lesson** path (dictate the words) — don't add a template.
2. **Gather the vocabulary, language-agnostically.** Ask for the English terms (dictated or pasted).
   **Do not ask what language it's for** — that's chosen later at build time. Group each term under a
   category from the enum in `src/model/categories.js` (`category` is validated against that fixed
   list — an unknown category fails schema validation; use `"Other"` if nothing fits).
3. **Author the files** (this is a codebase change, so do it on a branch per the repo conventions):
   - `templates/<name>.json` — `{ "meta": { "sourceType": "template" }, "items": [ { "id", "english",
     "category" }, ... ] }`. **No `targetLanguage`** in meta. `id`s are short kebab/snake handles
     unique within the file (e.g. `num_one`); `target`/`notes` are omitted (backfilled to `null` on
     load).
   - Register it in `AVAILABLE_TEMPLATES` in `src/corpus/templates.js` (`"<name>": "<name>.json"`).
   - Add a `test/corpus/templates.test.js` case (or extend the "every bundled template validates"
     loop) so the new template is schema-checked.
4. **Review the template with the user** before moving on — render/inspect the item list and confirm
   the terms and categories look right (a quick corpus-style review; you can `assemble --template
   <name> --lang <lang>` into a scratch run dir and `render-review --stage corpus` if you want the
   same review artifact the deck flow uses).
5. **Then hand off to the deck build**: with the new template committed and reviewed, proceed into
   Step 2 exactly as for any bundled template — ask the **Which target language?** question above and
   run `assemble --template <name> --lang <lang>`.

- **Which course?** List existing courses by reading `output/courses/*/course.json` (each is
  `{ name, targetLanguage }`, keyed by the folder name — `listCourses(outputRoot)` in
  `src/cli/outputPaths.js` if you'd rather call it directly than read files by hand) and offer them
  as `AskUserQuestion` options, plus an explicit "start a new course" option. For a new course, ask
  its name (e.g. "Intensive Japanese 1") and target language.
- **Which lesson number?** Suggest the next free one (`nextLessonNumber(outputRoot, courseSlug)` —
  one past the highest lesson number already assembled for this course, or `1` for a brand-new
  course) and let them confirm or override it. Also ask if they want a custom sub-deck label
  (defaults to `"Lesson <N>"` if they don't say).
- **The word list itself.** Ask them to paste or dictate the English terms from the lesson, one
  per line. Write what they give you to a plain text file (e.g. `<scratchpad>/lesson-words.txt`,
  one phrase per line, blank lines are fine — they're skipped) — `assemble --words` reads from a
  file, not inline text, so this file is how their dictated list gets in.

### Step 2: Corpus Assembly & Review

Once the source is decided, I'll assemble the corpus.

**For a template**, pass `--output-root output` so the deck is filed under the organized
`output/templates/<templateName>/<lang>/` tree (one folder per language). Templates are
language-agnostic, so `--lang` is **required** here (it's the target language gathered in Step 1):

```sh
anki-builder assemble --output-root output --template <templateName> --lang <lang>
```

This prints `resolved run directory: output/templates/<templateName>/<lang>` — **capture that path**
as the `<runDir>` for every later `review`/`translate`/`audio`/`deck`/`render-review` call, exactly
like the lesson/EPUB forms below. Re-running `assemble` for the same template+language reuses that
folder. There's no book-level merge for a template (only one unit per language), so the Step 5
`deck --run <runDir>` output is already the final artifact — skip Step 6. (A one-off ad hoc build can
still use a plain `--run <anyDir>` instead of `--output-root`.)

**For a manual `--chapter` source** (no identity to organize by), pick any run directory and pass it
directly with `--run <runDir>` (also requires `--lang`).

**For a real-life lesson**, pass `--output-root` (same idea as an EPUB below) along with the
course/lesson details gathered in Step 1:

```sh
anki-builder assemble --output-root output --words <wordsFile> \
  --course "Intensive Japanese 1" --lesson-number <N> --lang <lang> \
  [--lesson-label "Lesson <N>: <topic>"]
```

This resolves (or creates) `output/courses/<course-slug>/lesson-<seq>/` — every item's `target` stays
`null` here (there's no bilingual source text to translate from, unlike an EPUB chapter), so
`translate` fills it in fresh just like it does for a template. Category assignment for each word
is a quick automated pass — check it during the corpus review below same as any other source.

**For an EPUB**, pass `--output-root` instead of `--run` and let `assemble` resolve the run
directory itself — this keeps every chapter of the same book organized together under one
book-level folder (see [Output layout](../../../README.md#output-layout) in the README). This also
copies the source `.epub` into that book folder (`output/epubs/<book-slug>/book.epub`) and writes a
`book.json` marker, so the book becomes something you can pick again later:

```sh
# A new book (first time) — give the file path:
anki-builder assemble --output-root output --epub <path> --chapter-number <N> --lang <lang>
# A book already worked on (chosen via listBooks in Step 1) — pick it by slug, no path:
anki-builder assemble --output-root output --book <book-slug> --chapter-number <N> --lang <lang>
```

`--book <book-slug>` reads the copy the book folder kept (falling back to the local-library copy for
a book worked on before this copy existed), so you never have to re-find the original file for a
later chapter. Both forms print `resolved run directory: output/courses/<course-slug>/lesson-<seq>`
or `output/epubs/<book-slug>/chapter-<seq>`. **Capture that path** — it's the `<runDir>` to reuse for
every subsequent
`review`/`translate`/`audio`/`render-review` call (all of those commands still take a plain
`--run <runDir>`; only `assemble` knows how to resolve one from `--output-root`). Re-running
`assemble --output-root` for the same lesson-of-course or chapter-of-book reuses its existing
folder rather than allocating a new one.

The result is `corpus.json` in the run directory, containing:
- English phrases (the terms to memorize)
- Categories (Greetings, Food, etc.)
- Optional translations or hints from the source

**Review gate — always render as a Claude Artifact, never just print a table in chat/terminal:**
Generate it from the checked-in template rather than hand-authoring HTML — that's what keeps this
page visually and behaviorally identical run over run:

```sh
anki-builder render-review --run <runDir> --stage corpus
```

This reads `corpus.json` and writes `<runDir>/review-corpus.html` (columns: #, English, Category,
Target; click-to-mark-for-exclusion rows with a running counter; a "Copy instruction" button with a
robust clipboard fallback; notes shown inline in their own column, not hidden behind a popover; full
window width, ~1-inch margins, no sticky header). Publish that file as an Artifact — don't recreate
the page by hand, and
don't skip this even for a small corpus; a terminal dump is not an acceptable substitute for
something actually visible and scannable in the browser. The template itself lives in
`src/review/` (`reviewPageTemplate.js` plus a `render*ReviewPage.js` per stage) — if the page ever
needs a design change, edit it there so every stage and every future run stays in sync, rather than
freehand-adjusting one instance of the HTML.

**You decide:** does the corpus look right?

If you want to edit the corpus (add, remove, or fix terms), do it now in `corpus.json` before
proceeding, or tell me which numbers to exclude. Once you give a decision — a list of numbers to
exclude, or none — run `anki-builder review --run <runDir>` to apply it, then move straight on to
`translate` in the same turn. Don't stop to ask "should I proceed with translation?" first — telling
me the exclusions (or that there are none) IS the go-ahead. Only pause again if something in
`translate`'s own output needs a decision (e.g. errors).

### Step 3: Translation via Claude

Translate the corpus to the target language using `claude -p` (the local Claude tool):

```sh
anki-builder translate --run <runDir>
```

This:
- Reads `corpus.json`
- Generates translations and pronunciations for each phrase
- Writes `cards.json` (the translated cards, ready for audio/images)

**Review gate — publish a new Claude Artifact (don't reuse the corpus-stage one, the data's
different now):**

```sh
anki-builder render-review --run <runDir> --stage translate
```

This reads `cards.json` and writes `<runDir>/review-translate.html` — same shared template and
interaction as the corpus review (columns: #, English, Target, Pronunciation, Category, Note;
click-to-mark-for-exclusion, copying `Please exclude rows 3, 12, 19.`). Publish it as an Artifact.
Note the mechanism differs from Step 2: there's no `anki-builder review` equivalent for
`cards.json`, so acting on marked rows means directly removing those entries from `cards.json` and
re-validating it, not running a CLI command.

If you want to edit translations or pronunciations, do it in `cards.json` now before proceeding.
Once you give a decision, apply it and move straight into Step 4 in the same turn — same
no-separate-confirmation rule as the assemble → translate transition.

### Step 4: Audio Generation

If you want to generate audio (pronunciation recorded by ElevenLabs TTS):

```sh
anki-builder audio --run <runDir> --voice <voiceId>
```

This:
- Requires `ELEVENLABS_API_KEY` in your environment (or `.env`)
- Reads `cards.json`
- Fetches audio from ElevenLabs for each card
- Caches audio in `.anki-builder/audio/<voiceId>/` (inside this repo, gitignored) so reruns are fast
- Copies audio files into the run directory
- Writes updated `cards.json` with audio file references

**Voice choice:** if this target language already has a configured default voice
(`src/audio/voiceLibrary.js`'s `DEFAULT_VOICES`), `--voice` can be omitted entirely — the CLI
uses the default and says so. Otherwise I'll help you pick one; available voices vary by
language. Popular choices:
- For English: `21m00Tcm4TlvDq8ikWAM` (Bella), `EXAVITQu4vr4xnSDxMaL` (Premom)
- For other languages, visit https://elevenlabs.io/voice-lab

Once you've settled on a voice for a language you'll keep using (e.g. continuing the same
book), add it to `DEFAULT_VOICES` so future chapters don't need `--voice` repeated.

If you skip audio, the deck will still work — cards just won't have pronunciation recordings.

**Review gate — publish a new Claude Artifact you can actually listen to.** A text table isn't
enough here — the whole point is hearing the clips:

```sh
anki-builder render-review --run <runDir> --stage audio
```

This reads the updated `cards.json` (now has an `audio` filename per card) and the run's `audio/`
directory, base64-encodes each clip, and writes `<runDir>/review-audio.html` with each row's clip
embedded as `<audio controls src="data:audio/mpeg;base64,...">` next to English/Target/
Pronunciation, same shared visual system as the other two review artifacts. Publish it as an
Artifact. This stage uses "flag for regeneration" instead of exclusion — the real action isn't
dropping a row, it's "this one sounds wrong, regenerate it": copy button produces
`Please regenerate audio for rows 3, 12.` To act on that: delete that term's cached clip from
`.anki-builder/audio/<voiceId>/<hash>.mp3` AND its copy under `<runDir>/audio/`, then re-run
`anki-builder audio --run <runDir> --voice <voiceId>` — it's resumable and only regenerates
whichever terms are missing from the cache, not the whole batch. For a large deck (many dozens of
cards), embedding every clip can make the artifact file large/slow to publish — if that happens,
say so rather than silently publishing one huge page (see
`.harness/custom/docs/LIMITATIONS.md` — there's no chunking built in yet).

### Step 5: Deck Build

Once translation (and optionally audio) is complete:

```sh
anki-builder deck --run <runDir> [--name "My Deck"]
```

This:
- Reads `cards.json`
- Assembles a two-template Anki deck (question → answer format)
- Includes audio files if present
- Writes `deck.apkg` to your run directory

The `.apkg` file is a complete, importable Anki deck.

### Step 6: Build the Book/Course-Level Package (EPUB books and lesson-sourced courses only)

If you're working through an EPUB book chapter by chapter, or a course lesson by lesson (both via
`--output-root`), each unit so far has its own `cards.json`/`deck.apkg` under
`output/epubs/<book-slug>/chapter-<seq>/` or `output/courses/<course-slug>/lesson-<seq>/`. Once you've
finished Steps 2–5 for every chapter/lesson you want included, build ONE merged package for the whole
book/course:

```sh
anki-builder deck --book-dir output/epubs/<book-slug>      # an EPUB book
anki-builder deck --book-dir output/courses/<course-slug>  # a lesson-sourced course
```

This scans every `chapter-*/cards.json` AND `lesson-*/cards.json` under that folder (a given
folder only ever has one or the other) and writes a single `<that-folder>/deck.apkg` containing
all of them, each as its own real Anki sub-deck (`Book/Course Title::Chapter/Lesson Label`) nested
under one parent deck named for the book (from the EPUB library) or the course (from its
`course.json` marker). Run this once after all of that book's/course's units are individually
complete — and again any time you add or change one, since (unlike the per-unit `deck --run`
command) this always rebuilds from scratch rather than reusing a stale merge. Skip this step
entirely for template/manual decks — there's only ever one unit, so the `deck.apkg` from Step 5 is
already the final artifact.

### Step 7: Import & Verify

Open Anki:
1. File → Import → select the book/course-level `deck.apkg` (or the per-unit one, for a
   template/manual deck)
2. Review the imported cards, including the sub-deck hierarchy for a book or course
3. Test playback (audio should play if audio was generated)
4. Start studying!

If something looks wrong (missing translations, bad pronunciation, etc.), you can:
- Edit the source corpus.json / cards.json and re-run from that stage
- Re-run `anki-builder` commands to regenerate later stages
- Stages are resumable — running a stage whose output already exists reuses it

## Command Reference

All commands use `--run <dir>` to specify the run directory and read/write artifacts there.

### Assemble corpus
```sh
anki-builder assemble --output-root output --template travel-essentials --lang es
anki-builder assemble --run <dir> --template travel-essentials --lang es   # ad hoc, unorganized
anki-builder assemble --run <dir> --epub <path> --chapter-number <N> --lang es
anki-builder assemble --output-root output --epub <path> --chapter-number <N> --lang es
anki-builder assemble --output-root output --book <book-slug> --chapter-number <N> --lang es  # a previously-worked book
anki-builder assemble --output-root output --words <path> --course "Intensive Japanese 1" \
  --lesson-number <N> --lang ja [--lesson-label "Lesson <N>: <topic>"]
```

### Translate
```sh
anki-builder translate --run <dir>
```

### Generate audio
```sh
anki-builder audio --run <dir> --voice 21m00Tcm4TlvDq8ikWAM
```

### Build deck
```sh
anki-builder deck --run <dir> --name "Travel Spanish"
```

### Build book/course-level deck
```sh
anki-builder deck --book-dir output/epubs/<book-slug>       # an EPUB book
anki-builder deck --book-dir output/courses/<course-slug>   # a lesson-sourced course
```
Merges every `chapter-*/cards.json` or `lesson-*/cards.json` under the folder into one
`deck.apkg`, one Anki sub-deck per chapter/lesson. Always rebuilds from scratch. EPUB books and
lesson-sourced courses only — nothing to merge for a template/manual deck.

### Render a review artifact
```sh
anki-builder render-review --run <dir> --stage corpus
anki-builder render-review --run <dir> --stage translate
anki-builder render-review --run <dir> --stage audio
```

## Environment Variables

Set in `.env` or export to your shell:

- `ELEVENLABS_API_KEY` (required for audio): Your ElevenLabs API key

No env var needed for local state — it always lives in `.anki-builder/` inside this repo
(gitignored), nothing to configure.

## State & Artifacts

Each chapter's own artifacts live in its run directory (`--run <dir>`, or the directory
`assemble --output-root` resolved for you):

- `corpus.json` — assembled from template or EPUB
- `cards.json` — translated and enriched corpus
- `audio/` — generated audio files (if audio stage ran)
- `deck.apkg` — this chapter's own Anki deck (for template/manual sources, this is the final
  artifact; for an EPUB book, it's superseded by the book-level merge below)
- `review-corpus.html` / `review-translate.html` / `review-audio.html` — templated review
  artifacts generated by `render-review`, meant to be published as Claude Artifacts

Under `--output-root`, each source type nests under its own reserved segment of `output/`
(`epubs/`, `courses/`, `templates/`). For an EPUB book, chapters nest under one book folder beneath
`epubs/`, with a single merged package at the book root:

```
output/epubs/<book-slug>/
  book.epub               # copy of the source EPUB, kept so `--book <slug>` can build later chapters
  book.json               # { title, slug, epubHash, targetLanguage } — powers listBooks discovery
  chapter-0/corpus.json, cards.json, audio/, review-*.html, deck.apkg
  chapter-1/...
  deck.apkg              # built by `deck --book-dir output/epubs/<book-slug>` (Step 6)
```

A lesson-sourced course assembled via `--words --output-root` mirrors this exact shape under
`courses/` — `courses/<course-slug>/lesson-<seq>/` instead of `epubs/<book-slug>/chapter-<seq>/`:

```
output/courses/<course-slug>/
  course.json             # { name, targetLanguage } — written on first use of this course
  lesson-0/corpus.json, cards.json, audio/, review-*.html, deck.apkg
  lesson-1/...
  deck.apkg               # built by `deck --book-dir output/courses/<course-slug>` (Step 6)
```

A template deck assembled via `--output-root` lands under the reserved `templates/` segment, keyed
by template name then language — one unit per language, so its `deck.apkg` is the final artifact (no
book-level merge, no Step 6):

```
output/templates/<template-name>/<language>/
  corpus.json, cards.json, audio/, review-*.html, deck.apkg
```

Audio is cached in `.anki-builder/audio/<voiceId>/` so reruns don't regenerate the same audio.

## Troubleshooting

**"corpus.json already exists — reusing"**  
The assemble stage found an existing corpus and skipped regeneration. To start fresh:
```sh
rm <runDir>/corpus.json
anki-builder assemble --run <dir> ...
```

**"ELEVENLABS_API_KEY not set"**  
Ensure `.env` is copied from `.env.example` and contains your key, or export it:
```sh
export ELEVENLABS_API_KEY=sk_...
```

**Translation/audio failed**  
Check the error message — it usually names the stage that failed. Re-run that stage after fixing the input (e.g., edit `corpus.json` if assemble failed). Stages are resumable.

**Anki import failed**  
Ensure the `.apkg` file exists and is not corrupted. Check that the run directory path is correct.

## Learn More

- [README.md](../../../README.md) — project overview
- `.env.example` — environment variable reference
- ElevenLabs docs: https://elevenlabs.io/docs
- Anki docs: https://docs.ankiweb.net/

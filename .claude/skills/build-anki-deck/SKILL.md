---
name: build-anki-deck
description: Build an Anki deck from a real-life lesson, template, or custom EPUB
---

# Build an Anki Deck

This skill guides you through building a complete Anki flashcard deck for vocabulary practice. This
file is the workflow spine: the steps, the commands, and the gates. Depth lives in the reference
files below; load one when its topic comes up.

**This file is normative for operator procedure.** When SKILL.md and any other document disagree
about what to DO — the order of steps, which command to run, what a gate means — SKILL.md wins and
the other document is wrong and should be fixed. `docs/PIPELINE.md` is authoritative for the
complementary question of how the code is wired internally; `README.md` for what is currently
implemented. If SKILL.md disagrees with the CODE, the code wins: fix the doc in that same commit.

## Reference files

- [references/card-authoring-rules.md](references/card-authoring-rules.md): every rule about card
  content and card-set shape (glosses, scenes/hints/notes, collisions, number readings, ordering, the
  cross-lesson note pass). Load it whenever you author, edit, or audit cards.
- [references/extras-pass.md](references/extras-pass.md): the full Step 3b procedure for building a
  lesson's extras (drill) unit. Load it before running that pass.
- [references/template-creation.md](references/template-creation.md): the flow for adding a new
  reusable bundled template. Load it when the user wants a template that doesn't exist yet.
- [references/audio-pipeline.md](references/audio-pipeline.md): audio internals (the TTS end marker,
  variant takes, trim/cleanup, the cache, re-run semantics). Load it for any audio question beyond
  "run the stage and review the clips".
- [references/deliver.md](references/deliver.md): deliver-to-anki, backups and restore, rules for
  the AnkiConnect-managed collection. Load it before delivering to or restoring the user's Anki.
- [docs/PIPELINE.md](../../../docs/PIPELINE.md): the implementation-internals companion, covering
  how the stages are wired in code.

## Prerequisites and setup

- A run directory where artifacts will be stored.
- Optional: an EPUB file if building from a book.
- Optional (needed for audio): `ELEVENLABS_API_KEY`. Get a key at https://elevenlabs.io, then
  `cp .env.example .env` and add `ELEVENLABS_API_KEY=sk_...` to `.env`. The CLI loads `.env`
  automatically; the file is gitignored.

That is the only required env var. Local state always lives in `.anki-builder/` inside this repo
(gitignored), nothing to configure. Optional knobs (`ANKI_BUILDER_TTS_MODEL`,
`ANKI_BUILDER_TRIM_AUDIO`, `ANKI_BUILDER_AUDIO_CLEANUP`, `ANKI_BUILDER_TTS_END_MARKER`,
`ANKI_BUILDER_TRANSLATE_EFFORT`, `ANKI_BUILDER_BACKUP_KEEP`, `ANKI_BUILDER_BACKUP_ROOT`) are covered
where they apply in the reference files.

## The shape of the workflow

**There are exactly TWO review gates, and a lesson only ever rests at one of them:**

| Gate                    | What you check                                       | Sign-off          |
| ----------------------- | ---------------------------------------------------- | ----------------- |
| **1 — Corpus** (Step 3) | English + target + pronunciation, on the final cards | **Mark reviewed** |
| **2 — Audio** (Step 4)  | Every card's clip                                    | **Mark done**     |

That's the whole state space. A lesson is either mid-build (the dashboard says *building* or
*interrupted*, or lists it under **Not finished**), sitting at gate 1, sitting at gate 2, or done.
There is no third review, and nothing to review before translation.

**Never hand over a gate and stop. Arm a watcher and continue by yourself when the sign-off lands.**
Handing over a review link and then waiting to be told "I've reviewed it" costs the user a message
every single time, twice per unit, four times per chapter. Instead, the moment you give them a review
link, start a background watcher that polls the flag the dashboard writes and exits once it is set.
Its completion notification is your cue to carry straight on: generate the audio after gate 1, and
after gate 2 run the extras pass, or the merge, or whatever the arc calls for next.

**Use the Monitor tool, so the watcher is VISIBLE in the conversation.** A plain background poll
loop works but is silent until the moment it fires, which leaves the reviewer with no evidence that
anything is waiting on them; they end up asking whether it is running, which is the message the
watcher existed to save. Monitor turns each stdout line into a message in the thread, and the script
below announces when it arms, ticks every few minutes while waiting, and announces when it fires,
then exits — so the watch ends with the event instead of lingering.

```sh
node scripts/await-review.mjs <runDir> --gate 1     # wait for Mark reviewed
node scripts/await-review.mjs <runDir> --gate 2     # wait for Mark done AND its rebuild
#   --timeout 30m   how long to wait before giving up (default 30m)
#   --interval 15s  how often to poll (default 15s)
```

Exit codes, so you know what happened without reading the log: **0** signed off (at gate 2, and the
collection package really did rebuild), **1** timed out with no sign-off, **2** the unit could not be
read — a bug, this watch could never have fired, **3** gate 2 only: marked done but the package is
missing or older than `cards.json`, so the rebuild FAILED. To run the next stage the instant the flag
flips, chain it: `node scripts/await-review.mjs "$RUN" --gate 1 && anki-builder audio --run "$RUN"`.

Use the script; do not hand-roll a poll loop. It encodes four rules, each of which was learned by
getting it wrong in a real build:

- **"Cannot read the file" must never look like "not signed off yet."** This is the one bug that
  silently defeats the whole mechanism, and it has actually happened: a watcher armed with a
  RELATIVE run path, after an earlier `cd` had moved the shell's persistent working directory, so
  every poll threw `MODULE_NOT_FOUND`. A `2>/dev/null` swallowed the error and the non-zero exit was
  indistinguishable from "still waiting". The reviewer clicked **Mark reviewed**, nothing happened,
  and they had to send exactly the message the watcher was supposed to save. So the script resolves
  the path to an absolute one and prints it on its first line (a wrong path is visible immediately,
  not never), and it treats unreadable as its own state, exiting 2 rather than polling a path that
  can never resolve. Pass an absolute `<runDir>` anyway, since the shell's cwd drifts.
- **After gate 2, the flag is not the outcome — CHECK THE REBUILD.** `Mark done` does two things:
  it sets `meta.done`, and it rebuilds the collection package. A watcher polling only `meta.done`
  reports success on the first even when the second FAILED, because the flag really did flip. That
  has happened: a duplicate card id made the package build refuse, the dashboard showed
  `✓ done — but deck rebuild FAILED`, and the watcher announced the unit was done and moved on. So
  `--gate 2` compares the package's mtime against `cards.json` and exits 3 when it is older or
  missing. It derives the package path from the collection directory itself, so a mistyped slug
  cannot make a stale package look fresh. More generally: when a click triggers work, watch the
  work's *artifact*, not the click.
- **It waits for the human; it never replaces them.** The script only reads. Setting a review flag
  yourself to unblock a stage defeats the gate that exists to keep unseen cards out of the deck. If a
  stage refuses because a unit is unreviewed, that is the system working.
- **The wait is bounded and the heartbeat is sparse.** An unattended session ends with a clear
  timeout message rather than a process that quietly lingers, and a monitor that prints every poll
  floods the thread and gets stopped automatically — which is the one failure a watcher cannot
  report. Tell the user it is armed when you hand over the link, so they know the next step runs on
  its own and no follow-up message is needed.

One more thing to do before you hand the link over, which is not the watcher's job:

- **Run `npm run preflight` BEFORE you hand over a review link.** It is the deterministic sweep
  (schema, duplicate card ids, uncued collisions, cross-unit duplicate targets, stuck audio
  markers) and it exists because these kept being caught by a human, or by a build refusing at the
  worst moment, rather than by a check. The duplicate-id case is the sharpest: a card id becomes the
  Anki note guid, so a clash makes the package build refuse outright, and that refusal used to fire
  only at **Mark done** — after both reviews had been signed off. Preflight moves it to before
  anyone has looked at the unit, when it is still a one-line edit.

  **Read the three tiers, don't just read the exit code.** `FAIL` blocks: fix it. `ACK` is a real
  finding whose resolution is a judgement, and it blocks only while instances are _unreviewed_ —
  decide each one, then record the decision with `node scripts/preflight.mjs --all --accept --note
  "<why>"`, which writes the collection's `.preflight-accepted.json`. `INFO` never blocks. Never
  accept a finding you have not actually looked at: the whole point of the tier is that the number
  it prints is instances nobody has judged yet.

- **Run `npm run check` before a DELIVER**, not just before a review link. It is
  `ci && validate:decks && preflight` — the full gate over both tracked code and on-disk deck state.
  (It is deliberately not in the `pre-push` hook: that would couple `git push` to deck state that
  is not in git.)

**Each chapter produces TWO units, and each goes through both gates on its own.** Once the base
lesson is **done** (gate 2), Step 3b builds its *extras* unit: drill cards from the same chapter,
shipped as a separate sub-deck beside the lesson. The full arc for one chapter:

`assemble` → **corpus review** → `audio` → **audio review** → **Mark done**
&nbsp;&nbsp;&nbsp;&nbsp;↳ then **Step 3b** builds `chapter-N-extras`, which repeats the same arc.

Step 3b is a standard step of building a chapter, not an optional extra. Do not skip it.

Reviews happen in the dashboard, never a terminal table. Start it once and leave it running:

```sh
npm run serve   # then open the printed http://localhost:… URL (Ctrl+C to stop)
```

**RESTART it after any change to the server, the note type, or the card templates.** "Leave it
running" means across a review, not across a week: the process serves the code it started with, and
a long-lived dashboard silently keeps rendering the old review page. A session once reviewed a lesson
through a dashboard six days old, so the Card faces view did not exist on the page, the exclusion
provenance badge was missing, and a badge fixed days earlier still did not render. Nothing warns you,
because a stale page looks exactly like a current one. On-disk state is unaffected, so a restart costs
one command and a reload.

## Step 1: What do you want to build a deck for?

Use the `AskUserQuestion` tool to ask which source to build from:

1. **A real-life lesson** — a list of English words/phrases you learned in an actual class, to
   organize into a course.
2. **A bundled template** (ready-made vocabulary, e.g. `travel-essentials`, `numbers`). Templates are
   language-agnostic — the target language is a build-time choice, so the *same* template can become
   a deck in any language.
3. **Your own EPUB**: path to an .epub file on your machine.

Then disambiguate with follow-up questions specific to that source. **Every one of these is a real
question to the user, never something you infer from the state of `output/`.** Reading the on-disk
state tells you what the OPTIONS are; it never tells you which one they want. A build costs LLM and
TTS credits and lands in a deck they study daily, so guessing wrong is expensive in both.

- **Which book? (EPUB) — always ask, even when there is exactly one.** List the EPUBs already worked
  on by calling `listBooks(outputRoot)` (`src/cli/outputPaths.js`) and offer each (labelled by
  `title`) as an option, **always alongside "a new EPUB (I'll give a path)"**. A single existing book
  is not an answer: the user may well be starting a second one, and that option has to be on the
  table every time. Every `--epub` build keeps a copy of the source file in the book's output folder,
  so an existing book builds with `--book <book-slug>` and no path. If `listBooks` returns nothing,
  just ask for a path. Either way, ask which target language.
- **Which lesson? (EPUB) — always ask, and never assume "the next one".** Having picked an existing
  book, the chapters already on disk make it obvious which lesson comes next, and that inference is
  exactly the one to resist: the user may want to rebuild an earlier lesson, skip ahead, or jump to a
  section out of order. Present the choice; you can flag which lesson is next in sequence as a
  suggestion, but the user picks. Select by the book's OWN table of contents, never a raw spine
  index: an EPUB "chapter number" is just a content file's position, and a lesson can span several
  files. Run
  `anki-builder assemble --output-root output {--epub <path> | --book <slug>} --list-lessons --lang <lang>`
  (or `listLessons(epubPath)` in `src/corpus/epubLessons.js`) and pass the chosen `label` (or
  `[number]`) to `assemble --lesson`. Fall back to `--chapter-number <spine index>` only when the book
  has no navigation document.

  **Present EVERY nav entry, with its `type` as an annotation — never as a filter.** `classifyLesson`
  is a label-only heuristic anchored on English words (`Unit …`, `Lesson …`, quiz/review/test,
  cover/contents/preface/appendix), and anything else is `other`. Selection works on any entry
  regardless of type, so the type is a hint for the reader, not a gate. On a book whose chapters are
  titled anything else — a novel, a non-English textbook, "Chapter 5", "第5課" — **every entry
  classifies as `other`**, and filtering to `lesson`-typed entries would show the user an empty list
  for a book that is perfectly buildable. Say what each entry is (number, label, spine range) and let
  them choose.
- **Which template?** List them via `listTemplates()` (`src/corpus/templates.js`) and describe each
  by its *vocabulary* (read from `templates/<name>.json`), never by language. `AskUserQuestion` needs
  a second option, so pair a lone template with "None of these fit"; that choice leads to creating a
  new template (below). Then ask **which target language** to build in, since `assemble --template`
  requires `--lang`. Prefer an ISO 639-1 code (`es`, `ja`) so the default voice lookup and ElevenLabs
  `language_code` resolve.
- **Which course? (lesson)** List existing courses (`listCourses(outputRoot)`, or read
  `output/courses/*/course.json`) plus "start a new course"; a new course needs a name and target
  language.
- **Which lesson number? (lesson)** Suggest the next free one
  (`nextLessonNumber(outputRoot, courseSlug)`) and let them confirm or override. Ask about a custom
  sub-deck label too (defaults to `"Lesson <N>"`); a course that will get extras units needs a real
  `"Lesson N: Title"` label to group under (see Step 3b).
- **The word list itself (lesson).** Ask them to paste or dictate the English terms, one per line,
  and write them to a plain text file (e.g. `<scratchpad>/lesson-words.txt`), since
  `assemble --words` reads a file, not inline text. Capitalize each gloss as you write the file
  (sentence case; see [card-authoring-rules](references/card-authoring-rules.md)).

### Creating a new reusable template

A template is reusable English vocabulary + categories with no language baked in; creating one is
its own small flow (gather terms language-agnostically, author `templates/<name>.json` on a branch,
register and test it, review it with the user) that completes before you return to the deck build.
Follow [references/template-creation.md](references/template-creation.md) for the steps.

## Step 2: Build the lesson — `assemble` runs the whole pre-review pipeline

One command builds the lesson all the way to its first review gate. `assemble` writes `corpus.json`
and then automatically chains into the `prepare` stage (translate → fill-in-the-blank enrichment →
semantic de-dup → cross-lesson notes → number readings) under a single build claim. There is no stopping point in the
middle, by design: every one of those steps changes which cards exist or what they say, so a lesson
that halts partway is a half-built lesson nobody can sign off on.

**Do not report a lesson to the user until `assemble` has returned.** Its last line is
`prepare: <runDir> is ready for the corpus review` — that, not `wrote corpus with N item(s)`, is the
point at which you hand over. If you only need the corpus (rare — a debugging run), pass
`--no-prepare` and say plainly that the lesson isn't reviewable yet.

If a build stopped partway (a crash, an interrupted session), run **`anki-builder resume --run
<runDir> --dry`** and then without `--dry`. It reads the pass ledger the build wrote and re-runs
exactly what failed, including the extraction-branch passes (the forward flags, the pedagogical
sort) that a plain `assemble` re-run skips entirely once `corpus.json` exists. Re-running `assemble`
is still fine and still picks up `prepare`'s remaining steps, but it recovers `prepare`'s passes
ONLY, so reach for `resume` first. The dashboard lists an unfinished lesson under **Not finished**,
never under In review.

The forms, per source. All print `resolved run directory: …`; **capture that path**, it's the
`<runDir>` for every later `translate`/`audio`/`deck` call, and re-running the same form reuses the
same folder:

```sh
# Template — files under output/templates/<templateName>/<lang>/; --lang is required.
anki-builder assemble --output-root output --template <templateName> --lang <lang>

# Real-life lesson — files under output/courses/<course-slug>/lesson-<seq>/.
anki-builder assemble --output-root output --words <wordsFile> \
  --course "Intensive Japanese 1" --lesson-number <N> --lang <lang> \
  [--lesson-label "Lesson <N>: <topic>"]

# EPUB — files under output/epubs/<book-slug>/chapter-<seq>/. Prefer --lesson (from Step 1's
# --list-lessons); --chapter-number is the no-TOC fallback.
anki-builder assemble --output-root output --epub <path> --lesson "<label or number>" --lang <lang>
anki-builder assemble --output-root output --book <book-slug> --lesson "<label or number>" --lang <lang>
```

Notes on the forms:

- A `--lesson-number` the course has already used is refused, with the next free number in the error
  (two lessons prepared at once would otherwise both build as "Lesson N"). Pass `--force` only to
  deliberately rebuild an existing lesson.
- A dictated lesson's items all have `target: null`; `translate` fills them in fresh, and category
  assignment is a quick automated pass you check at the corpus review.
- An `--epub` build copies the source file into the book folder and writes a `book.json` marker, so
  the book is pickable later without re-locating the file.
- A template has no book-level merge (one unit per language), so its Step 5 `deck --run` output is
  the final artifact; skip Step 6. A one-off ad hoc build can use `--run <anyDir>` instead.

**Build a new book's taught index ONCE, before its first lesson.** The forward-flag pass judges
whether an item is premature by consulting a whole-book index of what each chapter introduces. A
build only ever READS that index; it never builds one. Build it deliberately, before you start on a
book's lessons:

```sh
anki-builder epub taught-index <epubHash>   # --lang <lang> if the book predates the language record
```

The hash is the directory name under `.anki-builder/epubs/` (`anki-builder epub cache <hash>` prints
it, along with whether an index already exists). It costs one model pass over every chapter — a few
minutes on a 57-chapter book — and it is the only time that book pays for it. The command refuses to
re-spend on a book that already has one unless you pass `--force`.

A book with no index is not blocked: the forward pass falls back to having the model read every
chapter after the lesson, which is what it did before the index existed. It just costs more, on
every single lesson. The reason this is a command rather than something the first lesson does for
you: it used to build itself lazily, and on lesson 15 that meant a 57-chapter pass firing unasked in
the middle of one lesson's build. It exhausted the usage window, and the four passes queued behind
it in the same build all failed in turn.

**Build a book's lessons in ascending order, and mark each one reviewed before assembling the next.**
A lesson's build reads what the book has already taught from two places: the backward-dedup library,
written by the dashboard's **Mark reviewed** (not by the build), and each earlier lesson's
`cards.json`, written by its `prepare`. Assembling lesson 8 before lesson 7 is reviewed means
lesson 8's de-dup cannot see lesson 7 at all. Neither is blocked (both commands warn and carry on,
and `prepare` leaves its markers unset so a re-run repairs the result), but treat the order as the
rule: finish and sign off lesson N before you assemble lesson N+1, and never build two lessons of one
book at the same time.

**Gate 1 must see the FINAL card set.** Everything that changes which cards exist or what they say
(extraction, translation, FIB mining, semantic de-dup, cross-lesson notes) runs inside
`assemble`/`prepare`, before the review opens, never after it. A human signs off once, on the
complete lesson. This is enforced by the CLI, not by discipline: those steps used to be separate
commands, which is exactly why they got skipped. The dashboard enforces it too — a lesson missing a
pass shows no **Mark reviewed** button and sits under **Not finished** with the command that finishes
it (`anki-builder prepare --run <dir>`). Templates are exempt from the drill/notes passes (nothing to
mine, no siblings).

**FIRST, read the WHOLE chapter, start to end.** This is a required step of every EPUB build, and it
comes before the image sweep because it is what tells you how much there is.

```sh
node scripts/chapter-outline.mjs <runDir>             # the whole chapter, with an end marker
node scripts/chapter-outline.mjs <runDir> --summary   # structure only, no text
```

**The guarantee is the file, and it is already exact.** `extractChapterToFile` wrote precisely one
lesson's content — one spine file, or the concatenated range for a lesson spanning several — so
"where the chapter starts and ends" is settled before you read a word. The script prints all of it
and stamps the bottom:

```
END OF CHAPTER — 7911 chars, 17 heading(s), 46 image(s).
If you did not see this line, you have not read the chapter.
```

That works for any EPUB: a textbook, a novel, a book in any language.

**Do NOT page the raw XHTML with `sed -n 'A,Bp'` windows.** That is exactly how this goes wrong,
because nothing inside a window tells you the file kept going. On Lesson 16 the chapter was 942
lines, the reading stopped at 780, and two whole exercises were never seen — one of them the only
place the chapter used half of its own station-exit vocabulary, so those cards were built and then
appeared in no sentence. The extraction pass had the same partial view, and nothing anywhere said so.

**Two annotations come free, and they are worth different amounts:**

- **Text-vs-image balance** is universal. A chapter with little text and many figures is one whose
  content is IN the pictures — this book's kana tables are 47 characters and a full-page chart — and
  the script says so rather than letting it read as an empty chapter.
- **The book's own numbered runs** (`EXERCISES: 8 block(s) — I … VIII`) are the sharpest signal there
  is *when the book has them*, because a hole in the run names a block nobody read. But this is ONE
  publisher's convention, read off its marker images. On front matter, on a novel, on any book that
  numbers things differently, it is empty — and **empty means "this book doesn't number its blocks",
  never "there is nothing here"**. The script says that too. Never treat the absence of a checklist as
  permission to skim; the completeness guarantee is the file bounds, not the numbering.

When the numbered runs ARE there, account for every one when you hand over the review link — a line
each, saying what it teaches or why it produced no card. Silence about EXERCISES VI is precisely what
a short read produces.

This generalises past any one book. **A section you did not read is indistinguishable from a section
with nothing in it** — the same failure as the image sweep below (a chart nobody opened looks like a
chapter with no chart) and the vocabulary diff further down (a dropped block looks like a chapter
with fewer words). None of the three is satisfied by reading carefully.

**Then sweep the chapter's IMAGES. This is a required step of every EPUB build,
not an optional check.** The extraction pass DOES see images: `extractChapterToFile` writes every
image a chapter references next to the cached chapter file, and the extraction prompt tells the model
to open each one with its Read tool and judge it (`docs/epub-extraction-prompt.md`, "Images"). What
is missing is any check that it did. Nothing records which images were opened, so a chapter whose
grammar table the model skipped is indistinguishable from a chapter that had no table — and every
stage AFTER extraction (drill mining, de-dup, the note pass) really does work on text alone, so
nothing downstream can notice either. Your sweep is the second pair of eyes on the one step that can
silently drop a whole paradigm. It costs about thirty seconds:

```sh
node scripts/chapter-images.mjs <runDir>     # or: <epubHash> <chapterNumber>
```

**Do not unzip the EPUB.** The build already extracted every image the chapter references, into the
book's cache beside the chapter file (`.anki-builder/epubs/<hash>/`, at the path the chapter's own
`<img src>` resolves to — usually `images/`), because that is how the extraction model opens them.
The script lists them with their real paths on disk, and quotes what the book's cached
`conventions.md` says about each: the whole-book conventions pass already went through every chapter
and listed its image-embedded content per chapter, naming files. Start there, and read the chapter's
own `Image-Embedded Content` entries.

**Open EVERY image that is or could be a TABLE, CHART or LIST. There is no triage for those, ever.**
A chart's content is invisible from outside it: you cannot tell a complete conjugation table from a
decorative one by where it sits, what it is called, or how big the file is, so any judgement made
before opening it is a guess. Only an ILLUSTRATION — a picture of a scene or an object — is eligible
for the position triage below, and when you cannot tell which kind it is from the markup, that means
open it. Prose that promises a chart ("the chart on the following page", "repeat the verbs below",
"memorize their forms") is a guarantee that the next image is one.

**And having listed the images you intend to open, open ALL of them before you call the sweep done.**
Naming an image as load-bearing and then not reading it is the same outcome as never noticing it,
with more paperwork. This happened on Lesson 15: four charts were identified, two were read, the sweep
was reported complete, and the two unread ones turned out to hold the lesson's main grammar table —
thirteen verb pairs, of which four verbs (lend, wait, be, take) were on no card at all. The owner
found them by reading the book.

For the rest (the illustrations), judge each by POSITION, not filename and not by what conventions.md
called it: a figure sitting under a heading whose text then runs out, or referenced by prose with no
visible referent, is load-bearing; an illustration whose labels already appear in the text is
decoration. Being unnamed in `conventions.md` is an absence, not
a verdict — that pass read 57 files in one call and can have missed one. `conventions.md` describes
the book's MARKUP and where things are; it never decides what gets extracted, and the extraction
prompt says so in as many words. It is also cached for the life of the book, so `assemble` warns when
the prompt that produced it has been edited since (the sibling `conventions.md.meta.json` records
which version ran). Nothing regenerates it automatically — that is a paid whole-book pass, so deleting
the file is a deliberate choice you make, not something the build does for you.
**A paradigm you find in an image is BASE-lesson work, and gate 1 is your only chance at it.** Audit
it cell by cell against the built cards now, before you hand the link over, and add whatever is
missing: a chapter's own grammar table belongs in the lesson that teaches it, and nothing may be added
after the reviewer signs off. Sending it to the Step 3b brief instead is too late by two gates. Step 3b
is for drilling what the lesson already teaches, not for the teaching the extraction dropped.

This is not hypothetical. Lesson 15's ます→dictionary-form chart (the whole grammar point of the
chapter) reached gate 1 with seven of its ten cells uncarded, including both irregular verbs, because
the extraction applied its paradigm-table restraint rule to a group the chart itself headed
**Irregular**. The sweep is what caught it; the prompt has since been amended so restraint never
overrides an irregular cell.

**Report what you find WITH the review link**, so the reviewer signs off gate 1 knowing whether the
chapter taught anything the cards cannot have covered. Transcribe any load-bearing figure into the
Step 3b brief as well, so the drill pass can build on it. Full procedure for the cell-by-cell method:
[extras-pass](references/extras-pass.md).

**Check the target against its own romaji, because a scanned book's kana can be WRONG.** This book's
OCR turns small kana into large ones — ょ into よ, ゅ into ゆ, っ into つ — and the extraction is right
to copy what it sees rather than silently correct a source it cannot second-guess. The result is
cards whose target is not a word: `いっしよに`, `たべましよう`, `しゆうまつ`, `ちよつと`, `しよくじ`. On
Lesson 16 there were ten of them, including the chapter's entire ましょう paradigm, and the same
chapter spelled `しましょう` correctly two rows away — which is how you can tell OCR damage from an
orthography choice.

**The romaji is the tell, and it is free.** The romanization pass reads the intended word and
normalizes it, so a corrupt target comes out with a CORRECT romanization sitting beside it:
`いっしよに` / `issho ni`, `いきましよう` / `ikimashō`, `しよくじ` / `shokuji`. Target and romaji
disagree, and the romaji is the one to believe. Two other cheap confirmations, both internal to the
chapter, so you never have to trust your own reading of Japanese: the same word usually appears
correctly somewhere else in the chapter (the dialogue wrote `つぎの` while the vocabulary row said
`つき、`), and `scripts/vocab-coverage.mjs` reports a corrupt card as MISSING with the correct form as
its "nearest card target".

A quick sweep for the pattern, which is a large よ/ゆ/や directly after an i-column kana:

```sh
node -e "…/[きしちにひみりぎじびぴ][よゆや]/…"   # then JUDGE each hit
```

**Judge every hit; most are false positives.** `にぎやか`, `おみやげ`, `にちようび`, and the `や`
particle all legitimately take a large kana, and the regex also matches across word boundaries
(`によこはま` is に + よこはま). On the full book that sweep returned 47 hits of which 7 were real, all
in one chapter. Correct the real ones at gate 1, leave them flagged **Uncertain** with a note saying
what you changed, and say so when you hand over the link — you have edited the book's own text, and
the reviewer should confirm it rather than take it on trust.

**Also diff the chapter's VOCABULARY entries against the built cards, for the same reason.** The
extraction can skip a whole vocabulary block silently, and nothing downstream notices: a chapter is
simply short a few words, which looks like a chapter that had fewer words. It happens most often to
the LAST block before a section boundary. The check is a script, not a read-through:

```sh
node scripts/vocab-coverage.mjs <chapterFile> <unitDir>
```

`preflight` runs the same diff across every base unit of the book (at INFO, and skipping any unit
whose chapter is not cached), so a whole-book answer comes free with the gate. Run the script when
you want one unit's answer while the chapter is in front of you.

`<chapterFile>` is the cached chapter XHTML the extraction model itself read
(`.anki-builder/epubs/<hash>/chapters/<n>.xhtml`); `<unitDir>` is the folder holding `cards.json`.
It pulls every headword + gloss out of the chapter's `<table class="voca">` blocks, sub-rows
included, and reports the ones no card's `target` contains.

**A `／` in a headword means TWO words, and each needs its own card.** The book writes
`つま ／ かない` for "(my) wife" and `おっと ／ しゅじん` for "(my) husband" — different words, one
gloss. The script splits them and checks each separately, because reporting the cell whole is a miss
that LOOKS like a false positive: the `nearest card target` comes back as the half that IS carded,
and the row reads exactly like the optional-parts noise below. That is how `かない` and `しゅじん`
stayed unreported, with four sentence cards already using `しゅじん` and nothing teaching it. Counter
sound-variants (`〜ほん ／ ぼん ／ ぽん`) split the same way and should: a beginner cannot derive
`ろっぽん` from `にほん`, so each shape has to appear somewhere.

**A headword can also be hidden by a LONGER word that contains it.** `しゅじん` reads as covered
because `ごしゅじん` is carded, and the two are different words — the honorific prefix changes who is
being talked about. The script cannot tell that from containment, so when a report's only coverage is
another vocabulary entry rather than a sentence, check it by hand.

Expect a couple of false positives and check each by hand rather than adding blindly. The script
already resolves the two conventions that cause most of them (a word printed with optional parts,
`(お)てら`, matches the card `おてら`; an attachment-point `〜` is notation, not card text) and prints
the nearest card target beside each report, which usually explains it. A genuine miss looks
different: no near-match at all, and its block-mates are usually missing too. Add real misses
**before** the reviewer signs off, since gate 1 is the last moment a card can be added without
sending the lesson back through it.

What `prepare` runs, in order (details and prompts per pass are in
[card-authoring-rules](references/card-authoring-rules.md) and the `docs/*-prompt.md` files):

1. **Translate**: translations + pronunciation via `claude -p`, written to `cards.json`. Romanized
   pronunciations (kuroshiro etc.) are corrected by a Sonnet-medium pass
   (`src/translate/romanizationEval.js`), so garbled romaji should be rare. Failed items are recorded
   in `meta.translateErrors` and block the review; a `translate` re-run retries exactly the failed
   subset and merges the successes back in at their corpus positions.
2. **Fill-in-the-blank enrichment** (`src/cards/fillInBlank.js`): mines the chapter's drills into
   practice sentence cards, marked `"fillInBlank": true`, appended as a contiguous block at the end
   of the lesson. Skipped for templates.
3. **Semantic de-dup** (`src/cards/semanticDedup.js`): keeps at most ~2 examples per sentence
   pattern; redundant FIB cards are excluded (not deleted) with a `reviewNote`, restorable at gate 1.
4. **Cross-lesson notes** (`src/cards/crossLessonNotes.js`): one pass per lesson, fed only earlier
   lessons, writing backward cross-references, usage notes, and collision cues.
5. **Number readings** (`src/cards/numberReadings.js`): the only pass that runs on demand rather than
   always. `findUnreadableNumbers` looks for a digit still sitting in a card's `ttsText` or
   `pronunciation`; if it finds any, a model spells them out (the right form depends on the counter
   and is often irregular — 4がつ is しがつ, not よんがつ — so a regex would produce confidently wrong
   audio). It runs LAST, so it also covers the cards the drill pass invented. Every card it touches
   is flagged **Uncertain** with a `reviewNote` naming this pass, and a "fix" that still contains a
   digit is discarded rather than recorded.

That `reviewNote` matters at gate 1, because **Uncertain** is written by four different passes:
extraction (unsure the item belongs at all), backward dedup ("possibly already taught"), the
forward-flag pass ("this chapter uses something a later chapter teaches") and this one. The badge
alone tells you nothing about which; the Review note column is where each pass says why, so read it
before deciding what an Uncertain card needs.

The corpus comes out **pedagogically sorted** (atoms before molecules; `--no-sort` keeps raw order),
with any run of sequential numbers jumbled, and that one order flows through every stage, review, and
the deck. Full ordering rules, and every card-content rule (sentence-case English, no editorial
spaces or terminal `。`, `ttsText` for numerals, provenance flags, scene/hint/note/reviewNote, collisions,
Q&A splits, worked examples for grammar cards): [card-authoring-rules](references/card-authoring-rules.md).

## Step 3: Gate 1 — the corpus review

Open the lesson's **Review** view on the dashboard (`/review/...` — distinct from the read-only
**Browse** view). The unit renders the combined **Corpus review**: columns #, **English**,
**Category**, **Target**, **Pronunciation** (romaji), **Hint**, **Note**, **Review note**,
**AI-suggested**, **Uncertain**, **Exclude**. Target/Pronunciation are inline-editable (click a cell,
edit, click away to save); each row has an **Exclude** checkbox and the lesson a **Mark reviewed**
button. This is the point to catch a bad translation before it becomes a pain to organise — fix or
exclude it here (or tell me the rows and I'll edit `cards.json`). Excluding a card writes a
reversible `excluded` flag: the `audio` stage skips excluded cards (no TTS spent) and the deck build
drops them.

**Open the Card faces view too** (the "Card faces →" link in the review lede, or `/faces/...` with
the same path). It renders every card through the deck's real templates and real CSS — both
directions, front and back, click a header to flip. Read the two FRONTS side by side before you
accept a `scene` or a `hint`: `scene` shows on BOTH fronts, so it must not leak the answer in either
direction, while `hint` shows only on the Production front. It is read-only and touches nothing.

What to check, beyond reading the columns: the card-content rules in
[card-authoring-rules](references/card-authoring-rules.md). The ones most often violated: a scene or hint on
any English-gloss or target collision, answer cards answerable alone, notes/hints that restate the
card (delete these), missing `ttsText` on numerals, and study order (a sentence landing before its
vocabulary).

Run `npm run preflight` before you hand over the link. Its INFO checks name what the columns cannot:
`answerable-alone` (a reply-shaped English with no scene), `production-length` (a Production face
over 60 characters), `near-siblings` (one sentence frame drilled three times with a swapped name),
`romaji-style` and `inline-romaji`. Each names a shape and leaves the verdict to you; re-run with
`--verbose` to see the actual cards.

**Read every note the `note-claims` check lists, and decide whether it is TRUE.** This is a required
step of Gate 1, not an optional one. Every other note check in this project is structural — does the
note exist, does it restate the gloss, does it carry a romanization, does it point backwards — and
none of them asks whether what the note says is correct. A shipped card currently teaches a false
morphological analysis (なんじ and なんにん presented as instances of なんの) that got through
extraction, the cross-lesson note pass, the corpus review and Mark done, because nothing in that
chain was ever looking.

```sh
node scripts/preflight.mjs --all --only note-claims --verbose
```

It lists every note asserting a decomposition, derivation, distinction or identity — "X + Y", "the
て-form of X", "distinct from X", "the same word as X" — and, for each target-script form the claim
names, whether this collection teaches a card for it. **Start with the ones that name a form the deck
has no card for**: those are either a legitimate etymology aside or an invented root, and the two look
identical in a JSON row. The check produces the list and stops there on purpose; whether お + かし =
おかし is a fact about Japanese, and no amount of code decides it. Fix or delete a note you cannot
confirm — an unverifiable note is worth less than none, because the learner has no way to know.

When it looks right, click **Mark reviewed** — that sets `cards.meta.reviewed: true` (the gate
`audio` checks — it won't spend TTS credits on an un-reviewed lesson) and, for an EPUB source, saves
the reviewed (excluded-filtered) corpus to the dedup library for later chapters' backward-dedup. Then
move straight into Step 4 in the same turn — marking reviewed IS the go-ahead.

**Nothing may be added to the lesson after this gate.** If you later realize a card is missing, don't
quietly append it — say so, add it, and send the reviewer back through the corpus review, so no card
ever reaches the deck without a human having seen it in these columns.

A mis-clicked sign-off is reversible: the corpus step has an **Unreview** button that withdraws the
review (and removes the lesson's dedup-library entry). It refuses while the lesson is `done`, since
done means "in the shipping deck" — clear that first with `node scripts/undone-unit.mjs <runDir>`,
then Unreview.

## Step 3b: The extras pass — build the lesson's drill unit

**Run this for every chapter/lesson, once the base unit is DONE (gate 2).** The exclusions a reviewer
makes at gate 2 change the base card set that the extras duplicate and collision audits diff against,
so authoring extras against a lesson still in review silently invalidates both audits. The extraction
always leaves value behind: the chapter's spoken material (Target Dialogue, Speaking Practice) that
never became cards, and coverage gaps (words in no sentence, particles with one example). The extras
pass fixes both by building a second, sibling unit of drill cards (`chapter-N-extras/`) that ships
as its own sub-deck under a shared `"Lesson N"` grouping deck, so the base lesson never grows and
each can be studied alone. The extras unit is a first-class lesson with its own two gates.

The full procedure (the two-wave subagent process, the rules the pass must not break, the
duplicate/collision audits, and the seeded shuffle + hoist ordering) is in
[references/extras-pass.md](references/extras-pass.md). Load that file and follow it; do not run the
pass from memory. Two rules worth restating here because they shaped the design:

- **A deck that holds cards must never have children** (Anki can't study a card-holding parent
  alone), which is why extras are a sibling under an empty grouping deck, never nested under the
  lesson.
- **Look at the chapter's images, and audit any paradigm cell by cell.** Extraction is shown the
  images but never reports what it made of them, and every stage after it reads text only — so a
  grammar table the model skipped reads as though the chapter never taught it. And when a chapter
  teaches a paradigm, check every cell of it against the whole deck rather than trusting a glance.
  Both procedures are in [extras-pass](references/extras-pass.md).

Build the extras unit for chapter N before moving on to chapter N+1.

## Step 4: Audio generation, then Gate 2 — the audio review

```sh
anki-builder audio --run <runDir> [--voice <voiceId>]
```

Requires `ELEVENLABS_API_KEY` and a corpus review sign-off (it refuses un-reviewed lessons). It
fetches one default clip per card (ElevenLabs `eleven_v3`), trims trailing silence and cleans noise
(needs optional system `ffmpeg`), caches fetches in `.anki-builder/audio/`, copies clips into the run
directory, and writes the references into `cards.json`. `--voice` can be omitted for a language with
a configured default voice (`DEFAULT_VOICES` in `src/audio/voiceLibrary.js`); add new long-term
voices there. Skipping audio entirely is fine; cards just won't have recordings.

For Japanese, the TTS text gets a throwaway end marker (`。ででで`) appended so ElevenLabs clips the
marker instead of the phrase; the trim strips it, and a card where it couldn't is flagged
`audioMarkerStuck` (badged **Marker audible** in the review). The displayed card never carries a
`。`. Details: [audio-pipeline](references/audio-pipeline.md).

**Re-running `audio` is safe.** The stage skips any card whose shipping clip it doesn't own: picked
variants, Replace uploads, and manual trims are never overwritten, so a full re-run (after adding
cards, editing a `ttsText`, or dropping the cache) only regenerates default clips.

**Drop the whole audio cache (`rm -rf .anki-builder/audio`) whenever the audio-generation algorithm
changes.** The cache key doesn't encode processing, so old clips are served stale forever otherwise.
The full rule and the incident behind it: [audio-pipeline](references/audio-pipeline.md).

**Review gate — the Review view's audio stage.** Once a lesson is at the audio stage its Review view
renders an inline player per card plus **Replace** / **Generate** / **Generate (kanji)** / **Edit**
(manual trim) controls and an **Exclude** checkbox. Play each card's clip; for any that sound wrong,
**Generate** fresh takes (comma/bracket variants, 1 to 4 per card), audition them in the modal,
**Re-roll** an individual take (one credit each), and **Use this** to pick. **Replace** uploads a
hand-made clip. **Exclude** drops a card without returning to the corpus review. How each control
works: [audio-pipeline](references/audio-pipeline.md). Rebuilds are fully automatic, with no manual
rebuild button; **Mark done** folds the lesson into the group package and rebuilds then.

**Mark done — Gate 2, the final sign-off.** When the audio is finalized, click **Mark done** (sets
`cards.meta.done`). This is the gate the book/course merge checks: `deck --book-dir` and the
dashboard package only `done` lessons.

**A done lesson stays fully editable — there is no Reopen and no un-done button.** Done gates what
ships, not what you can touch: the lesson opens in the same editable review it always had, and fixing
a field on it needs no ceremony at all. What no button offers is the reverse of Mark done. To pull a
unit back out of the shipping deck, run `node scripts/undone-unit.mjs <runDir>` (backs up
`cards.json`, clears `meta.done`, rebuilds the collection without it). That is the whole recovery
path for a mis-clicked Mark done, and it stops at the package: cards already delivered to Anki stay
in the live collection, so the script asks for `--force` on a delivered collection.

**The exception: a FIELD-ONLY fix across many done units, edited on disk.** A deck-wide correction
(adding disambiguation cues to a dozen colliding cards, excluding a duplicate that breaks the build)
can touch ten units at once, and clicking through each one in the dashboard is a lot of ceremony for
a change that alters no card's existence. For that case, edit `cards.json` and `corpus.json` directly
and rebuild once at the end. The boundary that makes it safe:

- **Field edits and exclusions only.** Changing `hint`, `scene`, `note`, `english` or `target`, or
  setting `excluded`, is fine. **Adding a card is not**, ever: a new card has to be seen at the
  corpus review, so a shipped unit that needs one goes back through gate 1 — `undone-unit.mjs`, then
  **Unreview**, then the normal arc.
- **Back the file up first** (`<file>.pre-<reason>-<YYYYMMDDHHmm>.bak`, the convention the migrations
  use — the stamp is what stops a second run of a tool overwriting the first run's restore point;
  `scripts/prune-baks.mjs` ages them out) and keep
  `cards.json` and `corpus.json` in step, since the review reads one and the build the other.
- **Rebuild by hand afterwards**: `deck --book-dir <bookDir>`. Nothing triggers it for you, because
  no unit changed state, so the merged `.apkg` silently keeps the old content until you do.
- **Re-run the audits** (collision, duplicate) before rebuilding; a cue you just wrote may be the
  thing the audit was waiting for, and an exclusion can change what collides.
- **Expect orphans on the next delivery.** A card excluded after it has already reached Anki leaves
  a note behind. `deliver-to-anki` reports it and never deletes it, so removing it is a manual step.

## Step 5: Deck build

```sh
anki-builder deck --run <runDir> [--name "My Deck"]
```

Reads `cards.json`, assembles a two-template Anki deck (Recognition + Production), includes audio if
present, and writes the package into the run directory. **A package is named after what it contains,
not the legacy `deck.apkg`** (`src/deck/deckFileName.js`): a template language dir builds `<template>-<lang>.apkg`,
a one-off run dir `<folder>.apkg`. For a template/manual source this is the final artifact. Chapter
and lesson units do not build one at all — they ship inside their collection's package (Step 6).

## Step 6: Build the book/course-level package (EPUB books and courses only)

```sh
anki-builder deck --book-dir output/epubs/<book-slug>      # an EPUB book
anki-builder deck --book-dir output/courses/<course-slug>  # a lesson-sourced course
```

Scans every `chapter-*/cards.json` or `lesson-*/cards.json` under the folder, including the
`-extras` drill units, and writes one `<that-folder>/<that-folder-slug>.apkg` (e.g.
`output/epubs/japanese-for-busy-people-book-1-kana/japanese-for-busy-people-book-1-kana.apkg`) with
each unit as its own real Anki sub-deck under one parent named for the book/course. The name is
derived from the folder path, so the writer and any reader compute it the same way and can never
disagree. Deck paths come from `unitDeckSegments`
(`src/deck/deckPath.js`): a `"Lesson N: Title"` label nests as `Parent::Lesson N::Title` with its
extras beside it. **Only `done` units are included.** Always rebuilds from scratch; run it again any
time a unit changes. Skip for template/manual decks.

## Step 7: Import & deliver

First import of a deck: File → Import in Anki, select the collection's `.apkg` (or the template's own
one), check the sub-deck hierarchy and audio playback. Two things to know before that first import:

- **Turn on sibling burying** on the deck's options preset once it is in (Options → Burying → bury
  new siblings + bury review siblings). Each note makes two cards and, unburied, they come up in the
  same session, so the second is answered from memory rather than recalled. The package ships its
  own preset (`anki-builder`) with this already on, but a deck you already have keeps the preset it
  already has, and AnkiConnect never writes deck options.
- **Never import a bare-guid deck into a collection that already holds another one.** Anki matches
  note guids collection-wide. New collections get a namespace from their folder slug; the two
  collections delivered before that existed ship bare card ids. `npm run preflight` prints which.

**Every later change to a deck the user already studies goes through the deliver tool, never a
re-import.** `node scripts/deliver-to-anki.mjs --dry` to preview, then without `--dry` to deliver: it
backs up every managed deck (with scheduling), syncs the note type, updates note fields in place by
GUID (scheduling preserved), adds new cards, reports orphans, syncs AnkiWeb, and exits non-zero if
any cards were skipped as ambiguous. Backups are pruned (newest 10 plus one per older week) and
restorable with `scripts/restore-anki-backup.mjs`. The user studies daily: protect scheduling, and
re-read on-disk deck files before every edit. Full detail, including the restore procedure and the
managed-collection rules: [deliver](references/deliver.md).

A deliver can stop on one of four guards, and none of them is a reason to reach for a flag without
reading: the parent deck was renamed (the lookup found no notes where the marker says a delivery
happened); more than 10% of the previously-delivered cards no longer resolve; more than 200 notes
would be ADDED at once (`--allow-bulk-add` after reading the dry run); or the pre-delivery backup did
not actually export. Each says which one it is.

If something looks wrong earlier in the pipeline, edit `corpus.json`/`cards.json` and re-run from
that stage. Stages are resumable, and a stage whose output exists reuses it.

## Command Reference

All commands use `--run <dir>` to specify the run directory; only `assemble` can resolve one from
`--output-root`.

### Assemble corpus

The main per-source forms are in Step 2. Additional forms:

```sh
anki-builder assemble --output-root output --epub <path> --list-lessons --lang es  # list the book's own lessons
anki-builder assemble --run <dir> --epub <path> --chapter-number <N> --lang es  # low-level: the Nth spine file (no TOC)
anki-builder assemble --run <dir> --template travel-essentials --lang es        # ad hoc, unorganized
```

Flags: `--no-prepare` (stop after the corpus), `--no-sort` (skip the pedagogical sort), `--force`
(rebuild over an existing lesson number).

### Prepare (everything between assemble and the first review)

```sh
anki-builder prepare --run <dir>
```

Translate → FIB enrichment → semantic de-dup → cross-lesson notes → number readings, under one
build claim. `assemble`
runs this for you; invoke it directly only to finish an interrupted build or after
`assemble --no-prepare`. Idempotent; a lesson already marked reviewed is left alone. On failure it
keeps its claim, so a crash shows as *interrupted* rather than finished.

### Translate (one step of `prepare`)

```sh
anki-builder translate --run <dir> [--simple-script]
```

`--simple-script` constrains the generated `target` to the language's beginner script
(`src/translate/targetScript.js`; Japanese → kana only, no kanji). A re-run retries only the items
recorded in `meta.translateErrors`.

### Generate audio

```sh
anki-builder audio --run <dir> [--voice <voiceId>]
```

### Build deck / book deck

```sh
anki-builder deck --run <dir> --name "Travel Spanish"
anki-builder deck --book-dir output/epubs/<book-slug>       # merge a book (done units only)
anki-builder deck --book-dir output/courses/<course-slug>   # merge a course
```

### Preflight a collection before handing over a review link

```sh
npm run preflight                                    # every collection under output/
node scripts/preflight.mjs <collection-dir>          # just one (book, course, or templates/<n>/<lang>)
node scripts/preflight.mjs --all --verbose           # print the checks that passed too
node scripts/preflight.mjs --all --accept --note "…" # record the ACK findings you have judged
npm run check                                        # ci + validate:decks + preflight, before a deliver
```

Runs every deterministic check in one command. It opens with a **coverage header** naming what it
looked at (collections by kind, units by shape, anything it could not place), so "clean" can never
mean "I did not look", and it reports in three tiers:

- **FAIL** blocks. Schema, duplicate card ids (a clash makes the package build refuse, and it used
  to surface only at Mark done), uncued collisions, editorial spacing in a hand-authored unit, a
  schematic `〜` in a shipped target, an `-extras` unit that would overwrite its base chapter's
  dedup-library entry, a reviewed chapter missing from that library, a foreign `.apkg` in a
  collection folder, and a package older than a done unit's `cards.json`.
- **ACK** blocks only while instances are unreviewed. Marker-audible clips: a clip shipping with the
  TTS end marker still on the end of it. Fix it (re-trim it in the audio review, or run
  `node scripts/audit-marker-stuck.mjs --apply` if the flag is describing a take the card no longer
  ships) or judge the instance and `--accept` it with a note.
- **INFO** never blocks: cross-unit duplicate targets, exclusion provenance, the audio text-hash
  counts (how many clips still match their card's text), and the template path's
  readiness/enrichment exemptions.

Every check reads ONE collection. **Collections are isolated:** two decks built from two different
sources are separate products, and preflight never compares them, cues one against the other, or
reports them in reference to each other. Cross-referencing WITHIN a collection (a book's lessons and
its extras) is unchanged and is the whole point of the duplicate and collision checks.

Run it at the end of a build, before you post the link, and run `npm run check` before a deliver.

### Verify an `.apkg` actually imports (new source types, and any package-format change)

```sh
node scripts/verify-apkg-import.mjs --smoke                     # check the setup works
node scripts/verify-apkg-import.mjs output/epubs/<slug>/<slug>.apkg --expect-notes 1234
```

Imports the package into a **throwaway** Anki collection using the pinned `anki` Python package in a
virtualenv it bootstraps itself. No running Anki, nothing on port 8765. It reports the note/deck/
note-type counts that actually landed, plus what a re-import does (guid match vs duplicate) and what
happens to the deck-options preset with id 1. Three shipped `.apkg` format bugs passed every
synthetic check in this repo because nothing ever ran a real import; this is that.

Not part of `npm run ci` or `npm run check` — it needs a Python toolchain and a one-time wheel
download. Run it for the first-ever build of a new source type, and after any change to how packages
are written.

### Finalize an extras unit

```sh
node scripts/finalize-extras.mjs <extras-run-dir> [--seed <text>] [--dry]
```

The tail of the extras pass as one command, in the order the steps depend on: `prepare` (which grows
the unit, so it goes first) → duplicate check → collision audit → re-order with a fresh seed →
validate → preflight. Every report is printed for you to read; nothing but the ordering is applied,
and no audit is given `--apply`. Exit 2 means a report is waiting for your judgment, not that
something is broken. ⚠️ `prepare` spends model credits. Full reasoning:
[extras-pass](references/extras-pass.md).

### Recover a pass that failed — `anki-builder resume`

```sh
anki-builder resume --run <runDir> --dry     # what it would re-run, and why. Costs nothing.
anki-builder resume --run <runDir>           # do it
```

**This is the first thing to reach for when a build was interrupted.** Every model pass records its
outcome on the unit (`meta.passes`), and `resume` reads that ledger back and re-runs exactly what
failed, in pipeline order. You do not diagnose anything: the unit already knows.

Always run `--dry` first. It prints the same plan the real run executes, so there is no way for the
two to disagree, and each pass in that plan is paid.

What it does, per pass:

- **Re-runs** `forwardFlags`, `pedagogicalSort`, `romanization` itself. All three only annotate or
  reorder, so re-running one against a unit that already has cards cannot change what a card means.
- **Delegates** `translate`, `fillInBlank`, `semanticDedup`, `crossLessonNotes` and `numberReadings`
  to `prepare`, which already recovers them through the markers it writes. Romanization deliberately
  runs LAST, after `prepare` has had its chance to mine a drill block, so those cards get corrected
  too.
- **Refuses, and names the fix** for `extraction` (the item set itself — rebuild from scratch,
  passing `--run <thisDir>` so you don't leak a run directory), `bookConventions` and `taughtIndex`
  (book-level artifacts, each with its own command). When the taught index is missing AND the forward
  pass needs re-running, it tells you to build the index first — that ordering is what makes the
  forward pass cheap.

It **stops at the first pass that fails again** rather than marching the rest of the plan into the
same wall: a usage window that just refused one pass will refuse the next four too. The ledger
records the retry, so running `resume` again picks up from there.

It refuses a unit that is already **reviewed** or **done** — every pass it runs would change what
was signed off. Unreview first if you really mean to.

### Wait for a review gate

```sh
node scripts/await-review.mjs <runDir> --gate 1 [--timeout 30m] [--interval 15s]
node scripts/await-review.mjs <runDir> --gate 2
```

Polls the flag the reviewer's click writes and exits when it lands: `meta.reviewed` at gate 1,
`meta.done` plus a genuinely rebuilt collection package at gate 2. Read-only. Exit 0 signed off,
1 timed out, 2 the unit could not be read, 3 done but the package did not rebuild. The reasoning
behind each of those is in [The shape of the workflow](#the-shape-of-the-workflow) above.

For a one-shot answer instead of a wait — "is this unit really shipped?" — `node
scripts/check-done.mjs <runDir>` runs the same gate-2 check once and exits 0 / 1 (not done yet) /
3 (done, but the rebuild failed).

### Un-ship a unit (undo a Mark done)

```sh
node scripts/undone-unit.mjs <runDir> [--force-delivered] [--no-rebuild]
```

Backs up `cards.json`, clears `meta.done`, and rebuilds the collection package without the unit.
There is no dashboard button for this — done lessons stay fully editable, so nothing needed one —
and this is the reviewed replacement for editing the JSON by hand. `--force-delivered` is required
when the collection has been delivered to Anki, because **it never touches Anki**: notes already
delivered stay in the live collection with their scheduling, and only the package changes.

That flag name is the same across every tool that writes into a unit. `--force` means "yes, change a
unit a human signed off"; `--force-delivered` means "yes, and those cards are already in the live
collection". They are separate consents because they have different consequences, and one flag
covering both is how "re-order this finished unit" turned into "edit the deck I studied this
morning". The states themselves (`authored`, `reviewed`, `done`, `packaged`, `delivered`) are
computed in one place, `src/audit/state.js`.

### Validate every deck's JSON against the schemas

```sh
npm run validate:decks              # or: node scripts/validate-decks.mjs [output-root]
```

Checks every `corpus.json`/`cards.json` under `output/` against `src/model/index.js` and exits
non-zero on the first invalid file, listing them all. Worth running after any hand-edit and before
handing over a review link — a hand-authored unit (an extras unit above all) skips the stages that
would normally shape its fields, and the dashboard only reports the breakage one field at a time when
the reviewer clicks a gate. Deliberately NOT part of `npm run ci`: `/output` is gitignored, so CI has
no deck data to check.

### Restyle a deck's font

```sh
anki-builder restyle-font --apkg <path.apkg> --lang ja [--out <path.apkg>] [--fresh-notetype]
```

Embeds the language's configured font (`src/deck/fontLibrary.js`; Japanese → Klee One, a textbook
face) into an existing `.apkg`, scoped by `unicode-range` so only target-script text uses it. Works
on third-party decks too. Idempotent. Add `--fresh-notetype` when importing into a collection that
already has this deck's note type, since Anki keeps the existing note type's styling on a same-id
re-import and the font would silently not apply.

### Review a run (corpus, then audio)

Review happens in the dashboard's **Review** view (`/review/...`), not a CLI command; see Steps 3
and 4. A lesson whose build stopped early badges **incomplete** under **Not finished** and renders
read-only with the command that completes it. The read-only **Browse** view (`/deck/...`) is for
looking at a finished deck.

### Browse a built deck (`.apkg`) as an artifact

```sh
anki-builder view-deck --apkg <path/to/<slug>.apkg> [--out <file.html>]
```

Writes a read-only deck-browser HTML page (cards grouped by sub-deck, audio embedded inline,
collapsible per-lesson sections) to publish as a Claude Artifact. Reads the legacy
`collection.anki2`/`.anki21` format this project builds (not modern zstd `.anki21b`). Large decks
split into numbered parts to fit the Artifact size cap.

### The dashboard (`serve`)

```sh
npm run serve                                  # convenience wrapper (also: -- --port 5000)
anki-builder serve [--output-root output] [--port 4321] [--read-only] [--voice <id>]
```

A local web app (Node builtins only, binds localhost only) listing every built deck under `output/`
grouped into Books, Courses, and Templates, with per-lesson card tables and inline audio served over
HTTP (no size cap, unlike `view-deck`). Editable by default (Replace/Generate/Exclude, the review
gates, Deliver to Anki); `--read-only` disables all of that. Edits write straight to `cards.json` +
`audio/`; there is one `.apkg` per group, named after the group's folder, and **Mark done** rebuilds
it (shared `src/deck/rebuild.js`, same assembly as the CLI). A spot-check is: fix a done lesson's
audio → Mark done → import the on-disk `.apkg`.

The dashboard ingests each deck layout through a format adapter in `src/server/adapters/`
(`book.js`, `course.js`, `template.js`, registered in `index.js`, each implementing
`listDecks`/`loadDeck`/`resolveMedia`). If a new on-disk deck format is ever introduced, adding and
registering an adapter for it is part of shipping that format.

## State & artifacts

Each unit's run directory holds `corpus.json` (assembled), `cards.json` (translated and enriched) and
`audio/` (if the audio stage ran). **A chapter or lesson unit holds no package of its own** — there is
exactly one `.apkg` per collection, written at the collection root and named after that folder. Only
a template (or a one-off `--run` build) has a package beside its cards, because there is no merge
step above it.

Review happens live in the dashboard, which reads these files directly. **Older unit dirs may still
contain `review-corpus.html` / `review-translate.html` / `review-audio.html`** from the CLI-rendered
reviews this project used to write. Nothing generates or updates them any more: they are frozen
snapshots of a state long since edited, so never read one as current state, and never hand one to a
reviewer. `cards.json` and the dashboard are the state.

Under `--output-root`, each source type nests under its own reserved segment of `output/`:

```
output/epubs/<book-slug>/
  book.epub                 # copy of the source EPUB, kept so `--book <slug>` works later
  book.json                 # { title, slug, epubHash, targetLanguage } — powers listBooks
  chapter-0/                # corpus.json, cards.json, audio/ — no package
  chapter-0-extras/         # the chapter's drill unit (Step 3b)
  chapter-1/
  chapter-1-extras/
  <book-slug>.apkg          # the merged book package (Step 6) — the only .apkg here
  anki-delivered.json       # written by deliver-to-anki once this deck is in the live collection

output/courses/<course-slug>/
  course.json               # { name, targetLanguage }
  lesson-0/                 # same contents as a chapter dir
  lesson-0-extras/
  <course-slug>.apkg        # the merged course package (Step 6)

output/templates/<template-name>/<language>/
  corpus.json, cards.json, audio/, <template>-<language>.apkg   # one unit per language, no merge
```

Audio is cached in `.anki-builder/audio/<voiceId>/<model>/`; see
[audio-pipeline](references/audio-pipeline.md) for the layout and the cache-drop rule.

## Troubleshooting

- **"corpus.json already exists — reusing"**: not an error — assemble found an existing corpus and
  carried on into `prepare`; that's how a re-run resumes an interrupted lesson. To genuinely start
  fresh, delete `<runDir>/corpus.json` and `<runDir>/cards.json` first — and then **re-run assemble
  with `--run <that same runDir>`, not the `--book`/`--lesson` form.** A `--book`/`--lesson` build
  resolves its run directory by ALLOCATING the next free sequence number, and the number it already
  gave this lesson is only reclaimed by the claim file a FAILED build leaves behind. A build that
  succeeded and was then emptied by hand has no claim, so the rebuild takes a fresh number and the
  lesson lands one directory along, leaving an empty husk behind: this happened on Lesson 15, which
  rebuilt into `chapter-16` while `chapter-15` kept nothing but backup files. Nothing downstream
  breaks (the deck path comes from `meta.chapterLabel`, and `meta.chapterNumber` is the spine index,
  so directory numbers never matched lesson numbers anyway) but the tree becomes a puzzle. Pass
  `--run` and it rebuilds in place.
- **A lesson sits under "Not finished"**: its build stopped early. Re-run the same `assemble`
  command, or `anki-builder prepare --run <dir>` directly; nothing already done is redone. If the
  readiness message names failed translations (`translateErrors`), a re-run retries just those items.
- **"ELEVENLABS_API_KEY not set"**: ensure `.env` is copied from `.env.example` and contains your
  key, or export it.
- **Translation/audio failed**: the error names the stage. Fix the input and re-run that stage.
- **Anki import failed**: check the `.apkg` exists and the run directory path is correct.

## Learn more

- [README.md](../../../README.md) — project overview
- [docs/PIPELINE.md](../../../docs/PIPELINE.md) — pipeline implementation internals
- `.env.example` — environment variable reference
- ElevenLabs docs: https://elevenlabs.io/docs
- Anki docs: https://docs.ankiweb.net/

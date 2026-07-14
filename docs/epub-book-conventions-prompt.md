# Overview

Read EVERY chapter file listed below yourself, using your Read tool, in order. This is a {{TARGET_LANGUAGE}}-language textbook for English speakers, split across {{CHAPTER_COUNT}} chapter files:

{{CHAPTER_FILE_PATHS}}

You are NOT extracting vocabulary here. A separate process extracts flashcard vocabulary one chapter at a time; your job is to characterize the STRUCTURAL CONVENTIONS this specific book uses, so that process can be told what to expect before it starts, instead of re-guessing these conventions from scratch on every single chapter.

## Why

Different textbooks format the same kind of content differently — how they mark a fill-in-the-blank placeholder, how they visually distinguish real teaching content from practice drills, how they label key/model sentences. A per-chapter extraction pass only ever sees one chapter at a time and has to infer these conventions fresh every call, which risks being slow, inconsistent between chapters, or simply wrong when a convention only becomes clear by seeing it repeat across several chapters. Your job is to do that inference ONCE, thoroughly, across the whole book, and write it down clearly enough that a future process can rely on it without re-deriving it.

## What to look for

- **Placeholder / fill-in-the-blank conventions**: what character(s) or notation does this book use to mark "insert a word here" in a grammar pattern (e.g. a wave dash, a fullwidth tilde, an ASCII tilde, an underscore, bracketed text like "[noun]")? Give real examples you found, with the exact characters used.
- **Content markup**: what does a genuine teaching section look like structurally — vocabulary lists, key/model sentences, dialogue? Note recurring CSS classes, heading patterns, or tag structures that reliably signal "this is real content."
- **Exercise/drill markup**: what does a practice exercise or drill section look like structurally, that should be SKIPPED rather than extracted? Note how to distinguish it from genuine content.
- **Anything else structurally consistent** across chapters that would help a future single-chapter extraction pass — e.g. how chapters are titled/numbered, where vocabulary is glossed vs. inferred from context, recurring section labels.

If a convention only shows up in some chapters, say so and name which ones, rather than presenting it as universal.

## Coverage

You must actually read every one of the {{CHAPTER_COUNT}} chapter files listed above using your Read tool — do not guess or extrapolate from a subset. If you are genuinely unable to read all of them (e.g. a hard limit is reached), say exactly which chapters you did and didn't read in the `## Coverage` section of your output, rather than silently presenting partial coverage as complete.

## Output Format

Respond with a single Markdown document (no other commentary before or after it) using this structure:

```
# {{TARGET_LANGUAGE}} Book Conventions

## Placeholder Notation
...

## Content Section Markers
...

## Exercise Section Markers (skip these)
...

## Other Notes
...

## Coverage
Which chapters were actually read — should be all {{CHAPTER_COUNT}}, unless noted otherwise above.
```

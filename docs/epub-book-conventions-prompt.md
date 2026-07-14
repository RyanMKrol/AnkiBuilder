# Overview

Read EVERY chapter file listed below yourself, using your Read tool, in order. Read each chapter file in FULL, start to end — every page/section inside it, not just the opening portion. If a chapter file is long enough that your Read tool would otherwise truncate it (e.g. a default line-count limit), issue additional reads with an offset to cover the rest of that same file before moving on to the next chapter — never treat a partial read of a chapter as if you'd read the whole thing. This is a {{TARGET_LANGUAGE}}-language textbook for English speakers, split across {{CHAPTER_COUNT}} chapter files:

{{CHAPTER_FILE_PATHS}}

You are NOT extracting vocabulary here. A separate process extracts flashcard vocabulary one chapter at a time; your job is to characterize the STRUCTURAL CONVENTIONS this specific book uses, so that process can be told what to expect before it starts, instead of re-guessing these conventions from scratch on every single chapter.

## Why

Different textbooks format the same kind of content differently — how they mark a fill-in-the-blank placeholder, how they visually distinguish real teaching content from practice drills, how they label key/model sentences. A per-chapter extraction pass only ever sees one chapter at a time and has to infer these conventions fresh every call, which risks being slow, inconsistent between chapters, or simply wrong when a convention only becomes clear by seeing it repeat across several chapters. Your job is to do that inference ONCE, thoroughly, across the whole book, and write it down clearly enough that a future process can rely on it without re-deriving it.

## What to look for

- **Placeholder / fill-in-the-blank notation** — this is really two distinct questions; check both separately, don't assume answering one answers the other:
  - **Pattern-template blanks**: how does the book mark a fill-in-the-blank slot inside a full grammar-pattern _template_, or a drill/exercise/quiz (e.g. bolded English gloss words, blank spans, underscores, bracketed text like "[noun]")?
  - **Attachment-point markers on individual entries**: does the book ever mark a SINGLE vocabulary or grammar entry as a prefix or suffix using a symbol directly attached to the morpheme (e.g. a wave dash before or after it, like "〜さん" or "お〜")? This can appear on its own in a vocabulary table row, not just inside a larger sentence pattern — check vocabulary tables specifically, not only pattern/template sections.

  Give real examples you found for each, with the exact characters used.

- **Content markup**: what does a genuine teaching section look like structurally — vocabulary lists, key/model sentences, dialogue? Note recurring CSS classes, heading patterns, or tag structures that reliably signal "this is real content."
- **Exercise/drill markup**: what does a practice exercise or drill section look like structurally, that should be SKIPPED rather than extracted? Note how to distinguish it from genuine content.
- **Anything else structurally consistent** across chapters that would help a future single-chapter extraction pass — e.g. how chapters are titled/numbered, where vocabulary is glossed vs. inferred from context, recurring section labels.

If a convention only shows up in some chapters, say so and name which ones, rather than presenting it as universal.

## Coverage

You must actually read every one of the {{CHAPTER_COUNT}} chapter files listed above using your Read tool — do not guess or extrapolate from a subset. This also means reading each chapter file in its entirety, not just its first page or first portion — a chapter file you only partially read counts as unread for the parts you skipped. If you are genuinely unable to read all of a chapter, or all of the chapters (e.g. a hard limit is reached), say exactly which chapters — and which parts of them — you did and didn't read in the `## Coverage` section of your output, rather than silently presenting partial coverage as complete.

## Output Format

Respond with a single Markdown document (no other commentary before or after it) using this structure:

```
# {{TARGET_LANGUAGE}} Book Conventions

## Placeholder Notation
### Pattern-Template Blanks
...

### Attachment-Point Markers (prefixes/suffixes on individual entries)
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

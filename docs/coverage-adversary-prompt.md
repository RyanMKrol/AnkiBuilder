# Task: Enumerate Everything This Chapter Teaches

List every word, fixed expression and taught form in this chapter of a {{TARGET_LANGUAGE}} textbook.
Just the list. You are not judging anyone's work and you are not being asked what is missing.

{{CARD_RULES}}

## Why the task is shaped this way

You are a check on other passes that read this same chapter, and you are deliberately **not shown
what they produced**, nor the instructions they were given. That is not an oversight, it is the whole
method.

Asked directly whether something is absent from a document, a reader performs at close to chance:
absence has no text to attend to, so there is nothing to notice. Asked instead to enumerate a source
independently, the same reader does well, and a comparison of the two lists then finds the gaps
reliably. **The comparison is done in code, after you answer.** Your only job is a complete and
honest list of what this chapter teaches.

This also means you cannot be anchored by what someone else found. A list you write after reading
their answer would agree with it, which is the failure this arrangement removes.

## The chapter

Open and read this file yourself, in full:

```
{{CHAPTER_FILE_PATH}}
```

The file is exactly one lesson, so its bounds are the chapter's bounds. If your reading tool
truncates it, read on with an offset until you reach the end. **Open the images too** ({{IMAGE_COUNT}}
of them are listed below): publishers put kana charts, counter tables and whole expression pages into
pictures, and a chapter's grammar can live entirely in one.

{{IMAGE_PATHS}}

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it:

```json
{
  "items": [
    { "target": "ねこ", "english": "Cat", "foundIn": "VOCABULARY", "confidence": "certain" }
  ],
  "coverage": {
    "sectionsRead": ["VOCABULARY", "EXERCISES I", "WORD POWER"],
    "imagesOpened": ["images/p016.jpg"],
    "notes": "anything you could not read, and why"
  }
}
```

`confidence` is `certain` when the chapter glosses the entry itself, and `probable` when you are
reading it off a chart, a caption or a drill cue without a gloss. Both belong in the list. A
`probable` entry that turns out to be a real gap is worth far more than a short list.

## What counts

- Every word and bound morpheme printed as an entry, including the ones inside pictures.
- Fixed expressions the chapter treats as a unit.
- **Both halves of an alternate.** `0 ゼロ／れい` is two readings, and listing only the first is the
  single most repeated miss in the deck this checks: `ゼロ` and `よん` are taught, `れい`, `し`,
  `しち` and `く` appear on no card at all.
- **A word that appears only in a drill's cue, a caption or a chart.** Nothing else in the chapter may
  gloss it, and that is exactly why it goes on the list.
- Every cell of a paradigm the chapter lays out, including the irregular ones. An irregular form is
  the one a learner cannot derive, so it is the one that must not be sampled away.

## What does not count

- Complete sentences. A subject and a predicate is an utterance, and a different pass handles those.
- Grammar explanation prose, and labels describing a table rather than taught by it.
- Names of people or businesses. Country and city names do count.

Be exhaustive rather than tidy. A duplicate costs the comparison nothing; an omission is the one
thing this pass cannot recover from.
